/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { db } from './store.ts';
import { auditService } from './audit.ts';
import { distributedCluster } from './distributed.ts';
import {
  BankAccount,
  EntryDirection,
  LedgerEntry,
  TransactionRecord,
  UserRole,
} from './types.ts';

export interface LedgerPostingInstruction {
  accountId: string;
  direction: EntryDirection;
  amount: number;
  description: string;
  nodeId?: string;
}

export class LedgerService {
  /**
   * Recalculates the posted balance of an account strictly from its historical ledger entries.
   * For customer accounts (Liabilities): Credits increase balance, Debits decrease balance.
   * For asset accounts (Vault/Clearing): Debits increase asset or reflect outflows as per chart convention.
   * Standard customer accounts: Net Balance = Sum(Credits) - Sum(Debits).
   */
  public calculateAccountBalance(accountId: string): number {
    const account = db.accounts.get(accountId);
    const entries = db.ledgerEntries.filter((e) => e.accountId === accountId);
    let balance = 0;
    for (const e of entries) {
      if (account?.type === 'VAULT_RESERVE') {
        // Asset normal balance is DEBIT: Debits increase asset, Credits decrease asset
        if (e.direction === 'DEBIT') {
          balance += e.amount;
        } else {
          balance -= e.amount;
        }
      } else {
        // Customer liabilities, fee income, clearing: normal balance is CREDIT
        // Credits increase customer deposits, Debits decrease customer deposits
        if (e.direction === 'CREDIT') {
          balance += e.amount;
        } else {
          balance -= e.amount;
        }
      }
    }
    // Round to 2 decimal places to avoid floating point anomalies
    return Math.round(balance * 100) / 100;
  }

