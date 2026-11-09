/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { db } from './src/server/store.ts';
import { ledgerService } from './src/server/ledger.ts';
import { transferService } from './src/server/transfers.ts';
import { kycService } from './src/server/kyc.ts';
import { auditService } from './src/server/audit.ts';
import { distributedCluster } from './src/server/distributed.ts';
import { runAllBankingTests } from './src/server/tests/runTests.ts';
import { User, UserRole, PaymentRail } from './src/server/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

// In-memory active session token store (token -> userId)
const sessions = new Map<string, string>();

// Auth middleware helper
function resolveUser(req: Request): User | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || (req.query.token as string);
  if (!token) return null;
  const userId = sessions.get(token);
  if (!userId) return null;
  return db.users.get(userId) || null;
}

function getAuthUser(req: Request): User {
  const user = resolveUser(req);
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

function requireAuth(req: Request, res: Response, next: () => void) {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }
  next();
}

function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: () => void) => {
    const user = resolveUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Please log in' });
    }
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        error: `Forbidden: Action requires role [${allowedRoles.join(', ')}]. Current role: ${user.role}`,
      });
    }
    next();
  };
}

// ==========================================
// 1. SYSTEM & HEALTH ENDPOINTS
// ==========================================

app.get('/api/health', (_req, res) => {
  const audit = ledgerService.auditLedgerIntegrity();
  res.json({
    status: 'healthy',
    system: 'NovaBank India Distributed Core Ledger',
    currency: 'INR (₹)',
    rails: ['UPI (Instant 24x7)', 'IMPS (Fast interbank)', 'NEFT (Batch clearing)', 'RTGS (Gross high value >= ₹2 Lakhs)'],
    environment: 'SIMULATED_DEMO_ENVIRONMENT',
    disclaimer: 'Demonstration and educational only. No real money, Aadhaar, PAN, or bank credentials moved.',
    ledgerInvariantHealthy: audit.isHealthy,
    ledgerDiscrepancyDelta: audit.discrepancyDelta,
    leaderNode: distributedCluster.getLeaderNode(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/system/architecture', (_req, res) => {
  res.json({
    architecture: 'Distributed Core Banking Ledger with Raft Consensus & 2PC Saga Orchestration',
    currency: 'INR (Indian Rupee - Lakhs & Crores scale)',
    modules: [
      {
        name: 'DistributedClusterService',
        responsibility: 'Multi-node Raft consensus simulation (Mumbai DC1 Leader, Bengaluru DC2 Follower, Delhi DR3 Read Replica)',
        guarantee: 'State machine replication with monotonic appliedLogIndex and quorum commit verification',
      },
      {
        name: 'LedgerService',
        responsibility: 'Double-entry immutable journal posting, balance derivation, invariant audits',
        guarantee: 'Sum(Debits) === Sum(Credits) across all posted transactions in INR; balances derived from entries',
      },
      {
        name: 'TransferService & SagaOrchestrator',
        responsibility: 'Payment rails (UPI, IMPS, NEFT, RTGS), 12-digit RRN generation, idempotency caching, mutex locks',
        guarantee: 'Idempotency prevents duplicate debits on retries; mutex locks prevent race conditions; Saga compensation handles network switch drops',
      },
      {
        name: 'KycService',
        responsibility: 'Indian KYC verification (PAN, Aadhaar masked), tiered transfer ceilings (₹50,000 unverified -> ₹10 Lakhs verified)',
        guarantee: 'Zero plaintext PII stored or logged; UIDAI and NSDL verification simulation',
      },
      {
        name: 'AuditService',
        responsibility: 'Tamper-evident cryptographic SHA-256 hash chaining across distributed nodes',
        guarantee: 'Every log entry links to predecessor block digest; node IDs recorded on every block',
      },
    ],
    distributedConsiderations: {
      concurrencyControl: 'Fine-grained mutex locking keyed by [sourceAccountId, destinationAccountId] in lexical order',
      idempotency: 'Client-provided unique Idempotency-Key cached with payload and request signature',
      consistency: 'Strict serializability for balance updates within ledger transactions',
      failureRecovery: 'Failed transactions are marked FAILED; posted entries adjusted only via REVERSING entries; Saga compensating rollbacks',
    },
  });
});

app.post('/api/system/reset', (_req, res) => {
  db.seed();
  auditService.reset();
  res.json({ success: true, message: 'Database and ledger reset to pristine seed state' });
});

app.get('/api/system/tests', async (_req, res) => {
  const report = await runAllBankingTests();
  db.seed();
  res.json(report);
});

app.post('/api/system/tests/run', async (_req, res) => {
  const report = await runAllBankingTests();
  db.seed();
  res.json(report);
});

// ==========================================
// 2. DISTRIBUTED CLUSTER & CHAOS LAB
// ==========================================

app.get('/api/distributed/cluster', (_req, res) => {
  res.json({
    nodes: distributedCluster.nodes,
    leader: distributedCluster.getLeaderNode(),
    topics: distributedCluster.eventStreamTopics,
    outboxQueueLength: db.outboxEvents.length,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/distributed/chaos/partition', requireRole(['STAFF', 'ADMIN']), (req, res) => {
  const { nodeId } = req.body;
  if (!nodeId) {
    return res.status(400).json({ error: 'nodeId is required' });
  }

  try {
    const updatedNode = distributedCluster.toggleNodePartition(nodeId);
    res.json({ success: true, node: updatedNode });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Partition toggle failed';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/distributed/chaos/saga-timeout', async (req, res) => {
  const user = resolveUser(req) || db.users.get('user_elena_vance')!;
  const leader = distributedCluster.getLeaderNode();
  const rrn = distributedCluster.generateRrn();
  const traceId = distributedCluster.createTraceId('UPI');
  const amount = parseFloat(req.body.amount || '5000');

  // Demonstrate 2PC / Saga Distributed Transaction Failure & Automated Compensation
  const sagaSteps = [
    {
      step: '1. LOCAL_HOLD_PREPARED',
      participant: 'AccountService',
      nodeId: leader.id,
      status: 'SUCCESS' as const,
      timestamp: new Date().toISOString(),
      details: `Pre-authorization hold of ₹${amount.toLocaleString('en-IN')} placed on source account`,
    },
    {
      step: '2. NPCI_UPI_SWITCH_DISPATCHED',
      participant: 'NPCI_UPI_Switch_Clearing',
      nodeId: leader.id,
      status: 'FAILED' as const,
      timestamp: new Date().toISOString(),
      details: 'SWITCH_TIMEOUT: Simulated interbank gateway network partition (HTTP 504 Gateway Timeout)',
    },
    {
      step: '3. SAGA_COMPENSATION_TRIGGERED',
      participant: 'SagaOrchestrator',
      nodeId: leader.id,
      status: 'COMPENSATED' as const,
      timestamp: new Date().toISOString(),
      details: 'Automated compensating transaction initiated: Local pre-auth hold released, zero ledger drift',
    },
  ];

  auditService.record({
    actorUserId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: 'SAGA_COMPENSATION_EXECUTED',
    targetType: 'DISTRIBUTED',
    targetId: rrn,
    nodeId: leader.id,
    details: {
      traceId,
      rrn,
      reason: 'NPCI_GATEWAY_TIMEOUT_SIMULATED',
      amount,
      sagaOutcome: 'COMPENSATED_CLEANLY',
    },
  });

  const audit = ledgerService.auditLedgerIntegrity();

  res.json({
    success: true,
    scenario: 'Simulated NPCI Interbank Switch Timeout & 2PC Compensating Saga Rollback',
    rrn,
    traceId,
    amount,
    sagaSteps,
    ledgerInvariantPreserved: audit.isHealthy,
    ledgerDiscrepancyDelta: audit.discrepancyDelta,
    message: 'Compensating Saga completed: Hold released, zero balance deducted, double-entry ledger remains in exact equilibrium.',
  });
});

// ==========================================
// 3. AUTHENTICATION & USER SESSIONS
// ==========================================

app.get('/api/session', (req, res) => {
  const user = resolveUser(req);
  res.json({
    user,
    availableUsers: Array.from(db.users.values()).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      kycStatus: u.kycStatus,
    })),
  });
});

app.post('/api/auth/switch-user', (req, res) => {
  const { targetUserId } = req.body;
  const user = db.users.get(targetUserId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const newToken = `tok_${user.id}_${Date.now()}`;
  sessions.set(newToken, user.id);
  sessions.set('default_session_token', user.id);

  auditService.record({
    actorUserId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: 'USER_SESSION_SWITCHED',
    targetType: 'SECURITY',
    targetId: user.id,
    nodeId: distributedCluster.getLeaderNode().id,
    details: { switchedTo: user.email, role: user.role },
  });

  res.json({ success: true, token: newToken, user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = Array.from(db.users.values()).find((u) => u.email.toLowerCase() === email?.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const creds = db.userPasswords.get(user.id);
  if (!creds || !db.verifyPassword(password || 'demo1234', creds.hash, creds.salt)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = `tok_${user.id}_${Date.now()}`;
  sessions.set(token, user.id);

  auditService.record({
    actorUserId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: 'USER_LOGIN',
    targetType: 'SECURITY',
    targetId: user.id,
    nodeId: distributedCluster.getLeaderNode().id,
    details: { email: user.email },
  });

  res.json({ success: true, token, user });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Legal name and email are required' });
  }

  const existing = Array.from(db.users.values()).find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const userId = `user_${Date.now()}`;
  const usernamePart = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const upiId = `${usernamePart || 'user'}@novaupi`;

  const newUser: User = {
    id: userId,
    email,
    name,
    phone: phone || '+91 98000 00000',
    upiId,
    role: 'CUSTOMER',
    kycStatus: 'UNVERIFIED',
    createdAt: new Date().toISOString(),
  };

  const { hash, salt } = db.hashPassword(password || 'demo1234');
  db.users.set(userId, newUser);
  db.userPasswords.set(userId, { hash, salt });

  // Create default checking account for new Indian customer
  const randomAccNum = '100' + Math.floor(100000000 + Math.random() * 900000000);
  const newAccount = {
    id: `acc_${userId}_chk`,
    accountNumber: randomAccNum,
    ifscCode: 'NOVA0001001',
    micrCode: '400240001',
    branchName: 'Nariman Point Branch, Mumbai',
    upiId,
    userId,
    type: 'CHECKING' as const,
    currency: 'INR' as const,
    status: 'ACTIVE' as const,
    postedBalance: 0,
    holdsAmount: 0,
    availableBalance: 0,
    dailyTransferLimit: 50000, // ₹50,000 initial limit until KYC verified
    perTransactionLimit: 25000,
    dailyTransferredAmount: 0,
    createdAt: new Date().toISOString(),
    nickname: 'Primary Everyday Savings & UPI Account',
  };
  db.accounts.set(newAccount.id, newAccount);

  const token = `tok_${userId}_${Date.now()}`;
  sessions.set(token, userId);

  auditService.record({
    actorUserId: userId,
    actorRole: 'CUSTOMER',
    actorName: name,
    action: 'CUSTOMER_REGISTERED',
    targetType: 'SECURITY',
    targetId: userId,
    nodeId: distributedCluster.getLeaderNode().id,
    details: { email, initialAccountId: newAccount.id, upiId },
  });

  res.json({ success: true, token, user: newUser, account: newAccount });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  if (token) {
    const userId = sessions.get(token);
    if (userId) {
      const user = db.users.get(userId);
      if (user) {
        auditService.record({
          actorUserId: user.id,
          actorRole: user.role,
          actorName: user.name,
          action: 'USER_LOGOUT',
          targetType: 'SECURITY',
          targetId: user.id,
          nodeId: distributedCluster.getLeaderNode().id,
          details: { email: user.email },
        });
      }
      sessions.delete(token);
    }
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// ==========================================
// 4. ACCOUNTS & STATEMENTS
// ==========================================

app.get('/api/accounts', (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }
  const isStaffOrAdmin = user.role === 'STAFF' || user.role === 'ADMIN';

  let accountsList = Array.from(db.accounts.values());
  if (!isStaffOrAdmin) {
    accountsList = accountsList.filter((a) => a.userId === user.id);
  }

  // Ensure postedBalance is refreshed from ledger
  const sanitizedAccounts = accountsList.map((a) => {
    const derivedBalance = ledgerService.calculateAccountBalance(a.id);
    a.postedBalance = derivedBalance;
    a.availableBalance = Math.round((derivedBalance - a.holdsAmount) * 100) / 100;
    return a;
  });

  res.json({ accounts: sanitizedAccounts });
});

app.get('/api/accounts/:id/statement', (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }
  const account = db.accounts.get(req.params.id);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  if (account.userId !== user.id && user.role === 'CUSTOMER') {
    return res.status(403).json({ error: 'Access denied: Cannot access statements for another user' });
  }

  const entries = db.ledgerEntries.filter((e) => e.accountId === account.id);
  let totalDebits = 0;
  let totalCredits = 0;

  for (const e of entries) {
    if (e.direction === 'DEBIT') totalDebits += e.amount;
    else totalCredits += e.amount;
  }

  totalDebits = Math.round(totalDebits * 100) / 100;
  totalCredits = Math.round(totalCredits * 100) / 100;
  const currentBalance = account.postedBalance;

  res.json({
    statementId: `STM-2026-${account.accountNumber.slice(-4)}`,
    period: 'November 2026 Monthly Statement',
    accountNumberMasked: transferService.maskAccount(account.accountNumber),
    accountType: account.type,
    currency: account.currency,
    startingBalance: 0.0,
    totalCredits,
    totalDebits,
    endingBalance: currentBalance,
    holdsAmount: account.holdsAmount,
    availableBalance: account.availableBalance,
    totalTransactionsCount: entries.length,
    entries: entries.slice(-50).reverse(),
    generatedAt: new Date().toISOString(),
    ledgerProofHash: entries.length > 0 ? entries[entries.length - 1].id : 'GENESIS',
  });
});

// ==========================================
// 5. TRANSACTIONS & TRANSFERS
// ==========================================

app.get('/api/transactions', (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }
  const isStaffOrAdmin = user.role === 'STAFF' || user.role === 'ADMIN';

  let list = Array.from(db.transactions.values());

  if (!isStaffOrAdmin) {
    const userAccountIds = new Set(
      Array.from(db.accounts.values())
        .filter((a) => a.userId === user.id)
        .map((a) => a.id)
    );
    list = list.filter((t) => userAccountIds.has(t.sourceAccountId) || userAccountIds.has(t.destinationAccountId));
  }

  const { status, type, limit } = req.query;
  if (status && typeof status === 'string' && status !== 'ALL') {
    list = list.filter((t) => t.status === status);
  }
  if (type && typeof type === 'string' && type !== 'ALL') {
    list = list.filter((t) => t.type === type);
  }

  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const maxItems = limit ? parseInt(limit as string, 10) : 100;
  res.json({ transactions: list.slice(0, maxItems) });
});

app.post('/api/transfers', async (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }
  const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;

  try {
    const transaction = await transferService.executeTransfer({
      sourceAccountId: req.body.sourceAccountId,
      destinationAccountId: req.body.destinationAccountId,
      destinationUpiId: req.body.destinationUpiId,
      destinationIfscCode: req.body.destinationIfscCode || req.body.externalRoutingNumber,
      destinationAccountNumber: req.body.destinationAccountNumber || req.body.externalAccountNumber,
      externalRoutingNumber: req.body.externalRoutingNumber,
      externalAccountNumber: req.body.externalAccountNumber,
      beneficiaryName: req.body.beneficiaryName,
      beneficiaryUpiOrIfsc: req.body.beneficiaryUpiOrIfsc,
      amount: parseFloat(req.body.amount),
      type: (req.body.type || 'UPI') as PaymentRail,
      description: req.body.description,
      idempotencyKey,
      user,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, transaction });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Transfer execution error';
    res.status(400).json({ error: msg });
  }
});

// Reverse a posted transaction (Staff / Admin only)
app.post('/api/transfers/:id/reverse', requireRole(['STAFF', 'ADMIN']), (req, res) => {
  const user = getAuthUser(req);
  const { reason } = req.body;

  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ error: 'A justification reason is required to reverse a posted transaction' });
  }

  try {
    const reversalTxn = ledgerService.reverseTransaction({
      transactionId: req.params.id,
      actorUserId: user.id,
      actorName: user.name,
      actorRole: user.role,
      reason: reason.trim(),
    });
    res.json({ success: true, reversalTransaction: reversalTxn });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Reversal error';
    res.status(400).json({ error: msg });
  }
});

// Interactive Idempotency Replay Simulation
app.post('/api/transfers/simulate-retry', async (req, res) => {
  const user = resolveUser(req) || db.users.get('user_elena_vance')!;
  const { existingIdempotencyKey } = req.body;

  if (!existingIdempotencyKey) {
    return res.status(400).json({ error: 'existingIdempotencyKey is required' });
  }

  try {
    const cached = db.idempotencyRecords.get(existingIdempotencyKey);
    if (!cached) {
      return res.status(404).json({ error: 'No transaction found with this idempotency key' });
    }

    const txn = await transferService.executeTransfer({
      sourceAccountId: 'acc_elena_chk',
      destinationAccountId: 'acc_elena_sav',
      beneficiaryName: 'Savings Reserve',
      amount: 1000.0,
      type: 'UPI',
      description: 'Retry attempt',
      idempotencyKey: existingIdempotencyKey,
      user,
    });

    res.json({
      success: true,
      replayDetected: true,
      message: 'Idempotency Protection Engaged: Cached original transaction returned with ZERO duplicate debit',
      transaction: txn,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Simulation error';
    res.status(400).json({ error: msg });
  }
});

// Interactive Concurrency Race Condition Simulation
app.post('/api/transfers/simulate-concurrency', async (req, res) => {
  const user = resolveUser(req) || db.users.get('user_elena_vance')!;
  const count = parseInt(req.body.count || '4', 10);
  const amount = parseFloat(req.body.amount || '100000'); // ₹1 Lakh per thread

  const parallelPromises = Array.from({ length: count }, (_, i) => {
    const key = `CHAOS-CONCURRENT-${Date.now()}-${i}`;
    return transferService
      .executeTransfer({
        sourceAccountId: 'acc_elena_chk',
        destinationAccountId: 'acc_elena_sav',
        beneficiaryName: 'High Yield Savings',
        amount,
        type: 'INTERNAL_TRANSFER',
        description: `Simulated concurrent thread #${i + 1}`,
        idempotencyKey: key,
        user,
      })
      .then(
        (txn) => ({ thread: i + 1, status: 'SUCCESS', transactionId: txn.id, amount }),
        (err) => ({ thread: i + 1, status: 'BLOCKED_BY_INVARIANT', reason: err.message, amount })
      );
  });

  const results = await Promise.all(parallelPromises);
  const audit = ledgerService.auditLedgerIntegrity();

  res.json({
    success: true,
    threadsDispatched: count,
    results,
    ledgerInvariantPreserved: audit.isHealthy,
    remainingDiscrepancyDelta: audit.discrepancyDelta,
  });
});

// ==========================================
// 6. BENEFICIARIES
// ==========================================

app.get('/api/beneficiaries', (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }
  const list = Array.from(db.beneficiaries.values()).filter((b) => b.userId === user.id);
  res.json({ beneficiaries: list });
});

app.post('/api/beneficiaries', (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }
  const { name, accountNumber, ifscCode, bankName, branchName, upiId, accountType, nickname } = req.body;

  if (!name || (!accountNumber && !upiId)) {
    return res.status(400).json({ error: 'Payee name and either Account+IFSC or UPI ID are required' });
  }

  // Check if internal (IFSC matches NovaBank NOVA0001001 or NOVA0001002)
  const isInternal = ifscCode === 'NOVA0001001' || ifscCode === 'NOVA0001002' || upiId?.endsWith('@novaupi');

  const beneficiary = {
    id: `ben_${Date.now()}`,
    userId: user.id,
    name,
    accountNumber: accountNumber || '0000000000',
    ifscCode: ifscCode || 'NOVA0001001',
    bankName: bankName || (isInternal ? 'NovaBank Core' : 'Interbank Recipient'),
    branchName: branchName || 'Mumbai Main Branch',
    upiId,
    accountType: accountType || 'SAVINGS',
    isInternal: Boolean(isInternal),
    nickname,
    createdAt: new Date().toISOString(),
  };

  db.beneficiaries.set(beneficiary.id, beneficiary);

  auditService.record({
    actorUserId: user.id,
    actorRole: user.role,
    actorName: user.name,
    action: 'BENEFICIARY_ADDED',
    targetType: 'ACCOUNT',
    targetId: beneficiary.id,
    nodeId: distributedCluster.getLeaderNode().id,
    details: {
      name,
      maskedAccount: transferService.maskAccount(beneficiary.accountNumber),
      ifscCode: beneficiary.ifscCode,
      upiId: beneficiary.upiId,
      isInternal,
    },
  });

  res.status(201).json({ success: true, beneficiary });
});

// ==========================================
// 7. LEDGER & AUDIT TRAIL (STAFF & ADMIN)
// ==========================================

app.get('/api/ledger', requireRole(['STAFF', 'ADMIN']), (req, res) => {
  const { accountId, limit } = req.query;
  let entries = db.ledgerEntries;

  if (accountId && typeof accountId === 'string') {
    entries = entries.filter((e) => e.accountId === accountId);
  }

  const maxItems = limit ? parseInt(limit as string, 10) : 100;
  res.json({
    totalEntries: entries.length,
    entries: entries.slice(-maxItems).reverse(),
  });
});

app.get('/api/ledger/audit', requireRole(['STAFF', 'ADMIN']), (_req, res) => {
  const auditReport = ledgerService.auditLedgerIntegrity();
  res.json(auditReport);
});

app.get('/api/audit-logs', requireRole(['STAFF', 'ADMIN']), (req, res) => {
  const { type, limit } = req.query;
  const max = limit ? parseInt(limit as string, 10) : 50;
  const logs = auditService.getLogs(max, type as string);
  const integrity = auditService.verifyIntegrity();
  res.json({ logs, integrity });
});

// ==========================================
// 8. KYC & COMPLIANCE DESK
// ==========================================

app.post('/api/kyc/submit', (req, res) => {
  const user = resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Please log in' });
  }
  const { legalName, dateOfBirth, panNumber, aadhaarNumber, address, documentType, documentNumber } = req.body;

  if (!legalName || !dateOfBirth || (!panNumber && !aadhaarNumber) || !address) {
    return res.status(400).json({ error: 'Legal name, DOB, address, and PAN/Aadhaar are required' });
  }

  try {
    const updatedUser = kycService.submitKyc({
      userId: user.id,
      legalName,
      dateOfBirth,
      panNumber,
      aadhaarNumber,
      address,
      documentType: documentType || 'PAN_CARD',
      documentNumber: documentNumber || panNumber || 'ABCDE1234F',
    });
    res.json({ success: true, user: updatedUser });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'KYC submission failed';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/kyc/review', requireRole(['STAFF', 'ADMIN']), (req, res) => {
  const reviewer = getAuthUser(req);
  const { targetUserId, status, rejectionReason } = req.body;

  try {
    const updatedUser = kycService.reviewKyc({
      targetUserId,
      reviewerUserId: reviewer.id,
      reviewerName: reviewer.name,
      reviewerRole: reviewer.role,
      status,
      rejectionReason,
    });
    res.json({ success: true, user: updatedUser });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'KYC review failed';
    res.status(400).json({ error: msg });
  }
});

// Update Account Limits (Staff / Admin)
app.post('/api/accounts/:id/limits', requireRole(['STAFF', 'ADMIN']), (req, res) => {
  const actor = getAuthUser(req);
  const { dailyLimit, perTransactionLimit } = req.body;

  try {
    const account = kycService.updateAccountLimits({
      accountId: req.params.id,
      dailyLimit: parseFloat(dailyLimit),
      perTransactionLimit: parseFloat(perTransactionLimit),
      actorUserId: actor.id,
      actorRole: actor.role,
      actorName: actor.name,
    });
    res.json({ success: true, account });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Limit update failed';
    res.status(400).json({ error: msg });
  }
});

// Freeze / Unfreeze Account (Staff / Admin)
app.post('/api/accounts/:id/freeze', requireRole(['STAFF', 'ADMIN']), (req, res) => {
  const actor = getAuthUser(req);
  const { freeze, reason } = req.body;

  try {
    const account = kycService.toggleAccountFreeze({
      accountId: req.params.id,
      freeze: Boolean(freeze),
      reason: reason || 'Compliance review action',
      actorUserId: actor.id,
      actorRole: actor.role,
      actorName: actor.name,
    });
    res.json({ success: true, account });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Action failed';
    res.status(400).json({ error: msg });
  }
});

// Hold Management (Staff / Admin)
app.post('/api/accounts/:id/holds', requireRole(['STAFF', 'ADMIN']), (req, res) => {
  const actor = getAuthUser(req);
  const { action, amount, reason } = req.body;

  try {
    let account;
    if (action === 'PLACE') {
      account = transferService.placeHold({
        accountId: req.params.id,
        amount: parseFloat(amount),
        merchantOrReason: reason || 'Pre-authorization Hold',
        actorUserId: actor.id,
      });
    } else {
      account = transferService.releaseHold({
        accountId: req.params.id,
        amount: parseFloat(amount),
        actorUserId: actor.id,
      });
    }
    res.json({ success: true, account });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Hold operation failed';
    res.status(400).json({ error: msg });
  }
});

// ==========================================
// 9. VITE MIDDLEWARES & DEV SERVER
// ==========================================

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = http.createServer(app);
  server.listen(port, '0.0.0.0', () => {
    console.log(`[NovaBank] Core Banking System running at http://0.0.0.0:${port}`);
    console.log(`[NovaBank] Distributed Multi-Node Raft Cluster Active (Mumbai DC1 Leader).`);
  });
}

startServer();
