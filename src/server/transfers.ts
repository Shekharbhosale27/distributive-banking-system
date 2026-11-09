/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { db } from './store.ts';
import { ledgerService, LedgerPostingInstruction } from './ledger.ts';
import { auditService } from './audit.ts';
import { distributedCluster } from './distributed.ts';
import {
  BankAccount,
  IdempotencyRecord,
  OutboxEvent,
  SagaTraceStep,
  TransactionRecord,
  TransactionType,
  User,
} from './types.ts';

export interface ExecuteTransferRequest {
  sourceAccountId: string;
  destinationAccountId?: string;
  destinationUpiId?: string;
  destinationIfscCode?: string;
  destinationAccountNumber?: string;
  externalRoutingNumber?: string;
  externalAccountNumber?: string;
  beneficiaryName: string;
  beneficiaryUpiOrIfsc?: string;
  amount: number;
  type: TransactionType;
  description: string;
  idempotencyKey: string;
  user: User;
  ipAddress?: string;
}

export class TransferService {
  /**
   * Helper to mask account number for safe display (Indian convention e.g. "•••• 0401")
   */
  public maskAccount(accountNumber: string, prefix = '••••'): string {
    const last4 = accountNumber.slice(-4);
    return `${prefix} ${last4}`;
  }

  /**
   * Orchestrates transfer execution with 2PC / Saga steps, idempotency, locks, Indian limits, and ledger journal posting.
   */
  public async executeTransfer(req: ExecuteTransferRequest): Promise<TransactionRecord> {
    const { idempotencyKey, user, amount, type, description, beneficiaryName } = req;
    const leader = distributedCluster.getLeaderNode();

    // 1. Validate Input
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new Error('Idempotency key is required for financial transfers');
    }
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new Error('Transfer amount must be a positive number greater than 0');
    }
    const transferAmount = Math.round(amount * 100) / 100;
    if (transferAmount < 1.0) {
      throw new Error('Minimum transfer amount is ₹1.00');
    }

    // RTGS Minimum Validation: Under RBI rules, RTGS is meant for high-value transactions >= ₹2,00,000
    if (type === 'RTGS' && transferAmount < 200000.0) {
      throw new Error('RTGS (Real Time Gross Settlement) requires a minimum transfer amount of ₹2,00,000.00. Use IMPS, UPI, or NEFT for lower amounts.');
    }

    // 2. Idempotency Check
    const cachedRecord = db.idempotencyRecords.get(idempotencyKey);
    if (cachedRecord) {
      if (cachedRecord.status === 'COMPLETED' && cachedRecord.responsePayload) {
        console.log(`[IDEMPOTENCY] Replay detected for key ${idempotencyKey}. Returning original cached response.`);
        return cachedRecord.responsePayload as TransactionRecord;
      }
      if (cachedRecord.status === 'PROCESSING') {
        throw new Error('A concurrent transfer with this idempotency key is currently processing. Please wait.');
      }
    }

    // Mark key as PROCESSING
    const idempotencyEntry: IdempotencyRecord = {
      key: idempotencyKey,
      userId: user.id,
      requestHash: crypto
        .createHash('sha256')
        .update(`${user.id}|${req.sourceAccountId}|${transferAmount}|${idempotencyKey}`)
        .digest('hex'),
      status: 'PROCESSING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.idempotencyRecords.set(idempotencyKey, idempotencyEntry);

    try {
      // 3. Resolve Destination Account
      let destinationAccount: BankAccount | undefined;
      let isExternal = false;
      const targetAccNum = req.destinationAccountNumber || req.externalAccountNumber;
      const targetIfsc = req.destinationIfscCode || req.externalRoutingNumber;

      if (req.destinationAccountId) {
        destinationAccount = db.accounts.get(req.destinationAccountId);
      } else if (req.destinationUpiId) {
        // Find if destination UPI ID matches internal user account
        const upiMatch = Array.from(db.accounts.values()).find((a) => a.upiId.toLowerCase() === req.destinationUpiId?.toLowerCase());
        if (upiMatch) {
          destinationAccount = upiMatch;
        } else {
          isExternal = true;
          destinationAccount = db.accounts.get('acc_clearing_upi');
        }
      } else if (targetAccNum) {
        // Find if internal account matches account number & IFSC
        const internalMatch = Array.from(db.accounts.values()).find(
          (a) => a.accountNumber === targetAccNum && (!targetIfsc || a.ifscCode === targetIfsc)
        );
        if (internalMatch) {
          destinationAccount = internalMatch;
        } else {
          isExternal = true;
          const clearingId = type === 'RTGS' ? 'acc_clearing_rtgs' : 'acc_clearing_upi';
          destinationAccount = db.accounts.get(clearingId);
          if (!destinationAccount) {
            throw new Error(`Clearing account ${clearingId} not initialized`);
          }
        }
      }

      if (!destinationAccount) {
        throw new Error('Destination account or VPA could not be resolved');
      }

      const sourceAccountId = req.sourceAccountId;
      const destinationAccountId = destinationAccount.id;

      if (sourceAccountId === destinationAccountId) {
        throw new Error('Source and destination accounts cannot be identical');
      }

      // Calculate fees (Indian standard: RTGS = ₹25.00 RBI fee; IMPS = ₹5.00; UPI & Internal = ₹0.00)
      let fee = 0.0;
      if (type === 'RTGS') fee = 25.0;
      else if (type === 'IMPS' && isExternal) fee = 5.0;

      const totalOutflow = Math.round((transferAmount + fee) * 100) / 100;

      // 4. Concurrency Lock & Execution
      const result = await db.acquireLocks([sourceAccountId, destinationAccountId], async () => {
        const sourceAccount = db.accounts.get(sourceAccountId);
        if (!sourceAccount) {
          throw new Error('Source account not found');
        }

        // Authorization check: User must own the source account unless staff/admin
        if (sourceAccount.userId !== user.id && user.role === 'CUSTOMER') {
          throw new Error('Access denied: You do not have authorization to debit this account');
        }

        // Account status check
        if (sourceAccount.status !== 'ACTIVE') {
          throw new Error(`Source account is currently ${sourceAccount.status} and cannot process transfers`);
        }

        // KYC check: Restrict large transfers for unverified users
        if (user.role === 'CUSTOMER' && user.kycStatus !== 'VERIFIED') {
          if (transferAmount > 50000.0) {
            throw new Error(
              `KYC Verification required: Transfers above ₹50,000.00 require verified PAN/Aadhaar status (Current status: ${user.kycStatus})`
            );
          }
        }

        // Limit Checks
        if (transferAmount > sourceAccount.perTransactionLimit) {
          throw new Error(
            `Transaction exceeds per-transfer limit of ₹${sourceAccount.perTransactionLimit.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
            })}`
          );
        }

        if (sourceAccount.dailyTransferredAmount + transferAmount > sourceAccount.dailyTransferLimit) {
          throw new Error(
            `Daily transfer limit reached. Remaining daily limit: ₹${(
              sourceAccount.dailyTransferLimit - sourceAccount.dailyTransferredAmount
            ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          );
        }

        // Insufficient funds check (Available balance = postedBalance - holdsAmount)
        if (sourceAccount.availableBalance < totalOutflow) {
          throw new Error(
            `Insufficient funds. Available balance: ₹${sourceAccount.availableBalance.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
            })}, required: ₹${totalOutflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          );
        }

        // 5. Distributed 2PC / Saga Orchestration
        const timestamp = new Date().toISOString();
        const txnId = `TXN-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
        const refPrefix = type === 'UPI' ? 'UPI' : type === 'IMPS' ? 'IMPS' : type === 'RTGS' ? 'RTGS' : type === 'NEFT' ? 'NEFT' : 'TXN';
        const refNum = `${refPrefix}-2026-${Math.floor(100000 + Math.random() * 900000)}`;
        const rrn = distributedCluster.generateRrn();
        const traceId = distributedCluster.createTraceId(type);

        const sagaSteps: SagaTraceStep[] = [
          {
            step: '1. LOCAL_HOLD_PREPARED',
            participant: 'LocalDebitParticipant',
            nodeId: leader.id,
            status: 'SUCCESS',
            timestamp,
            details: `Prepared debit hold on account ${this.maskAccount(sourceAccount.accountNumber)}`,
          },
          {
            step: type === 'UPI'
              ? '2. NPCI_UPI_SWITCH_DISPATCHED'
              : type === 'RTGS'
              ? '2. RBI_RTGS_GROSS_SETTLEMENT_ROUTED'
              : type === 'IMPS'
              ? '2. NPCI_IMPS_FAST_CLEARING_SWITCH'
              : '2. INTERNAL_CONSENSUS_REPLICATED',
            participant: type === 'RTGS' ? 'RBI_RTGS_Gateway' : 'NPCI_Clearing_Gateway',
            nodeId: leader.id,
            status: 'SUCCESS',
            timestamp: new Date().toISOString(),
            details: `Dispatched with RRN ${rrn} to interbank network`,
          },
          {
            step: '3. BENEFICIARY_NODE_ACK',
            participant: 'BeneficiaryCreditParticipant',
            nodeId: 'node-blr-dc2',
            status: 'SUCCESS',
            timestamp: new Date().toISOString(),
            details: `Credit acknowledged by recipient endpoint`,
          },
          {
            step: '4. DOUBLE_ENTRY_COMMITTED',
            participant: 'RaftCoreConsensus',
            nodeId: leader.id,
            status: 'SUCCESS',
            timestamp: new Date().toISOString(),
            details: `Committed across quorum nodes (Mumbai & Bengaluru)`,
          },
        ];

        // 6. Construct Double-Entry Journal Instructions
        const instructions: LedgerPostingInstruction[] = [
          {
            accountId: sourceAccount.id,
            direction: 'DEBIT',
            amount: transferAmount,
            description: `Transfer to ${beneficiaryName} [${req.beneficiaryUpiOrIfsc || type}]: ${description || 'Funds Transfer'}`,
            nodeId: leader.id,
          },
          {
            accountId: destinationAccount.id,
            direction: 'CREDIT',
            amount: transferAmount,
            description: `Credit from ${this.maskAccount(sourceAccount.accountNumber)}: ${
              description || 'Funds Transfer'
            }`,
            nodeId: leader.id,
          },
        ];

        // If fee applies (e.g. RTGS or IMPS), append fee journal entries
        if (fee > 0) {
          const feeAccount = db.accounts.get('acc_fee_revenue');
          if (!feeAccount) throw new Error('Fee revenue account not found');
          instructions.push({
            accountId: sourceAccount.id,
            direction: 'DEBIT',
            amount: fee,
            description: `${type} transfer processing fee for [${refNum}]`,
            nodeId: leader.id,
          });
          instructions.push({
            accountId: feeAccount.id,
            direction: 'CREDIT',
            amount: fee,
            description: `Fee revenue for ${type} [${refNum}]`,
            nodeId: leader.id,
          });
        }

        // Post to immutable ledger
        const ledgerEntries = ledgerService.postBalancedJournal({
          transactionId: txnId,
          instructions,
          nodeId: leader.id,
        });

        // Update daily cumulative
        sourceAccount.dailyTransferredAmount += transferAmount;

        const raw = `${txnId}|${transferAmount}|${sourceAccount.id}|${destinationAccount.id}|${timestamp}`;
        const hashDigest = crypto.createHash('sha256').update(raw).digest('hex');

        const transaction: TransactionRecord = {
          id: txnId,
          referenceNumber: refNum,
          rrn,
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destinationAccount.id,
          sourceAccountMasked: this.maskAccount(sourceAccount.accountNumber),
          destinationAccountMasked: isExternal
            ? req.destinationUpiId || this.maskAccount(targetAccNum || destinationAccount.accountNumber)
            : this.maskAccount(destinationAccount.accountNumber),
          beneficiaryName,
          beneficiaryUpiOrIfsc: req.beneficiaryUpiOrIfsc || req.destinationUpiId || targetIfsc,
          amount: transferAmount,
          fee,
          currency: 'INR',
          type,
          status: 'POSTED',
          description: description || 'Transfer',
          idempotencyKey,
          initiatedByUserId: user.id,
          createdAt: timestamp,
          postedAt: timestamp,
          ledgerEntries,
          hashDigest,
          distributedTraceId: traceId,
          primaryNodeId: leader.id,
          sagaSteps,
        };

        db.transactions.set(txnId, transaction);

        // Record Audit
        auditService.record({
          actorUserId: user.id,
          actorRole: user.role,
          actorName: user.name,
          action: 'TRANSFER_EXECUTED',
          targetType: 'TRANSACTION',
          targetId: txnId,
          nodeId: leader.id,
          ipAddress: req.ipAddress,
          details: {
            referenceNumber: refNum,
            rrn,
            amount: transferAmount,
            fee,
            type,
            sourceAccount: this.maskAccount(sourceAccount.accountNumber),
            destinationAccount: transaction.destinationAccountMasked,
            idempotencyKey,
            traceId,
          },
        });

        // Outbox event for asynchronous publishing
        const outboxTopic = type === 'UPI' ? 'novabank.in.upi.clearing' : type === 'RTGS' ? 'novabank.in.rtgs.gross' : 'novabank.in.ledger.postings';
        const outboxEvent: OutboxEvent = {
          id: `EVT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          eventType: 'TRANSACTION_POSTED',
          topic: outboxTopic,
          payload: {
            transactionId: txnId,
            referenceNumber: refNum,
            rrn,
            amount: transferAmount,
            userId: user.id,
            traceId,
          },
          status: 'PROCESSED',
          retryCount: 0,
          maxRetries: 3,
          createdAt: timestamp,
          processedAt: timestamp,
        };
        db.outboxEvents.unshift(outboxEvent);

        return transaction;
      });

      // Mark Idempotency as COMPLETED
      idempotencyEntry.status = 'COMPLETED';
      idempotencyEntry.responsePayload = result;
      idempotencyEntry.transactionId = result.id;
      idempotencyEntry.updatedAt = new Date().toISOString();

      return result;
    } catch (err: unknown) {
      idempotencyEntry.status = 'FAILED';
      idempotencyEntry.updatedAt = new Date().toISOString();
      const message = err instanceof Error ? err.message : 'Transfer failed';
      throw new Error(message);
    }
  }

  /**
   * Simulate a card or wire hold placement (e.g. ₹2,500 Bharat Petroleum pre-auth)
   */
  public placeHold(params: {
    accountId: string;
    amount: number;
    merchantOrReason: string;
    actorUserId: string;
  }): BankAccount {
    const account = db.accounts.get(params.accountId);
    if (!account) throw new Error('Account not found');

    if (account.availableBalance < params.amount) {
      throw new Error('Insufficient available balance to place hold');
    }

    account.holdsAmount = Math.round((account.holdsAmount + params.amount) * 100) / 100;
    account.availableBalance = Math.round((account.postedBalance - account.holdsAmount) * 100) / 100;

    const leader = distributedCluster.getLeaderNode();
    auditService.record({
      actorUserId: params.actorUserId,
      actorRole: 'STAFF',
      actorName: 'Core Banking Engine',
      action: 'HOLD_PLACED',
      targetType: 'ACCOUNT',
      targetId: account.id,
      nodeId: leader.id,
      details: {
        holdAmount: params.amount,
        reason: params.merchantOrReason,
        newHoldsAmount: account.holdsAmount,
        newAvailableBalance: account.availableBalance,
      },
    });

    return account;
  }

  /**
   * Release an active hold
   */
  public releaseHold(params: {
    accountId: string;
    amount: number;
    actorUserId: string;
  }): BankAccount {
    const account = db.accounts.get(params.accountId);
    if (!account) throw new Error('Account not found');

    account.holdsAmount = Math.max(0, Math.round((account.holdsAmount - params.amount) * 100) / 100);
    account.availableBalance = Math.round((account.postedBalance - account.holdsAmount) * 100) / 100;

    const leader = distributedCluster.getLeaderNode();
    auditService.record({
      actorUserId: params.actorUserId,
      actorRole: 'STAFF',
      actorName: 'Core Banking Engine',
      action: 'HOLD_RELEASED',
      targetType: 'ACCOUNT',
      targetId: account.id,
      nodeId: leader.id,
      details: {
        releasedAmount: params.amount,
        newHoldsAmount: account.holdsAmount,
        newAvailableBalance: account.availableBalance,
      },
    });

    return account;
  }
}

export const transferService = new TransferService();