  /**
   * Post a balanced double-entry transaction.
   * Enforces that sum(Debits) === sum(Credits).
   */
  public postBalancedJournal(params: {
    transactionId: string;
    instructions: LedgerPostingInstruction[];
    isReversal?: boolean;
    reversalReason?: string;
    nodeId?: string;
  }): LedgerEntry[] {
    const { transactionId, instructions, isReversal } = params;
    const committedNodeId = params.nodeId || distributedCluster.getLeaderNode().id;

    let totalDebits = 0;
    let totalCredits = 0;

    for (const inst of instructions) {
      if (inst.amount <= 0) {
        throw new Error(`Ledger entry amount must be strictly positive. Got: ${inst.amount}`);
      }
      const roundedAmount = Math.round(inst.amount * 100) / 100;
      if (inst.direction === 'DEBIT') {
        totalDebits += roundedAmount;
      } else if (inst.direction === 'CREDIT') {
        totalCredits += roundedAmount;
      }
    }

    const diff = Math.abs(Math.round((totalDebits - totalCredits) * 100) / 100);
    if (diff > 0.0001) {
      throw new Error(
        `Ledger invariant violation: Journal entry does not balance! Total Debits (₹${totalDebits.toFixed(
          2
        )}) !== Total Credits (₹${totalCredits.toFixed(2)})`
      );
    }

    const createdEntries: LedgerEntry[] = [];
    const timestamp = new Date().toISOString();

    for (const inst of instructions) {
      const account = db.accounts.get(inst.accountId);
      if (!account) {
        throw new Error(`Account not found for ledger posting: ${inst.accountId}`);
      }

      // Calculate new running balance for this account
      const previousBalance = this.calculateAccountBalance(account.id);
      const newBalance =
        account.type === 'VAULT_RESERVE'
          ? inst.direction === 'DEBIT'
            ? Math.round((previousBalance + inst.amount) * 100) / 100
            : Math.round((previousBalance - inst.amount) * 100) / 100
          : inst.direction === 'CREDIT'
          ? Math.round((previousBalance + inst.amount) * 100) / 100
          : Math.round((previousBalance - inst.amount) * 100) / 100;

      const entry: LedgerEntry = {
        id: `LEDG-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        transactionId,
        sequenceNumber: db.ledgerEntries.length + 1,
        accountId: account.id,
        accountNumber: account.accountNumber,
        direction: inst.direction,
        amount: Math.round(inst.amount * 100) / 100,
        currency: 'INR',
        runningBalanceAfter: newBalance,
        entryType: isReversal ? 'REVERSING' : 'STANDARD',
        description: inst.description,
        nodeId: inst.nodeId || committedNodeId,
        createdAt: timestamp,
      };

      db.ledgerEntries.push(entry);
      createdEntries.push(entry);

      // Sync account cached posted balance
      account.postedBalance = newBalance;
      account.availableBalance = Math.round((newBalance - account.holdsAmount) * 100) / 100;
    }

    // Increment Raft distributed log commit index
    distributedCluster.incrementLogIndex();

    return createdEntries;
  }

  /**
   * Reverses an existing posted transaction by creating complementary opposite ledger entries.
   * Never deletes or overwrites the original record!
   */
  public reverseTransaction(params: {
    transactionId: string;
    actorUserId: string;
    actorName: string;
    actorRole: UserRole;
    reason: string;
  }): TransactionRecord {
    const original = db.transactions.get(params.transactionId);
    if (!original) {
      throw new Error(`Transaction ${params.transactionId} not found`);
    }

    if (original.status !== 'POSTED') {
      throw new Error(`Only POSTED transactions can be reversed. Current status: ${original.status}`);
    }

    if (original.isReversal) {
      throw new Error(`Cannot reverse a transaction that is already a reversal.`);
    }

    if (original.reversalTransactionId) {
      throw new Error(`Transaction has already been reversed by ${original.reversalTransactionId}`);
    }

    const leader = distributedCluster.getLeaderNode();
    const reversalTxnId = `TXN-REV-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const reversalRef = `REV-${original.referenceNumber}`;
    const timestamp = new Date().toISOString();
    const reversalRrn = distributedCluster.generateRrn();
    const traceId = distributedCluster.createTraceId('REVERSAL');

    // Mirror original entries with opposite direction
    const reversalInstructions: LedgerPostingInstruction[] = original.ledgerEntries.map((e) => ({
      accountId: e.accountId,
      direction: e.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      amount: e.amount,
      description: `Reversal of [${original.referenceNumber}]: ${params.reason}`,
      nodeId: leader.id,
    }));

    const reversalLedgerEntries = this.postBalancedJournal({
      transactionId: reversalTxnId,
      instructions: reversalInstructions,
      isReversal: true,
      reversalReason: params.reason,
      nodeId: leader.id,
    });

    const raw = `${reversalTxnId}|${original.amount}|${original.destinationAccountId}|${original.sourceAccountId}|${timestamp}`;
    const hashDigest = crypto.createHash('sha256').update(raw).digest('hex');

    const reversalTxn: TransactionRecord = {
      id: reversalTxnId,
      referenceNumber: reversalRef,
      rrn: reversalRrn,
      sourceAccountId: original.destinationAccountId,
      destinationAccountId: original.sourceAccountId,
      sourceAccountMasked: original.destinationAccountMasked,
      destinationAccountMasked: original.sourceAccountMasked,
      beneficiaryName: `Reversal: ${original.beneficiaryName}`,
      beneficiaryUpiOrIfsc: original.beneficiaryUpiOrIfsc,
      amount: original.amount,
      fee: 0,
      currency: 'INR',
      type: 'REVERSAL',
      status: 'POSTED',
      description: `Reversing entry for ${original.referenceNumber}. Reason: ${params.reason}`,
      initiatedByUserId: params.actorUserId,
      createdAt: timestamp,
      postedAt: timestamp,
      isReversal: true,
      reversalOfTransactionId: original.id,
      ledgerEntries: reversalLedgerEntries,
      hashDigest,
      distributedTraceId: traceId,
      primaryNodeId: leader.id,
      sagaSteps: [
        {
          step: '1. SAGA_COMPENSATION_TRIGGERED',
          participant: 'DisputeLedgerService',
          nodeId: leader.id,
          status: 'SUCCESS',
          timestamp,
          details: params.reason,
        },
        {
          step: '2. REVERSING_DOUBLE_ENTRY_COMMITTED',
          participant: 'LedgerService',
          nodeId: leader.id,
          status: 'SUCCESS',
          timestamp: new Date().toISOString(),
        },
      ],
    };

    db.transactions.set(reversalTxn.id, reversalTxn);

    // Update original transaction state
    original.status = 'REVERSED';
    original.reversedAt = timestamp;
    original.reversalReason = params.reason;
    original.reversalTransactionId = reversalTxn.id;

    // Record audit trail
    auditService.record({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      actorName: params.actorName,
      action: 'TRANSACTION_REVERSED',
      targetType: 'TRANSACTION',
      targetId: original.id,
      nodeId: leader.id,
      details: {
        originalTransactionId: original.id,
        reversalTransactionId: reversalTxn.id,
        amount: original.amount,
        reason: params.reason,
        rrn: reversalRrn,
        traceId,
      },
    });

    return reversalTxn;
  }

  /**
   * Live Ledger Invariant Audit
   * Confirms:
   * 1. Sum of all DEBITs === Sum of all CREDITs in the entire ledger history
   * 2. Every single transaction has matching debits and credits
   * 3. Every account's cached postedBalance matches its derived ledger balance
   */
  public auditLedgerIntegrity(): {
    isHealthy: boolean;
    totalDebitAmount: number;
    totalCreditAmount: number;
    discrepancyDelta: number;
    totalLedgerEntries: number;
    totalTransactions: number;
    unbalancedTransactions: string[];
    accountDiscrepancies: Array<{
      accountId: string;
      accountNumber: string;
      cachedBalance: number;
      derivedBalance: number;
      drift: number;
    }>;
    timestamp: string;
  } {
    let totalDebitAmount = 0;
    let totalCreditAmount = 0;

    for (const entry of db.ledgerEntries) {
      if (entry.direction === 'DEBIT') {
        totalDebitAmount += entry.amount;
      } else {
        totalCreditAmount += entry.amount;
      }
    }

    totalDebitAmount = Math.round(totalDebitAmount * 100) / 100;
    totalCreditAmount = Math.round(totalCreditAmount * 100) / 100;
    const discrepancyDelta = Math.abs(Math.round((totalDebitAmount - totalCreditAmount) * 100) / 100);

    // Check individual transactions
    const unbalancedTransactions: string[] = [];
    for (const [txnId, txn] of db.transactions.entries()) {
      if (txn.status === 'POSTED' || txn.status === 'REVERSED') {
        let dr = 0;
        let cr = 0;
        for (const e of txn.ledgerEntries) {
          if (e.direction === 'DEBIT') dr += e.amount;
          if (e.direction === 'CREDIT') cr += e.amount;
        }
        if (Math.abs(Math.round((dr - cr) * 100) / 100) > 0.001) {
          unbalancedTransactions.push(txnId);
        }
      }
    }

    // Check account balances
    const accountDiscrepancies: Array<{
      accountId: string;
      accountNumber: string;
      cachedBalance: number;
      derivedBalance: number;
      drift: number;
    }> = [];

    for (const account of db.accounts.values()) {
      const derived = this.calculateAccountBalance(account.id);
      const drift = Math.abs(Math.round((derived - account.postedBalance) * 100) / 100);
      if (drift > 0.001) {
        accountDiscrepancies.push({
          accountId: account.id,
          accountNumber: account.accountNumber,
          cachedBalance: account.postedBalance,
          derivedBalance: derived,
          drift,
        });
      }
    }

    const isHealthy =
      discrepancyDelta === 0 && unbalancedTransactions.length === 0 && accountDiscrepancies.length === 0;

    return {
      isHealthy,
      totalDebitAmount,
      totalCreditAmount,
      discrepancyDelta,
      totalLedgerEntries: db.ledgerEntries.length,
      totalTransactions: db.transactions.size,
      unbalancedTransactions,
      accountDiscrepancies,
      timestamp: new Date().toISOString(),
    };
  }
}

export const ledgerService = new LedgerService();
