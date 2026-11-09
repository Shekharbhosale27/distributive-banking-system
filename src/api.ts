/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AccountStatement,
  AuditLogEntry,
  BankAccount,
  Beneficiary,
  ClusterNode,
  ClusterStatus,
  LedgerAuditReport,
  LedgerEntry,
  SagaTraceStep,
  TestSuiteReport,
  TransactionRecord,
  User,
} from './types.ts';

const STORAGE_KEY = 'novabank_session_token';

let currentSessionToken: string | null =
  typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

export function setSessionToken(token: string | null) {
  currentSessionToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem(STORAGE_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

export function getSessionToken(): string | null {
  return currentSessionToken;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Authorization') && currentSessionToken) {
    headers.set('Authorization', `Bearer ${currentSessionToken}`);
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  // Session & Auth
  getSession: () => request<{ user: User | null; availableUsers: Array<Pick<User, 'id' | 'name' | 'email' | 'role' | 'kycStatus'>> }>('/api/session'),
  login: (payload: { email: string; password?: string }) =>
    request<{ success: boolean; token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: async () => {
    try {
      await request<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      setSessionToken(null);
    }
  },
  switchUser: (targetUserId: string) =>
    request<{ success: boolean; token: string; user: User }>('/api/auth/switch-user', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    }),
  register: (payload: { name: string; email: string; phone?: string; password?: string }) =>
    request<{ success: boolean; token: string; user: User; account: BankAccount }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Distributed Cluster & Chaos Engineering
  getCluster: () => request<ClusterStatus>('/api/distributed/cluster'),
  toggleNodePartition: (nodeId: string) =>
    request<{ success: boolean; node: ClusterNode }>('/api/distributed/chaos/partition', {
      method: 'POST',
      body: JSON.stringify({ nodeId }),
    }),
  simulateSagaTimeout: (amount = 5000) =>
    request<{
      success: boolean;
      scenario: string;
      rrn: string;
      traceId: string;
      amount: number;
      sagaSteps: SagaTraceStep[];
      ledgerInvariantPreserved: boolean;
      ledgerDiscrepancyDelta: number;
      message: string;
    }>('/api/distributed/chaos/saga-timeout', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),

  // Accounts & Statements
  getAccounts: () => request<{ accounts: BankAccount[] }>('/api/accounts'),
  getStatement: (accountId: string) => request<AccountStatement>(`/api/accounts/${accountId}/statement`),

  // Transactions & Transfers
  getTransactions: (params?: { status?: string; type?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.type) q.set('type', params.type);
    if (params?.limit) q.set('limit', String(params.limit));
    return request<{ transactions: TransactionRecord[] }>(`/api/transactions?${q.toString()}`);
  },
  executeTransfer: (payload: {
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
    type: string;
    description: string;
    idempotencyKey: string;
  }) =>
    request<{ success: boolean; transaction: TransactionRecord }>('/api/transfers', {
      method: 'POST',
      headers: {
        'Idempotency-Key': payload.idempotencyKey,
      },
      body: JSON.stringify(payload),
    }),
  reverseTransaction: (transactionId: string, reason: string) =>
    request<{ success: boolean; reversalTransaction: TransactionRecord }>(`/api/transfers/${transactionId}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  simulateRetry: (existingIdempotencyKey: string) =>
    request<{ success: boolean; replayDetected: boolean; message: string; transaction: TransactionRecord }>('/api/transfers/simulate-retry', {
      method: 'POST',
      body: JSON.stringify({ existingIdempotencyKey }),
    }),
  simulateConcurrency: (count = 4, amount = 100000) =>
    request<{
      success: boolean;
      threadsDispatched: number;
      results: Array<{ thread: number; status: string; transactionId?: string; reason?: string; amount: number }>;
      ledgerInvariantPreserved: boolean;
      remainingDiscrepancyDelta: number;
    }>('/api/transfers/simulate-concurrency', {
      method: 'POST',
      body: JSON.stringify({ count, amount }),
    }),

  // Beneficiaries
  getBeneficiaries: () => request<{ beneficiaries: Beneficiary[] }>('/api/beneficiaries'),
  addBeneficiary: (payload: {
    name: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
    branchName?: string;
    upiId?: string;
    accountType?: string;
    nickname?: string;
  }) =>
    request<{ success: boolean; beneficiary: Beneficiary }>('/api/beneficiaries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Staff & Admin
  getLedger: (params?: { accountId?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.accountId) q.set('accountId', params.accountId);
    if (params?.limit) q.set('limit', String(params.limit));
    return request<{ totalEntries: number; entries: LedgerEntry[] }>(`/api/ledger?${q.toString()}`);
  },
  auditLedger: () => request<LedgerAuditReport>('/api/ledger/audit'),
  getAuditLogs: (params?: { type?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.type) q.set('type', params.type);
    if (params?.limit) q.set('limit', String(params.limit));
    return request<{ logs: AuditLogEntry[]; integrity: { isValid: boolean; checkedCount: number; brokenAt?: string } }>(
      `/api/audit-logs?${q.toString()}`
    );
  },
  submitKyc: (payload: {
    legalName: string;
    dateOfBirth: string;
    panNumber?: string;
    aadhaarNumber?: string;
    address: string;
    documentType: string;
    documentNumber: string;
  }) =>
    request<{ success: boolean; user: User }>('/api/kyc/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  reviewKyc: (payload: { targetUserId: string; status: string; rejectionReason?: string }) =>
    request<{ success: boolean; user: User }>('/api/kyc/review', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateLimits: (accountId: string, dailyLimit: number, perTransactionLimit: number) =>
    request<{ success: boolean; account: BankAccount }>(`/api/accounts/${accountId}/limits`, {
      method: 'POST',
      body: JSON.stringify({ dailyLimit, perTransactionLimit }),
    }),
  freezeAccount: (accountId: string, freeze: boolean, reason?: string) =>
    request<{ success: boolean; account: BankAccount }>(`/api/accounts/${accountId}/freeze`, {
      method: 'POST',
      body: JSON.stringify({ freeze, reason }),
    }),
  manageHold: (accountId: string, action: 'PLACE' | 'RELEASE', amount: number, reason?: string) =>
    request<{ success: boolean; account: BankAccount }>(`/api/accounts/${accountId}/holds`, {
      method: 'POST',
      body: JSON.stringify({ action, amount, reason }),
    }),

  // System
  runTests: () => request<TestSuiteReport>('/api/system/tests/run', { method: 'POST' }),
  resetSystem: () => request<{ success: boolean; message: string }>('/api/system/reset', { method: 'POST' }),
  getArchitecture: () => request<any>('/api/system/architecture'),
};
