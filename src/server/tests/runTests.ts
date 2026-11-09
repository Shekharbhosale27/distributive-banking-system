/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../store.ts';
import { ledgerService } from '../ledger.ts';
import { transferService } from '../transfers.ts';
import { distributedCluster } from '../distributed.ts';
import { User } from '../types.ts';

export interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export async function runAllBankingTests(): Promise<{
  success: boolean;
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  const results: TestResult[] = [];

  // Reset database to known seed baseline before running suite
  db.seed();

  // Test 1: Double-Entry Balanced Ledger Invariant (INR)
  {
    const start = Date.now();
    try {
      const audit = ledgerService.auditLedgerIntegrity();
      if (!audit.isHealthy || audit.discrepancyDelta !== 0) {
        throw new Error(`Ledger not balanced! Delta: ₹${audit.discrepancyDelta}`);
      }
      results.push({
        name: 'Double-Entry Ledger Integrity (Sum(Dr) === Sum(Cr))',
        passed: true,
        durationMs: Date.now() - start,
        message: `Verified ${audit.totalLedgerEntries} journal entries across ${audit.totalTransactions} transactions. Delta = ₹0.00`,
        details: { totalDebits: audit.totalDebitAmount, totalCredits: audit.totalCreditAmount },
      });
    } catch (e: unknown) {
      results.push({
        name: 'Double-Entry Ledger Integrity (Sum(Dr) === Sum(Cr))',
        passed: false,
        durationMs: Date.now() - start,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Test 2: Idempotency Protection (Duplicate Transfer Prevention on UPI Rail)
  {
    const start = Date.now();
    try {
      const elena = db.users.get('user_elena_vance')!;
      const key = `TEST-IDEMP-${Date.now()}`;

      // First call (₹10,000 via UPI)
      const txn1 = await transferService.executeTransfer({
        sourceAccountId: 'acc_elena_chk',
        destinationAccountId: 'acc_elena_sav',
        beneficiaryName: 'Savings Reserve',
        amount: 10000.0,
        type: 'UPI',
        description: 'Test UPI transfer 1',
        idempotencyKey: key,
        user: elena,
      });

      const checkingBalanceAfterFirst = db.accounts.get('acc_elena_chk')!.postedBalance;

      // Duplicate retry call with same idempotency key
      const txn2 = await transferService.executeTransfer({
        sourceAccountId: 'acc_elena_chk',
        destinationAccountId: 'acc_elena_sav',
        beneficiaryName: 'Savings Reserve',
        amount: 10000.0,
        type: 'UPI',
        description: 'Test duplicate retry attempt',
        idempotencyKey: key,
        user: elena,
      });

      const checkingBalanceAfterSecond = db.accounts.get('acc_elena_chk')!.postedBalance;

      if (txn1.id !== txn2.id) {
        throw new Error(`Idempotency failed: Returned different transaction IDs (${txn1.id} vs ${txn2.id})`);
      }
      if (checkingBalanceAfterFirst !== checkingBalanceAfterSecond) {
        throw new Error(
          `Idempotency failed: Balance deducted twice (₹${checkingBalanceAfterFirst} -> ₹${checkingBalanceAfterSecond})`
        );
      }

      results.push({
        name: 'Idempotency Protection (Duplicate Retries Prevented)',
        passed: true,
        durationMs: Date.now() - start,
        message: `Replay of key ${key} returned identical transaction ${txn1.id} (RRN ${txn1.rrn}) with zero duplicate debit.`,
      });
    } catch (e: unknown) {
      results.push({
        name: 'Idempotency Protection (Duplicate Retries Prevented)',
        passed: false,
        durationMs: Date.now() - start,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Test 3: Insufficient Funds & Hold Protection
  {
    const start = Date.now();
    try {
      db.seed();
      const elena = db.users.get('user_elena_vance')!;
      const elenaAcc = db.accounts.get('acc_elena_chk')!;
      // Elena has postedBalance ₹4,85,020.00, holdsAmount ₹7,500.00, availableBalance ₹4,77,520.00
      // Requesting ₹4,80,000 is under the ₹4,85,020 posted balance, but exceeds the ₹4,77,520 available balance!
      const attemptedAmount = 480000.0;

      let threw = false;
      let errorMsg = '';
      try {
        await transferService.executeTransfer({
          sourceAccountId: 'acc_elena_chk',
          destinationAccountId: 'acc_elena_sav',
          beneficiaryName: 'Savings Reserve',
          amount: attemptedAmount,
          type: 'INTERNAL_TRANSFER',
          description: 'Transfer exceeding available balance with active hold',
          idempotencyKey: `TEST-OVERDRAFT-${Date.now()}`,
          user: elena,
        });
      } catch (err: unknown) {
        threw = true;
        errorMsg = err instanceof Error ? err.message : '';
      }

      if (!threw) {
        throw new Error('Transfer should have failed with Insufficient funds, but succeeded!');
      }
      if (!errorMsg.toLowerCase().includes('insufficient funds')) {
        throw new Error(`Expected insufficient funds error, but got: "${errorMsg}"`);
      }

      const balanceAfter = db.accounts.get('acc_elena_chk')!.postedBalance;
      if (balanceAfter !== elenaAcc.postedBalance) {
        throw new Error(`Posted balance altered after failed transfer: ${elenaAcc.postedBalance} !== ${balanceAfter}`);
      }

      results.push({
        name: 'Insufficient Funds & Hold Protection',
        passed: true,
        durationMs: Date.now() - start,
        message: `Blocked transfer of ₹${attemptedAmount.toLocaleString('en-IN')} when available balance is ₹${elenaAcc.availableBalance.toLocaleString('en-IN')} (₹${elenaAcc.holdsAmount.toLocaleString('en-IN')} on hold). Balance intact.`,
      });
    } catch (e: unknown) {
      results.push({
        name: 'Insufficient Funds & Hold Protection',
        passed: false,
        durationMs: Date.now() - start,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Test 4: Concurrency & Race-Condition Safe Mutex Locks
  {
    const start = Date.now();
    try {
      db.seed();
      const elena = db.users.get('user_elena_vance')!;
      // Elena has ~₹4,77,520.00 available.
      // Launch 5 parallel transfers of ₹1,20,000 each (total ₹6,00,000 > ₹4,77,520 available).
      // Only 3 should succeed (3 * 1,20,000 = 3,60,000; remaining balance ₹1,17,520 < 1,20,000).
      // 4th and 5th must fail safely due to insufficient funds.
      const amountPerAttempt = 120000.0;

      const attempts = Array.from({ length: 5 }, (_, i) =>
        transferService.executeTransfer({
          sourceAccountId: 'acc_elena_chk',
          destinationAccountId: 'acc_elena_sav',
          beneficiaryName: 'High Yield Savings',
          amount: amountPerAttempt,
          type: 'INTERNAL_TRANSFER',
          description: `Concurrent thread #${i + 1}`,
          idempotencyKey: `CONCURRENT-KEY-${i}-${Date.now()}`,
          user: elena,
        }).then(
          (t) => ({ status: 'fulfilled' as const, value: t }),
          (err) => ({ status: 'rejected' as const, reason: err.message })
        )
      );

      const outcomes = await Promise.all(attempts);
      const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');

      const finalBal = db.accounts.get('acc_elena_chk')!.availableBalance;
      if (finalBal < 0) {
        throw new Error(`Race condition triggered negative balance! Final balance: ₹${finalBal}`);
      }

      const audit = ledgerService.auditLedgerIntegrity();
      if (!audit.isHealthy) {
        throw new Error(`Ledger became unbalanced during concurrent execution! Delta: ${audit.discrepancyDelta}`);
      }

      results.push({
        name: 'Concurrent Race-Condition Mutex Lock Safety',
        passed: true,
        durationMs: Date.now() - start,
        message: `Processed 5 parallel transfers: ${succeeded.length} succeeded, ${rejected.length} safely blocked by funds. Final balance: ₹${finalBal.toLocaleString('en-IN')}. Ledger invariant preserved.`,
      });
    } catch (e: unknown) {
      results.push({
        name: 'Concurrent Race-Condition Mutex Lock Safety',
        passed: false,
        durationMs: Date.now() - start,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Test 5: Reversible Posting with Immutable Ledger
  {
    const start = Date.now();
    try {
      db.seed();
      const elena = db.users.get('user_elena_vance')!;
      const sarahStaff = db.users.get('user_sarah_jenkins')!;

      // Execute a transfer to reverse (₹25,000.00 via IMPS)
      const txn = await transferService.executeTransfer({
        sourceAccountId: 'acc_elena_chk',
        destinationAccountId: 'acc_elena_sav',
        beneficiaryName: 'Savings Reserve',
        amount: 25000.0,
        type: 'IMPS',
        description: 'Erroneous transfer to test reversal',
        idempotencyKey: `TEST-REV-SRC-${Date.now()}`,
        user: elena,
      });

      const checkingBalBeforeRev = db.accounts.get('acc_elena_chk')!.postedBalance;

      // Staff issues reversal
      const reversalTxn = ledgerService.reverseTransaction({
        transactionId: txn.id,
        actorUserId: sarahStaff.id,
        actorName: sarahStaff.name,
        actorRole: sarahStaff.role,
        reason: 'Customer initiated dispute on duplicate payment',
      });

      const originalAfterRev = db.transactions.get(txn.id)!;
      const checkingBalAfterRev = db.accounts.get('acc_elena_chk')!.postedBalance;

      if (originalAfterRev.status !== 'REVERSED') {
        throw new Error(`Original transaction status should be REVERSED, got ${originalAfterRev.status}`);
      }
      if (reversalTxn.type !== 'REVERSAL') {
        throw new Error(`Reversal transaction type should be REVERSAL`);
      }
      if (checkingBalAfterRev !== checkingBalBeforeRev + 25000.0) {
        throw new Error(
          `Balance not restored! Expected ${checkingBalBeforeRev + 25000.0}, got ${checkingBalAfterRev}`
        );
      }

      // Check ledger balance
      const audit = ledgerService.auditLedgerIntegrity();
      if (!audit.isHealthy) {
        throw new Error('Ledger unbalanced after reversal!');
      }

      results.push({
        name: 'Immutable Reversal Journal Entries',
        passed: true,
        durationMs: Date.now() - start,
        message: `Original txn ${txn.id} marked REVERSED, new opposite entry ${reversalTxn.id} posted. Ledger remains in equilibrium.`,
      });
    } catch (e: unknown) {
      results.push({
        name: 'Immutable Reversal Journal Entries',
        passed: false,
        durationMs: Date.now() - start,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Test 6: Authorization & RBAC Checks
  {
    const start = Date.now();
    try {
      const marcus = db.users.get('user_marcus_brody')!;
      let threw = false;

      try {
        // Marcus attempts to debit Elena's checking account!
        await transferService.executeTransfer({
          sourceAccountId: 'acc_elena_chk',
          destinationAccountId: 'acc_marcus_chk',
          beneficiaryName: 'Marcus Brody Patel',
          amount: 5000.0,
          type: 'UPI',
          description: 'Unauthorized cross-user debit attempt',
          idempotencyKey: `TEST-UNAUTH-${Date.now()}`,
          user: marcus,
        });
      } catch (err: unknown) {
        threw = true;
        const msg = err instanceof Error ? err.message : '';
        if (!msg.toLowerCase().includes('access denied') && !msg.toLowerCase().includes('authorization')) {
          throw new Error(`Unexpected message: ${msg}`);
        }
      }

      if (!threw) {
        throw new Error('User was able to debit an account they do not own!');
      }

      results.push({
        name: 'RBAC & Account Ownership Authorization',
        passed: true,
        durationMs: Date.now() - start,
        message: `Prevented unauthorized cross-customer account debit. Strict tenant isolation enforced.`,
      });
    } catch (e: unknown) {
      results.push({
        name: 'RBAC & Account Ownership Authorization',
        passed: false,
        durationMs: Date.now() - start,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Test 7: Distributed 2PC Saga & Raft Replication Verification
  {
    const start = Date.now();
    try {
      db.seed();
      const elena = db.users.get('user_elena_vance')!;
      const initialLogIndex = distributedCluster.getLeaderNode().appliedLogIndex;

      // Execute RTGS transfer (₹2,50,000.00 with ₹25 fee)
      const txn = await transferService.executeTransfer({
        sourceAccountId: 'acc_elena_chk',
        destinationAccountId: 'acc_elena_sav',
        beneficiaryName: 'Savings Reserve',
        amount: 250000.0,
        type: 'RTGS',
        description: 'RTGS Distributed Transfer Test',
        idempotencyKey: `TEST-DIST-${Date.now()}`,
        user: elena,
      });

      if (!txn.rrn || txn.rrn.length !== 12) {
        throw new Error(`Invalid RRN: expected 12 digits, got "${txn.rrn}"`);
      }
      if (!txn.distributedTraceId.startsWith('trace-in-')) {
        throw new Error(`Invalid distributed trace ID: "${txn.distributedTraceId}"`);
      }
      if (txn.sagaSteps.length < 3) {
        throw new Error(`Expected at least 3 Saga steps, got ${txn.sagaSteps.length}`);
      }

      const updatedLogIndex = distributedCluster.getLeaderNode().appliedLogIndex;
      if (updatedLogIndex <= initialLogIndex) {
        throw new Error(`Raft consensus log index not incremented: ${initialLogIndex} -> ${updatedLogIndex}`);
      }

      results.push({
        name: 'Distributed 2PC Saga & Raft Consensus Replication',
        passed: true,
        durationMs: Date.now() - start,
        message: `Generated 12-digit RRN (${txn.rrn}), distributed trace (${txn.distributedTraceId}), ${txn.sagaSteps.length} participant Saga steps, and advanced Raft log index to #${updatedLogIndex}.`,
      });
    } catch (e: unknown) {
      results.push({
        name: 'Distributed 2PC Saga & Raft Consensus Replication',
        passed: false,
        durationMs: Date.now() - start,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    success: failed === 0,
    total: results.length,
    passed,
    failed,
    results,
  };
}

// Standalone execution via tsx src/server/tests/runTests.ts
if (process.argv[1]?.endsWith('runTests.ts')) {
  console.log('====================================================');
  console.log('  NovaBank India Core Banking Ledger - Invariant Tests');
  console.log('====================================================');
  runAllBankingTests().then((res) => {
    for (const r of res.results) {
      const statusIcon = r.passed ? '✓ PASS' : '✗ FAIL';
      console.log(`[${statusIcon}] ${r.name} (${r.durationMs}ms)`);
      if (r.message) console.log(`       -> ${r.message}`);
    }
    console.log('----------------------------------------------------');
    console.log(`Total: ${res.total} | Passed: ${res.passed} | Failed: ${res.failed}`);
    console.log('====================================================');
    if (!res.success) {
      process.exit(1);
    }
  });
}
