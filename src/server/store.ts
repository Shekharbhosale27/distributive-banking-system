/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import {
  BankAccount,
  Beneficiary,
  IdempotencyRecord,
  LedgerEntry,
  OutboxEvent,
  TransactionRecord,
  User,
} from './types.ts';
import { distributedCluster } from './distributed.ts';

export class BankingStore {
  public users: Map<string, User> = new Map();
  public userPasswords: Map<string, { hash: string; salt: string }> = new Map();
  public accounts: Map<string, BankAccount> = new Map();
  public transactions: Map<string, TransactionRecord> = new Map();
  public ledgerEntries: LedgerEntry[] = [];
  public beneficiaries: Map<string, Beneficiary> = new Map();
  public idempotencyRecords: Map<string, IdempotencyRecord> = new Map();
  public outboxEvents: OutboxEvent[] = [];

  // Account mutex locks for concurrency safety
  private accountLocks: Map<string, Promise<void>> = new Map();

  constructor() {
    this.seed();
  }

  /**
   * Salted PBKDF2 hash for simulated passwords
   */
  public hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): { hash: string; salt: string } {
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
    return { hash, salt };
  }

  public verifyPassword(password: string, storedHash: string, salt: string): boolean {
    const { hash } = this.hashPassword(password, salt);
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
  }

  /**
   * Lock one or more accounts in sorted order to prevent deadlocks during concurrent operations.
   */
  public async acquireLocks<T>(accountIds: string[], operation: () => Promise<T>): Promise<T> {
    const sortedIds = Array.from(new Set(accountIds)).sort();
    const releaseFns: (() => void)[] = [];

    for (const id of sortedIds) {
      let release: () => void = () => {};
      const currentLock = this.accountLocks.get(id);
      const nextLock = new Promise<void>((resolve) => {
        release = resolve;
      });

      this.accountLocks.set(id, nextLock);
      if (currentLock) {
        await currentLock;
      }
      releaseFns.push(release);
    }

    try {
      return await operation();
    } finally {
      // Release in reverse
      for (let i = releaseFns.length - 1; i >= 0; i--) {
        releaseFns[i]();
      }
    }
  }

  public seed(): void {
    this.users.clear();
    this.userPasswords.clear();
    this.accounts.clear();
    this.transactions.clear();
    this.ledgerEntries = [];
    this.beneficiaries.clear();
    this.idempotencyRecords.clear();
    this.outboxEvents = [];

    // 1. Seed System Accounts (Indian Banking Format)
    const sysCapital: BankAccount = {
      id: 'acc_capital_equity',
      accountNumber: '990000000000',
      ifscCode: 'NOVA0001001',
      micrCode: '400240001',
      branchName: 'Nariman Point Core, Mumbai',
      upiId: 'treasury@novaupi',
      userId: 'SYSTEM',
      type: 'SETTLEMENT_CLEARING',
      currency: 'INR',
      status: 'ACTIVE',
      postedBalance: 500000000.0, // ₹50 Crore Tier-1 Equity Reserve
      holdsAmount: 0,
      availableBalance: 500000000.0,
      dailyTransferLimit: 1000000000,
      perTransactionLimit: 500000000,
      dailyTransferredAmount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      nickname: 'NovaBank Tier 1 Capital & Paid-in Equity (Mumbai DC)',
    };

    const sysVault: BankAccount = {
      id: 'acc_vault_reserve',
      accountNumber: '990000000001',
      ifscCode: 'NOVA0001001',
      micrCode: '400240001',
      branchName: 'Nariman Point Core, Mumbai',
      upiId: 'vault@novaupi',
      userId: 'SYSTEM',
      type: 'VAULT_RESERVE',
      currency: 'INR',
      status: 'ACTIVE',
      postedBalance: 502377045.0, // ₹50,23,77,045 (Vault reserve matching exact ledger assets)
      holdsAmount: 0,
      availableBalance: 502377045.0,
      dailyTransferLimit: 500000000,
      perTransactionLimit: 200000000,
      dailyTransferredAmount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      nickname: 'NovaBank Central Reserve Vault (RBI Current Account)',
    };

    const sysUpiClearing: BankAccount = {
      id: 'acc_clearing_upi',
      accountNumber: '990000000002',
      ifscCode: 'NOVA0001001',
      micrCode: '400240001',
      branchName: 'NPCI Clearing Hub, Mumbai',
      upiId: 'npci.clearing@novaupi',
      userId: 'SYSTEM',
      type: 'SETTLEMENT_CLEARING',
      currency: 'INR',
      status: 'ACTIVE',
      postedBalance: 0.0,
      holdsAmount: 0,
      availableBalance: 0.0,
      dailyTransferLimit: 500000000,
      perTransactionLimit: 100000000,
      dailyTransferredAmount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      nickname: 'NPCI UPI & IMPS Interbank Clearing Settlement',
    };

    const sysRtgsClearing: BankAccount = {
      id: 'acc_clearing_rtgs',
      accountNumber: '990000000003',
      ifscCode: 'NOVA0001001',
      micrCode: '400240001',
      branchName: 'RBI RTGS Settlement, Fort Mumbai',
      upiId: 'rbi.rtgs@novaupi',
      userId: 'SYSTEM',
      type: 'SETTLEMENT_CLEARING',
      currency: 'INR',
      status: 'ACTIVE',
      postedBalance: 0.0,
      holdsAmount: 0,
      availableBalance: 0.0,
      dailyTransferLimit: 500000000,
      perTransactionLimit: 200000000,
      dailyTransferredAmount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      nickname: 'RBI RTGS / NEFT Real-Time Gross Settlement Desk',
    };

    const sysFees: BankAccount = {
      id: 'acc_fee_revenue',
      accountNumber: '990000000004',
      ifscCode: 'NOVA0001001',
      micrCode: '400240001',
      branchName: 'Nariman Point Core, Mumbai',
      upiId: 'fees@novaupi',
      userId: 'SYSTEM',
      type: 'FEE_REVENUE',
      currency: 'INR',
      status: 'ACTIVE',
      postedBalance: 25.0, // Matching ₹25 RTGS fee revenue
      holdsAmount: 0,
      availableBalance: 25.0,
      dailyTransferLimit: 10000000,
      perTransactionLimit: 5000000,
      dailyTransferredAmount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      nickname: 'Banking Service Fee & GST Commission Revenue',
    };

    this.accounts.set(sysCapital.id, sysCapital);
    this.accounts.set(sysVault.id, sysVault);
    this.accounts.set(sysUpiClearing.id, sysUpiClearing);
    this.accounts.set(sysRtgsClearing.id, sysRtgsClearing);
    this.accounts.set(sysFees.id, sysFees);

    // 2. Seed Users (Indian Retail & Staff Personas)
    const elena: User = {
      id: 'user_elena_vance',
      email: 'elena@novabank.demo',
      name: 'Elena Vance (Sharma)',
      role: 'CUSTOMER',
      phone: '+91 98201 48210',
      upiId: 'elena@novaupi',
      kycStatus: 'VERIFIED',
      kycDetails: {
        legalName: 'Elena Vance Sharma',
        dateOfBirth: '1991-04-14',
        maskedPan: 'ABCDE••••F',
        maskedAadhaar: '•••• •••• 4921',
        address: 'Flat 1402, Sea Green Towers, Worli Sea Face, Mumbai, MH 400018',
        documentType: 'PAN_CARD',
        documentNumberMasked: 'PAN••••4921',
        submittedAt: '2026-01-10T11:00:00.000Z',
        reviewedAt: '2026-01-10T14:30:00.000Z',
        reviewedBy: 'sarah.compliance@novabank.demo',
      },
      createdAt: '2026-01-10T10:00:00.000Z',
    };

    const marcus: User = {
      id: 'user_marcus_brody',
      email: 'marcus@novabank.demo',
      name: 'Marcus Brody (Patel)',
      role: 'CUSTOMER',
      phone: '+91 97312 99482',
      upiId: 'marcus@novaupi',
      kycStatus: 'PENDING_REVIEW',
      kycDetails: {
        legalName: 'Marcus Brody Patel',
        dateOfBirth: '1987-11-22',
        maskedPan: 'BPKPB••••R',
        maskedAadhaar: '•••• •••• 1188',
        address: 'B-402, Indiranagar 100 Feet Road, Bengaluru, KA 560038',
        documentType: 'AADHAAR',
        documentNumberMasked: 'AADHAAR••••1188',
        submittedAt: '2026-11-08T09:15:00.000Z',
      },
      createdAt: '2026-11-08T09:00:00.000Z',
    };

    const sarahStaff: User = {
      id: 'user_sarah_jenkins',
      email: 'sarah.compliance@novabank.demo',
      name: 'Sarah Jenkins (Iyer)',
      role: 'STAFF',
      phone: '+91 98400 12040',
      upiId: 'sarah.ops@novaupi',
      kycStatus: 'VERIFIED',
      createdAt: '2025-06-01T08:00:00.000Z',
    };

    const alexAdmin: User = {
      id: 'user_alex_rivera',
      email: 'alex.admin@novabank.demo',
      name: 'Alex Rivera (Deshmukh)',
      role: 'ADMIN',
      phone: '+91 99200 88192',
      upiId: 'alex.admin@novaupi',
      kycStatus: 'VERIFIED',
      createdAt: '2025-01-01T08:00:00.000Z',
    };

    this.users.set(elena.id, elena);
    this.users.set(marcus.id, marcus);
    this.users.set(sarahStaff.id, sarahStaff);
    this.users.set(alexAdmin.id, alexAdmin);

    // Passwords default to "demo1234"
    const { hash, salt } = this.hashPassword('demo1234');
    this.userPasswords.set(elena.id, { hash, salt });
    this.userPasswords.set(marcus.id, { hash, salt });
    this.userPasswords.set(sarahStaff.id, { hash, salt });
    this.userPasswords.set(alexAdmin.id, { hash, salt });

    // 3. Seed Customer Bank Accounts (INR with Lakhs & Crores scale)
    const elenaChecking: BankAccount = {
      id: 'acc_elena_chk',
      accountNumber: '100482910401',
      ifscCode: 'NOVA0001001',
      micrCode: '400240001',
      branchName: 'Nariman Point Branch, Mumbai',
      upiId: 'elena@novaupi',
      userId: elena.id,
      type: 'CHECKING',
      currency: 'INR',
      status: 'ACTIVE',
      postedBalance: 485020.0, // ₹4,85,020.00 (4.85 Lakhs)
      holdsAmount: 7500.0, // ₹7,500.00 pending Bharat Petroleum POS pre-auth hold
      availableBalance: 477520.0, // ₹4,77,520.00
      dailyTransferLimit: 1000000.0, // ₹10,00,000 (10 Lakhs daily limit)
      perTransactionLimit: 500000.0, // ₹5,00,000 (5 Lakhs per txn for Tier 1 verified)
      dailyTransferredAmount: 0,
      createdAt: '2026-01-10T12:00:00.000Z',
      nickname: 'Primary Salary & UPI Current Account',
    };

    const elenaSavings: BankAccount = {
      id: 'acc_elena_sav',
      accountNumber: '200881923102',
      ifscCode: 'NOVA0001001',
      micrCode: '400240001',
      branchName: 'Nariman Point Branch, Mumbai',
      upiId: 'elena.savings@novaupi',
      userId: elena.id,
      type: 'SAVINGS',
      currency: 'INR',
      status: 'ACTIVE',
      postedBalance: 1842000.0, // ₹18,42,000.00 (18.42 Lakhs)
      holdsAmount: 0,
      availableBalance: 1842000.0,
      dailyTransferLimit: 2500000.0, // ₹25,00,000 (25 Lakhs)
      perTransactionLimit: 1000000.0, // ₹10,00,000 (10 Lakhs)
      dailyTransferredAmount: 0,
      createdAt: '2026-01-10T12:05:00.000Z',
      nickname: 'High-Yield Super Savings (7.25% p.a.)',
    };

    const marcusChecking: BankAccount = {
      id: 'acc_marcus_chk',
      accountNumber: '100994821503',
      ifscCode: 'NOVA0001002',
      micrCode: '560240002',
      branchName: 'Indiranagar Branch, Bengaluru',
      upiId: 'marcus@novaupi',
      userId: marcus.id,
      type: 'CHECKING',
      currency: 'INR',
      status: 'ACTIVE',
      postedBalance: 50000.0, // ₹50,000.00
      holdsAmount: 0,
      availableBalance: 50000.0,
      dailyTransferLimit: 50000.0, // Restricted pending Aadhaar/PAN KYC review
      perTransactionLimit: 25000.0,
      dailyTransferredAmount: 0,
      createdAt: '2026-11-08T09:30:00.000Z',
      nickname: 'Digital Everyday Savings Account',
    };

    this.accounts.set(elenaChecking.id, elenaChecking);
    this.accounts.set(elenaSavings.id, elenaSavings);
    this.accounts.set(marcusChecking.id, marcusChecking);

    // 4. Seed Beneficiaries (Indian Banking Rails: UPI, IMPS, NEFT, RTGS)
    const ben1: Beneficiary = {
      id: 'ben_1',
      userId: elena.id,
      name: 'Zerodha Broking Limited',
      accountNumber: '000405001948',
      ifscCode: 'HDFC0000060',
      bankName: 'HDFC Bank Limited',
      branchName: 'Kallada House, Bengaluru',
      upiId: 'zerodha@hdfcbank',
      accountType: 'CURRENT',
      isInternal: false,
      nickname: 'Zerodha Trading & Demat Funds',
      createdAt: '2026-02-01T10:00:00.000Z',
    };

    const ben2: Beneficiary = {
      id: 'ben_2',
      userId: elena.id,
      name: 'Marcus Brody Patel',
      accountNumber: marcusChecking.accountNumber,
      ifscCode: marcusChecking.ifscCode,
      bankName: 'NovaBank Core',
      branchName: 'Indiranagar Branch, Bengaluru',
      upiId: marcusChecking.upiId,
      accountType: 'SAVINGS',
      isInternal: true,
      nickname: 'Marcus (Friend / Instant UPI)',
      createdAt: '2026-03-01T15:00:00.000Z',
    };

    const ben3: Beneficiary = {
      id: 'ben_3',
      userId: elena.id,
      name: 'Adani Electricity Mumbai Ltd',
      accountNumber: '449102847199',
      ifscCode: 'ICIC0000004',
      bankName: 'ICICI Bank Limited',
      branchName: 'Bandra Kurla Complex, Mumbai',
      upiId: 'adani.elec@icici',
      accountType: 'CURRENT',
      isInternal: false,
      nickname: 'Mumbai Electricity Utility Bill',
      createdAt: '2026-02-15T09:30:00.000Z',
    };

    this.beneficiaries.set(ben1.id, ben1);
    this.beneficiaries.set(ben2.id, ben2);
    this.beneficiaries.set(ben3.id, ben3);

    // 5. Seed Historical Double-Entry Transactions with 2PC Distributed Traces & 12-Digit RRNs
    // Initial bank capital allocation (₹50 Crores)
    this.addSeededTransaction({
      id: 'txn_init_capital',
      referenceNumber: 'TXN-2026-00001',
      rrn: '260011000001',
      sourceAccountId: sysCapital.id,
      destinationAccountId: sysVault.id,
      sourceAccountMasked: '•••• 0000 (Capital Equity)',
      destinationAccountMasked: '•••• 0001 (Vault Reserve)',
      beneficiaryName: 'NovaBank Treasury Mumbai',
      beneficiaryUpiOrIfsc: 'NOVA0001001',
      amount: 500000000.0,
      fee: 0,
      currency: 'INR',
      type: 'DIRECT_DEPOSIT',
      status: 'POSTED',
      description: 'Initial RBI Tier 1 Regulatory Capital Allocation',
      initiatedByUserId: 'SYSTEM',
      createdAt: '2026-01-01T00:00:00.000Z',
      postedAt: '2026-01-01T00:00:00.000Z',
      distributedTraceId: 'trace-in-genesis-000001-mum',
      primaryNodeId: 'node-mum-dc1',
      sagaSteps: [
        {
          step: '1. ALLOCATE_VAULT_RESERVE',
          participant: 'VaultLedgerParticipant',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        {
          step: '2. REPLICATE_TO_BLR',
          participant: 'RaftConsensusParticipant',
          nodeId: 'node-blr-dc2',
          status: 'SUCCESS',
          timestamp: '2026-01-01T00:00:00.010Z',
        },
        {
          step: '3. COMMITTED_TO_DELHI_DR',
          participant: 'DisasterRecoveryParticipant',
          nodeId: 'node-del-dr3',
          status: 'SUCCESS',
          timestamp: '2026-01-01T00:00:00.020Z',
        },
      ],
      entries: [
        {
          id: 'ledg_cap_1',
          accountId: sysVault.id,
          accountNumber: sysVault.accountNumber,
          direction: 'DEBIT',
          amount: 500000000.0,
          runningBalanceAfter: 500000000.0,
          description: 'Initial vault capitalization debit',
        },
        {
          id: 'ledg_cap_2',
          accountId: sysCapital.id,
          accountNumber: sysCapital.accountNumber,
          direction: 'CREDIT',
          amount: 500000000.0,
          runningBalanceAfter: 500000000.0,
          description: 'Regulatory equity reserve credit',
        },
      ],
    });

    // Opening Deposit for Elena Savings (₹16,92,000.00)
    this.addSeededTransaction({
      id: 'txn_init_elena_savings',
      referenceNumber: 'TXN-2026-00050',
      rrn: '260101000050',
      sourceAccountId: sysVault.id,
      destinationAccountId: elenaSavings.id,
      sourceAccountMasked: '•••• 0001 (Vault Reserve)',
      destinationAccountMasked: '•••• 3102 (Elena Savings)',
      beneficiaryName: 'Elena Vance Sharma',
      beneficiaryUpiOrIfsc: 'NOVA0001001',
      amount: 1692000.0,
      fee: 0,
      currency: 'INR',
      type: 'DIRECT_DEPOSIT',
      status: 'POSTED',
      description: 'Opening deposit - Super Savings Account intake',
      initiatedByUserId: elena.id,
      createdAt: '2026-01-10T12:05:00.000Z',
      postedAt: '2026-01-10T12:05:00.000Z',
      distributedTraceId: 'trace-in-direct-000050-mum',
      primaryNodeId: 'node-mum-dc1',
      sagaSteps: [
        {
          step: '1. LOCAL_HOLD_PREPARED',
          participant: 'VaultDebitService',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-01-10T12:05:00.000Z',
        },
        {
          step: '2. REPLICATE_RAFT_LOG',
          participant: 'RaftCoreCluster',
          nodeId: 'node-blr-dc2',
          status: 'SUCCESS',
          timestamp: '2026-01-10T12:05:00.015Z',
        },
        {
          step: '3. DOUBLE_ENTRY_COMMITTED',
          participant: 'LedgerCommitService',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-01-10T12:05:00.025Z',
        },
      ],
      entries: [
        {
          id: 'ledg_sav_init_1',
          accountId: sysVault.id,
          accountNumber: sysVault.accountNumber,
          direction: 'DEBIT',
          amount: 1692000.0,
          runningBalanceAfter: 501692000.0,
          description: 'Branch cash deposit intake',
        },
        {
          id: 'ledg_sav_init_2',
          accountId: elenaSavings.id,
          accountNumber: elenaSavings.accountNumber,
          direction: 'CREDIT',
          amount: 1692000.0,
          runningBalanceAfter: 1692000.0,
          description: 'Opening savings deposit credit',
        },
      ],
    });

    // Salary credit via NEFT/Direct Deposit to Elena's Checking (₹4,50,000.00)
    this.addSeededTransaction({
      id: 'txn_init_elena_salary',
      referenceNumber: 'NEFT-2026-00101',
      rrn: '263051000101',
      sourceAccountId: sysVault.id,
      destinationAccountId: elenaChecking.id,
      sourceAccountMasked: '•••• 0001 (Vault Reserve)',
      destinationAccountMasked: '•••• 0401 (Elena Checking)',
      beneficiaryName: 'Tata Consultancy Services Payroll',
      beneficiaryUpiOrIfsc: 'NOVA0001001',
      amount: 450000.0,
      fee: 0,
      currency: 'INR',
      type: 'DIRECT_DEPOSIT',
      status: 'POSTED',
      description: 'Monthly Corporate Payroll Credit - TCS Ltd',
      initiatedByUserId: 'SYSTEM',
      createdAt: '2026-11-01T08:00:00.000Z',
      postedAt: '2026-11-01T08:00:00.000Z',
      distributedTraceId: 'trace-in-neft-000101-mum',
      primaryNodeId: 'node-mum-dc1',
      sagaSteps: [
        {
          step: '1. NEFT_BATCH_DEBIT_PREPARED',
          participant: 'RBI_Clearing_Gateway',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-11-01T08:00:00.000Z',
        },
        {
          step: '2. DOUBLE_ENTRY_COMMITTED',
          participant: 'LedgerService',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-11-01T08:00:00.018Z',
        },
      ],
      entries: [
        {
          id: 'ledg_init_1',
          accountId: sysVault.id,
          accountNumber: sysVault.accountNumber,
          direction: 'DEBIT',
          amount: 450000.0,
          runningBalanceAfter: 502142000.0,
          description: 'NEFT Corporate Payroll funding disbursement',
        },
        {
          id: 'ledg_init_2',
          accountId: elenaChecking.id,
          accountNumber: elenaChecking.accountNumber,
          direction: 'CREDIT',
          amount: 450000.0,
          runningBalanceAfter: 450000.0,
          description: 'Direct deposit salary credit',
        },
      ],
    });

    // Internal Transfer from Checking to Savings (₹1,50,000.00)
    this.addSeededTransaction({
      id: 'txn_elena_to_sav',
      referenceNumber: 'UPI-2026-00204',
      rrn: '263061000204',
      sourceAccountId: elenaChecking.id,
      destinationAccountId: elenaSavings.id,
      sourceAccountMasked: '•••• 0401 (Elena Checking)',
      destinationAccountMasked: '•••• 3102 (Elena Savings)',
      beneficiaryName: 'Elena Vance Sharma - Super Savings',
      beneficiaryUpiOrIfsc: 'elena.savings@novaupi',
      amount: 150000.0,
      fee: 0,
      currency: 'INR',
      type: 'INTERNAL_TRANSFER',
      status: 'POSTED',
      description: 'Automated monthly investment allocation to High Yield Savings',
      initiatedByUserId: elena.id,
      createdAt: '2026-11-02T10:15:00.000Z',
      postedAt: '2026-11-02T10:15:00.000Z',
      distributedTraceId: 'trace-in-internal-000204-mum',
      primaryNodeId: 'node-mum-dc1',
      sagaSteps: [
        {
          step: '1. LOCAL_MUTEX_ACQUIRED',
          participant: 'DistributedLockManager',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-11-02T10:15:00.000Z',
        },
        {
          step: '2. DOUBLE_ENTRY_COMMITTED',
          participant: 'LedgerService',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-11-02T10:15:00.012Z',
        },
      ],
      entries: [
        {
          id: 'ledg_sav_1',
          accountId: elenaChecking.id,
          accountNumber: elenaChecking.accountNumber,
          direction: 'DEBIT',
          amount: 150000.0,
          runningBalanceAfter: 300000.0,
          description: 'Transfer to High Yield Savings',
        },
        {
          id: 'ledg_sav_2',
          accountId: elenaSavings.id,
          accountNumber: elenaSavings.accountNumber,
          direction: 'CREDIT',
          amount: 150000.0,
          runningBalanceAfter: 1842000.0,
          description: 'Deposit from Checking',
        },
      ],
    });

    // RTGS High-Value Transfer to Zerodha (₹2,50,000.00) with ₹25 RBI clearing fee
    this.addSeededTransaction({
      id: 'txn_elena_rtgs_brokerage',
      referenceNumber: 'RTGS-2026-00350',
      rrn: '263081000350',
      sourceAccountId: elenaChecking.id,
      destinationAccountId: sysRtgsClearing.id,
      sourceAccountMasked: '•••• 0401 (Elena Checking)',
      destinationAccountMasked: '•••• 0003 (RBI RTGS Desk)',
      beneficiaryName: 'Zerodha Broking Limited',
      beneficiaryUpiOrIfsc: 'HDFC0000060',
      amount: 250000.0,
      fee: 25.0,
      currency: 'INR',
      type: 'RTGS',
      status: 'POSTED',
      description: 'Outbound RBI RTGS gross transfer for equity portfolio funding',
      initiatedByUserId: elena.id,
      createdAt: '2026-11-04T14:20:00.000Z',
      postedAt: '2026-11-04T14:22:00.000Z',
      distributedTraceId: 'trace-in-rtgs-000350-mum',
      primaryNodeId: 'node-mum-dc1',
      sagaSteps: [
        {
          step: '1. LOCAL_HOLD_PREPARED',
          participant: 'AccountService',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-11-04T14:20:00.000Z',
        },
        {
          step: '2. RBI_RTGS_SETTLEMENT_ROUTED',
          participant: 'RBI_RTGS_Switch',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-11-04T14:21:30.000Z',
        },
        {
          step: '3. DOUBLE_ENTRY_COMMITTED',
          participant: 'LedgerService',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-11-04T14:22:00.000Z',
        },
      ],
      entries: [
        {
          id: 'ledg_rtgs_1',
          accountId: elenaChecking.id,
          accountNumber: elenaChecking.accountNumber,
          direction: 'DEBIT',
          amount: 250000.0,
          runningBalanceAfter: 50000.0,
          description: 'Outbound RTGS settlement',
        },
        {
          id: 'ledg_rtgs_2',
          accountId: sysRtgsClearing.id,
          accountNumber: sysRtgsClearing.accountNumber,
          direction: 'CREDIT',
          amount: 250000.0,
          runningBalanceAfter: 250000.0,
          description: 'Settlement for Zerodha Broking Limited',
        },
        {
          id: 'ledg_rtgs_fee_1',
          accountId: elenaChecking.id,
          accountNumber: elenaChecking.accountNumber,
          direction: 'DEBIT',
          amount: 25.0,
          runningBalanceAfter: 49975.0,
          description: 'RTGS interbank gross settlement fee',
        },
        {
          id: 'ledg_rtgs_fee_2',
          accountId: sysFees.id,
          accountNumber: sysFees.accountNumber,
          direction: 'CREDIT',
          amount: 25.0,
          runningBalanceAfter: 1525.0,
          description: 'RTGS processing fee revenue',
        },
      ],
    });

    // RTGS interbank clearing settlement with vault
    this.addSeededTransaction({
      id: 'txn_rtgs_settlement',
      referenceNumber: 'TXN-2026-00351',
      rrn: '263081000351',
      sourceAccountId: sysRtgsClearing.id,
      destinationAccountId: sysVault.id,
      sourceAccountMasked: '•••• 0003 (RBI RTGS Desk)',
      destinationAccountMasked: '•••• 0001 (Vault Reserve)',
      beneficiaryName: 'Reserve Bank of India RTGS Settlement',
      beneficiaryUpiOrIfsc: 'NOVA0001001',
      amount: 250000.0,
      fee: 0,
      currency: 'INR',
      type: 'RTGS',
      status: 'POSTED',
      description: 'RBI interbank gross settlement draw from vault',
      initiatedByUserId: 'SYSTEM',
      createdAt: '2026-11-04T16:00:00.000Z',
      postedAt: '2026-11-04T16:00:00.000Z',
      distributedTraceId: 'trace-in-rtgs-set-000351-mum',
      primaryNodeId: 'node-mum-dc1',
      sagaSteps: [
        {
          step: '1. CLEAR_INTERBANK_POSITION',
          participant: 'TreasuryClearingDesk',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-11-04T16:00:00.000Z',
        },
      ],
      entries: [
        {
          id: 'ledg_rtgs_set_1',
          accountId: sysRtgsClearing.id,
          accountNumber: sysRtgsClearing.accountNumber,
          direction: 'DEBIT',
          amount: 250000.0,
          runningBalanceAfter: 0.0,
          description: 'Clear RTGS position',
        },
        {
          id: 'ledg_rtgs_set_2',
          accountId: sysVault.id,
          accountNumber: sysVault.accountNumber,
          direction: 'CREDIT',
          amount: 250000.0,
          runningBalanceAfter: 501892000.0,
          description: 'Vault draw for outbound RTGS settlement',
        },
      ],
    });

    // Inbound IMPS / UPI credit to replenish Elena's checking (₹4,35,045.00)
    this.addSeededTransaction({
      id: 'txn_elena_consulting_inflow',
      referenceNumber: 'UPI-2026-00412',
      rrn: '263101000412',
      sourceAccountId: sysUpiClearing.id,
      destinationAccountId: elenaChecking.id,
      sourceAccountMasked: '•••• 0002 (NPCI UPI Hub)',
      destinationAccountMasked: '•••• 0401 (Elena Checking)',
      beneficiaryName: 'Elena Vance Consulting Private Limited',
      beneficiaryUpiOrIfsc: 'elena@novaupi',
      amount: 435045.0,
      fee: 0,
      currency: 'INR',
      type: 'UPI',
      status: 'POSTED',
      description: 'UPI Instant P2B Payment - Client retainer invoice #802',
      initiatedByUserId: 'SYSTEM',
      createdAt: '2026-11-06T11:45:00.000Z',
      postedAt: '2026-11-06T11:45:00.000Z',
      distributedTraceId: 'trace-in-upi-000412-mum',
      primaryNodeId: 'node-mum-dc1',
      sagaSteps: [
        {
          step: '1. NPCI_SWITCH_INFLOW_ACK',
          participant: 'NPCI_UPI_Switch',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-11-06T11:45:00.000Z',
        },
        {
          step: '2. DOUBLE_ENTRY_COMMITTED',
          participant: 'LedgerService',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-11-06T11:45:00.008Z',
        },
      ],
      entries: [
        {
          id: 'ledg_upi_1',
          accountId: sysUpiClearing.id,
          accountNumber: sysUpiClearing.accountNumber,
          direction: 'DEBIT',
          amount: 435045.0,
          runningBalanceAfter: -435045.0,
          description: 'Incoming UPI switch clearing',
        },
        {
          id: 'ledg_upi_2',
          accountId: elenaChecking.id,
          accountNumber: elenaChecking.accountNumber,
          direction: 'CREDIT',
          amount: 435045.0,
          runningBalanceAfter: 485020.0,
          description: 'Client invoice payment credit',
        },
      ],
    });

    // NPCI UPI clearing settlement with vault
    this.addSeededTransaction({
      id: 'txn_upi_settlement',
      referenceNumber: 'TXN-2026-00413',
      rrn: '263101000413',
      sourceAccountId: sysVault.id,
      destinationAccountId: sysUpiClearing.id,
      sourceAccountMasked: '•••• 0001 (Vault Reserve)',
      destinationAccountMasked: '•••• 0002 (NPCI UPI Hub)',
      beneficiaryName: 'NPCI UPI Interbank Settlement Receiver',
      beneficiaryUpiOrIfsc: 'NOVA0001001',
      amount: 435045.0,
      fee: 0,
      currency: 'INR',
      type: 'UPI',
      status: 'POSTED',
      description: 'NPCI net multilateral inflow settlement to vault',
      initiatedByUserId: 'SYSTEM',
      createdAt: '2026-11-06T17:00:00.000Z',
      postedAt: '2026-11-06T17:00:00.000Z',
      distributedTraceId: 'trace-in-upi-set-000413-mum',
      primaryNodeId: 'node-mum-dc1',
      sagaSteps: [
        {
          step: '1. NPCI_NET_SETTLEMENT_POSTED',
          participant: 'VaultLedgerParticipant',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-11-06T17:00:00.000Z',
        },
      ],
      entries: [
        {
          id: 'ledg_upi_set_1',
          accountId: sysVault.id,
          accountNumber: sysVault.accountNumber,
          direction: 'DEBIT',
          amount: 435045.0,
          runningBalanceAfter: 502327045.0,
          description: 'Vault intake from NPCI clearing',
        },
        {
          id: 'ledg_upi_set_2',
          accountId: sysUpiClearing.id,
          accountNumber: sysUpiClearing.accountNumber,
          direction: 'CREDIT',
          amount: 435045.0,
          runningBalanceAfter: 0.0,
          description: 'Clear UPI interbank balance',
        },
      ],
    });

    // Opening deposit for Marcus (₹50,000.00)
    this.addSeededTransaction({
      id: 'txn_marcus_opening_dep',
      referenceNumber: 'IMPS-2026-00501',
      rrn: '263121000501',
      sourceAccountId: sysVault.id,
      destinationAccountId: marcusChecking.id,
      sourceAccountMasked: '•••• 0001 (Vault Reserve)',
      destinationAccountMasked: '•••• 1503 (Marcus Checking)',
      beneficiaryName: 'Marcus Brody Patel',
      beneficiaryUpiOrIfsc: 'marcus@novaupi',
      amount: 50000.0,
      fee: 0,
      currency: 'INR',
      type: 'DIRECT_DEPOSIT',
      status: 'POSTED',
      description: 'Initial digital account opening deposit',
      initiatedByUserId: marcus.id,
      createdAt: '2026-11-08T09:35:00.000Z',
      postedAt: '2026-11-08T09:35:00.000Z',
      distributedTraceId: 'trace-in-imps-000501-blr',
      primaryNodeId: 'node-blr-dc2',
      sagaSteps: [
        {
          step: '1. BRANCH_INTAKE_CONFIRMED',
          participant: 'BengaluruBranchGateway',
          nodeId: 'node-blr-dc2',
          status: 'SUCCESS',
          timestamp: '2026-11-08T09:35:00.000Z',
        },
        {
          step: '2. DOUBLE_ENTRY_COMMITTED',
          participant: 'LedgerService',
          nodeId: 'node-mum-dc1',
          status: 'SUCCESS',
          timestamp: '2026-11-08T09:35:00.014Z',
        },
      ],
      entries: [
        {
          id: 'ledg_marcus_1',
          accountId: sysVault.id,
          accountNumber: sysVault.accountNumber,
          direction: 'DEBIT',
          amount: 50000.0,
          runningBalanceAfter: 502377045.0,
          description: 'Branch funding intake debit',
        },
        {
          id: 'ledg_marcus_2',
          accountId: marcusChecking.id,
          accountNumber: marcusChecking.accountNumber,
          direction: 'CREDIT',
          amount: 50000.0,
          runningBalanceAfter: 50000.0,
          description: 'Opening deposit credit',
        },
      ],
    });
  }

  private addSeededTransaction(params: {
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
    type: TransactionRecord['type'];
    status: TransactionRecord['status'];
    description: string;
    initiatedByUserId: string;
    createdAt: string;
    postedAt?: string;
    distributedTraceId: string;
    primaryNodeId: string;
    sagaSteps: TransactionRecord['sagaSteps'];
    entries: Array<{
      id: string;
      accountId: string;
      accountNumber: string;
      direction: 'DEBIT' | 'CREDIT';
      amount: number;
      runningBalanceAfter: number;
      description: string;
    }>;
  }) {
    let seq = this.ledgerEntries.length + 1;
    const ledgerEntries: LedgerEntry[] = params.entries.map((e) => ({
      id: e.id,
      transactionId: params.id,
      sequenceNumber: seq++,
      accountId: e.accountId,
      accountNumber: e.accountNumber,
      direction: e.direction,
      amount: e.amount,
      currency: 'INR',
      runningBalanceAfter: e.runningBalanceAfter,
      entryType: 'STANDARD',
      description: e.description,
      nodeId: params.primaryNodeId,
      createdAt: params.createdAt,
    }));

    for (const le of ledgerEntries) {
      this.ledgerEntries.push(le);
    }

    const raw = `${params.id}|${params.amount}|${params.sourceAccountId}|${params.destinationAccountId}|${params.createdAt}`;
    const hashDigest = crypto.createHash('sha256').update(raw).digest('hex');

    const txn: TransactionRecord = {
      id: params.id,
      referenceNumber: params.referenceNumber,
      rrn: params.rrn,
      sourceAccountId: params.sourceAccountId,
      destinationAccountId: params.destinationAccountId,
      sourceAccountMasked: params.sourceAccountMasked,
      destinationAccountMasked: params.destinationAccountMasked,
      beneficiaryName: params.beneficiaryName,
      beneficiaryUpiOrIfsc: params.beneficiaryUpiOrIfsc,
      amount: params.amount,
      fee: params.fee,
      currency: params.currency,
      type: params.type,
      status: params.status,
      description: params.description,
      initiatedByUserId: params.initiatedByUserId,
      createdAt: params.createdAt,
      postedAt: params.postedAt,
      ledgerEntries,
      hashDigest,
      distributedTraceId: params.distributedTraceId,
      primaryNodeId: params.primaryNodeId,
      sagaSteps: params.sagaSteps,
    };

    this.transactions.set(txn.id, txn);
  }
}

export const db = new BankingStore();
