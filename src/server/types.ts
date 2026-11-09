/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'CUSTOMER' | 'STAFF' | 'ADMIN';

export type KycStatus = 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'ENHANCED_DUE_DILIGENCE';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string; // Indian format e.g. "+91 98201 48210"
  upiId?: string; // e.g. "elena@novaupi"
  avatarUrl?: string;
  kycStatus: KycStatus;
  kycDetails?: {
    legalName: string;
    dateOfBirth: string;
    maskedPan: string; // e.g. "ABCDE••••F" (Permanent Account Number)
    maskedAadhaar: string; // e.g. "•••• •••• 4921" (12-digit UIDAI Aadhaar)
    address: string;
    documentType: 'PAN_CARD' | 'AADHAAR' | 'PASSPORT' | 'VOTER_ID' | 'DRIVING_LICENCE';
    documentNumberMasked: string;
    submittedAt: string;
    reviewedAt?: string;
    reviewedBy?: string;
    rejectionReason?: string;
  };
  createdAt: string;
}

export type AccountType = 'CHECKING' | 'SAVINGS' | 'SETTLEMENT_CLEARING' | 'FEE_REVENUE' | 'VAULT_RESERVE';

export type AccountStatus = 'ACTIVE' | 'FROZEN' | 'RESTRICTED' | 'CLOSED';

export interface BankAccount {
  id: string;
  accountNumber: string; // 10-14 digits, e.g. "100482910401"
  ifscCode: string; // 11-char IFSC code, e.g. "NOVA0001001" (Mumbai Nariman Point)
  micrCode: string; // 9-digit MICR, e.g. "400240001"
  branchName: string; // e.g. "Nariman Point Branch, Mumbai"
  upiId: string; // e.g. "elena@novaupi"
  userId: string; // "SYSTEM" for internal bank accounts
  type: AccountType;
  currency: 'INR';
  status: AccountStatus;
  postedBalance: number; // Derived strictly from ledger entries (in INR)
  holdsAmount: number; // Active pending pre-auth holds (in INR)
  availableBalance: number; // postedBalance - holdsAmount
  dailyTransferLimit: number; // e.g. ₹10,00,000 (10 Lakhs)
  perTransactionLimit: number; // e.g. ₹2,00,000 (2 Lakhs)
  dailyTransferredAmount: number; // Cumulative transfers today
  createdAt: string;
  nickname?: string;
}

export type PaymentRail =
  | 'UPI' // Unified Payments Interface (Instant 24x7 retail, VPA)
  | 'IMPS' // Immediate Payment Service (Instant 24x7 interbank)
  | 'NEFT' // National Electronic Funds Transfer (Batch clearing)
  | 'RTGS' // Real Time Gross Settlement (High value > ₹2 Lakhs)
  | 'INTERNAL_TRANSFER' // Book transfer within NovaBank
  | 'DIRECT_DEPOSIT' // Salary / Corporate credit
  | 'FEE' // Banking service fee / GST
  | 'REVERSAL'; // Reversing compensatory entry

export type TransactionType = PaymentRail;

export type TransactionStatus =
  | 'PENDING'
  | 'PROCESSING_SAGA'
  | 'POSTED'
  | 'FAILED'
  | 'REVERSED';

export type EntryDirection = 'DEBIT' | 'CREDIT';

export interface LedgerEntry {
  id: string;
  transactionId: string;
  sequenceNumber: number;
  accountId: string;
  accountNumber: string;
  direction: EntryDirection;
  amount: number; // in INR
  currency: 'INR';
  runningBalanceAfter: number;
  entryType: 'STANDARD' | 'REVERSING';
  description: string;
  nodeId: string; // Distributed node that committed this entry
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
  referenceNumber: string; // URN / RRN, e.g. "UPI-2026-948210" or "IMPS-2026-10294"
  rrn: string; // 12-digit Retrieval Reference Number for Indian rails
  sourceAccountId: string;
  destinationAccountId: string;
  sourceAccountMasked: string;
  destinationAccountMasked: string;
  beneficiaryName: string;
  beneficiaryUpiOrIfsc?: string;
  amount: number; // in INR
  fee: number; // in INR
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
  hashDigest: string; // SHA-256 for audit immutability
  // Distributed systems metadata
  distributedTraceId: string; // e.g. "trace-in-mum-8492048"
  primaryNodeId: string; // e.g. "node-mum-dc1"
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
  ipAddress: string;
  previousHash: string;
  hash: string;
}

export interface OutboxEvent {
  id: string;
  eventType: 'TRANSACTION_INITIATED' | 'TRANSACTION_POSTED' | 'TRANSACTION_REVERSED' | 'KYC_STATUS_CHANGED' | 'HOLD_PLACED' | 'SAGA_COMPENSATED';
  topic: string; // e.g. "novabank.in.transactions"
  payload: Record<string, unknown>;
  status: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED_RETRYING' | 'DEAD_LETTER';
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  processedAt?: string;
  error?: string;
}

export interface IdempotencyRecord {
  key: string;
  userId: string;
  requestHash: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  responsePayload?: unknown;
  transactionId?: string;
  createdAt: string;
  updatedAt: string;
}

// Distributed Cluster Node types
export interface ClusterNode {
  id: string;
  name: string;
  region: string; // e.g. "ap-south-1 (Mumbai)", "ap-south-2 (Hyderabad)", "in-north-1 (Delhi)"
  role: 'LEADER' | 'FOLLOWER' | 'READ_REPLICA';
  status: 'HEALTHY' | 'PARTITIONED' | 'DEGRADED';
  raftTerm: number;
  appliedLogIndex: number;
  commitIndex: number;
  heartbeatLatencyMs: number;
}
