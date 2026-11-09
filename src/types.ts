/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'CUSTOMER' | 'STAFF' | 'ADMIN';
export type KycStatus = 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'ENHANCED_DUE_DILIGENCE';
export type AccountType = 'CHECKING' | 'SAVINGS' | 'SETTLEMENT_CLEARING' | 'FEE_REVENUE' | 'VAULT_RESERVE';
export type AccountStatus = 'ACTIVE' | 'FROZEN' | 'RESTRICTED' | 'CLOSED';

export type PaymentRail =
  | 'UPI'
  | 'IMPS'
  | 'NEFT'
  | 'RTGS'
  | 'INTERNAL_TRANSFER'
  | 'DIRECT_DEPOSIT'
  | 'FEE'
  | 'REVERSAL';

export type TransactionType = PaymentRail;
export type TransactionStatus = 'PENDING' | 'POSTED' | 'FAILED' | 'REVERSED';
export type EntryDirection = 'DEBIT' | 'CREDIT';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string;
  upiId?: string;
  kycStatus: KycStatus;
  kycDetails?: {
    legalName: string;
    dateOfBirth: string;
    maskedPan: string;
    maskedAadhaar: string;
    address: string;
    documentType: string;
    documentNumberMasked: string;
    submittedAt: string;
    reviewedAt?: string;
    reviewedBy?: string;
    rejectionReason?: string;
  };
  createdAt: string;
}

export interface BankAccount {
  id: string;
  accountNumber: string;
  ifscCode: string;
  micrCode: string;
  branchName: string;
  upiId: string;
  userId: string;
  type: AccountType;
  currency: 'INR';
  status: AccountStatus;
  postedBalance: number;
  holdsAmount: number;
  availableBalance: number;
  dailyTransferLimit: number;
  perTransactionLimit: number;
  dailyTransferredAmount: number;
  createdAt: string;
  nickname?: string;
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  sequenceNumber: number;
  accountId: string;
  accountNumber: string;
  direction: EntryDirection;
  amount: number;
  currency: 'INR';
  runningBalanceAfter: number;
  entryType: 'STANDARD' | 'REVERSING';
  description: string;
  nodeId: string;
  createdAt: string;
}

export interface SagaTraceStep {
  step: string;
  participant: string;
  nodeId: string;
  status: 'PENDING' | 'SUCCESS' | 'COMPENSATED' | 'FAILED';
  timestamp: string;
  details?: string;
}

export interface TransactionRecord {
  id: string;
  referenceNumber: string;
  rrn: string;
  sourceAccountId: string;
  destinationAccountId: string;
  sourceAccountMasked: string;
  destinationAccountMasked: string;
  beneficiaryName: string;
  beneficiaryUpiOrIfsc?: string;
  amount: number;
  fee: number;
  currency: 'INR';
  type: TransactionType;
  status: TransactionStatus;
  description: string;
  idempotencyKey?: string;
  initiatedByUserId: string;
  createdAt: string;
  postedAt?: string;
  failedAt?: string;
  failureReason?: string;
  reversedAt?: string;
  reversalReason?: string;
  reversalTransactionId?: string;
  isReversal?: boolean;
  reversalOfTransactionId?: string;
  ledgerEntries: LedgerEntry[];
  hashDigest: string;
  distributedTraceId: string;
  primaryNodeId: string;
  sagaSteps: SagaTraceStep[];
}

export interface Beneficiary {
  id: string;
  userId: string;
  name: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  branchName?: string;
  upiId?: string;
  accountType: 'SAVINGS' | 'CURRENT';
  isInternal: boolean;
  nickname?: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorRole: UserRole;
  actorName: string;
  action: string;
  targetType: 'TRANSACTION' | 'ACCOUNT' | 'KYC' | 'SECURITY' | 'DISTRIBUTED' | 'SYSTEM';
  targetId: string;
  details: Record<string, unknown>;
  nodeId: string;
  ipAddress?: string;
  previousHash: string;
  hash: string;
}

export interface AccountStatement {
  statementId: string;
  period: string;
  accountNumberMasked: string;
  accountType: AccountType;
  currency: string;
  startingBalance: number;
  totalCredits: number;
  totalDebits: number;
  endingBalance: number;
  holdsAmount: number;
  availableBalance: number;
  totalTransactionsCount: number;
  entries: LedgerEntry[];
  generatedAt: string;
  ledgerProofHash: string;
}

export interface LedgerAuditReport {
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
}

export interface ClusterNode {
  id: string;
  name: string;
  region: string;
  role: 'LEADER' | 'FOLLOWER' | 'READ_REPLICA';
  status: 'HEALTHY' | 'PARTITIONED' | 'DEGRADED';
  raftTerm: number;
  appliedLogIndex: number;
  commitIndex: number;
  heartbeatLatencyMs: number;
}

export interface EventStreamTopic {
  name: string;
  partitionCount: number;
  retentionDays: number;
}

export interface ClusterStatus {
  nodes: ClusterNode[];
  leader: ClusterNode;
  topics: EventStreamTopic[];
  outboxQueueLength: number;
  timestamp: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface TestSuiteReport {
  success: boolean;
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}
