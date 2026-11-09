/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  FileText,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Server,
  Shield,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-react';
import { BankAccount, TransactionRecord, User } from '../types.ts';
import { formatINR, formatIndianCompact, formatDate } from '../utils/format.ts';

interface OverviewViewProps {
  currentUser: User;
  accounts: BankAccount[];
  transactions: TransactionRecord[];
  onOpenTransfer: (sourceAccountId?: string) => void;
  onViewStatements: (accountId: string) => void;
  onSimulateHold: (accountId: string) => void;
  onSimulateRetry: () => void;
  onSimulateConcurrency: () => void;
  onSimulateSagaTimeout?: () => void;
  onNavigateTab: (tab: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  currentUser,
  accounts,
  transactions,
  onOpenTransfer,
  onViewStatements,
  onSimulateHold,
  onSimulateRetry,
  onSimulateConcurrency,
  onSimulateSagaTimeout,
  onNavigateTab,
}) => {
  const [selectedTxn, setSelectedTxn] = useState<TransactionRecord | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);

  const totalPostedBalance = accounts.reduce((acc, a) => acc + a.postedBalance, 0);
  const totalAvailableBalance = accounts.reduce((acc, a) => acc + a.availableBalance, 0);
  const totalHolds = accounts.reduce((acc, a) => acc + a.holdsAmount, 0);

  const recentTransactions = transactions.slice(0, 8);
  const primaryAccount = accounts[0];

  const handleCopyUpi = (upiId: string) => {
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* KYC Warning if Pending or Unverified */}
      {currentUser.kycStatus !== 'VERIFIED' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-amber-900">
                {currentUser.kycStatus === 'PENDING_REVIEW'
                  ? 'Simulated PAN & Aadhaar KYC Under Review'
                  : 'Action Required: Submit PAN & Aadhaar KYC'}
              </h2>
              <p className="text-xs text-amber-700 mt-0.5">
                {currentUser.kycStatus === 'PENDING_REVIEW'
                  ? 'Your Indian identity verification (PAN & Aadhaar) is currently pending review by compliance desk. Transfer limits capped at ₹50,000.00.'
                  : 'Submit simulated PAN Card and Aadhaar verification to unlock standard ₹10,00,000.00 (10 Lakhs) daily transfer limits.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('kyc')}
            className="px-3.5 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer shrink-0"
          >
            Review KYC Profile →
          </button>
        </div>
      )}

      {/* Hero Financial KPI Strip (INR Lakhs / Crores) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Total Posted Balance</p>
          <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1 font-mono tabular-nums">
            {formatINR(totalPostedBalance)}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
            <span>Derived strictly from ledger</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Available Liquidity</p>
          <p className="text-2xl font-bold tracking-tight text-blue-600 mt-1 font-mono tabular-nums">
            {formatINR(totalAvailableBalance)}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
            <span>Posted minus active holds</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <p className="text-xs font-medium text-slate-500">Active Ledger Holds</p>
          <p className="text-2xl font-bold tracking-tight text-amber-600 mt-1 font-mono tabular-nums">
            {formatINR(totalHolds)}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
            <span>Pending POS / Merchant holds</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Distributed Invariants</p>
            <p className="text-sm font-semibold text-emerald-600 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Double-Entry Balanced
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
            <span>Raft Multi-Node</span>
            <span aria-hidden="true">·</span>
            <span>2PC Saga Ready</span>
          </div>
        </div>
      </div>

      {/* UPI Quick Pay Bar */}
      {primaryAccount && (
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5" /> NPCI Unified Payments Interface (UPI 2.0)
            </span>
            <div className="flex items-center gap-3">
              <h3 className="text-base font-bold text-white font-mono">
                VPA: {primaryAccount.upiId || `${currentUser.name.toLowerCase()}@novaupi`}
              </h3>
              <button
                onClick={() => handleCopyUpi(primaryAccount.upiId || 'elena@novaupi')}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-xs text-blue-200 font-mono transition-colors flex items-center gap-1 cursor-pointer"
                title="Copy UPI ID"
              >
                <Copy className="w-3 h-3" />
                {copiedUpi ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-blue-200">
              Linked to Account {primaryAccount.accountNumber} · IFSC: <strong className="text-white font-mono">{primaryAccount.ifscCode}</strong> · Branch: {primaryAccount.branchName}
            </p>
          </div>

          <button
            onClick={() => onOpenTransfer()}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-400 active:scale-98 text-white text-xs font-bold rounded-lg transition-all shadow-md whitespace-nowrap cursor-pointer shrink-0"
          >
            Pay with UPI / IMPS →
          </button>
        </div>
      )}

      {/* Accounts Cards Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Deposit Accounts (INR)</h2>
          <span className="text-xs text-slate-500">
            IFSC: <strong className="font-mono text-slate-700">NOVA0001001</strong> · MICR: <strong className="font-mono text-slate-700">400240001</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {accounts.map((acc) => {
            const isChecking = acc.type === 'CHECKING';
            const maskedNum = `•••• ${acc.accountNumber.slice(-4)}`;

            return (
              <div
                key={acc.id}
                className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs relative flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        {isChecking ? 'Current / Salary Account' : 'High-Yield Super Savings'}
                      </span>
                      <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                        {acc.nickname || (isChecking ? 'Everyday UPI Account' : 'Super Savings')}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                        <span className="font-mono font-medium text-slate-700">{acc.accountNumber}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-blue-700">{acc.ifscCode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{acc.status}</span>
                        {!isChecking && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 font-semibold">7.25% p.a.</span>
                          </>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        UPI VPA: {acc.upiId}
                      </div>
                    </div>

                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600">
                      <CreditCard className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Available Balance</p>
                      <p className="text-2xl font-bold text-slate-900 mt-0.5 font-mono tabular-nums">
                        {formatINR(acc.availableBalance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Posted Balance</p>
                      <p className="text-lg font-semibold text-slate-700 mt-0.5 font-mono tabular-nums">
                        {formatINR(acc.postedBalance)}
                      </p>
                    </div>
                  </div>

                  {acc.holdsAmount > 0 && (
                    <div className="mt-3 bg-amber-50/70 border border-amber-200/60 rounded-lg p-2.5 text-xs text-amber-800 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        Hold: {formatINR(acc.holdsAmount)} (e.g. Fuel Pre-Auth Hold)
                      </span>
                      <span className="text-[11px] text-amber-700 font-medium">Restricted from spend</span>
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Daily Limit: <strong className="font-mono text-slate-700">{formatINR(acc.dailyTransferLimit)}</strong>
                    </span>
                    <span>
                      Per Txn: <strong className="font-mono text-slate-700">{formatINR(acc.perTransactionLimit)}</strong>
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenTransfer(acc.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" /> Transfer Funds
                    </button>
                    <button
                      onClick={() => onViewStatements(acc.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" /> Passbook
                    </button>
                  </div>

                  {isChecking && (
                    <button
                      onClick={() => onSimulateHold(acc.id)}
                      className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2 transition-colors cursor-pointer"
                      title="Simulates an instant ₹2,500 fuel station pre-authorization hold to test available balance reduction"
                    >
                      + Simulate ₹2,500 Hold
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Interactive Distributed Mechanics Sandbox */}
      <section className="bg-slate-50 border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              Distributed Systems Chaos & Concurrency Sandbox
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Trigger real-time edge cases on the running distributed cluster to observe 2PC Saga compensation and Raft consensus.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onSimulateRetry}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Test idempotency replay with same key"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              Test Idempotency Replay
            </button>

            <button
              onClick={onSimulateConcurrency}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Fire 4 parallel transfers attempting to overdraft balance"
            >
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              Test Concurrent Mutex Locks
            </button>

            {onSimulateSagaTimeout && (
              <button
                onClick={onSimulateSagaTimeout}
                className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Simulate NPCI Switch timeout triggering automatic Saga rollback"
              >
                <Zap className="w-3.5 h-3.5 text-rose-600" />
                Simulate NPCI Switch Timeout
              </button>
            )}

            <button
              onClick={() => onNavigateTab('staff')}
              className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Server className="w-3.5 h-3.5" />
              Cluster Topology Console
            </button>
          </div>
        </div>
      </section>

      {/* Recent Activity Table (INR) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recent Transactions</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live double-entry postings with 12-digit RRNs & distributed trace IDs
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('activity')}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
          >
            View All ({transactions.length}) →
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Transaction / RRN</th>
                  <th className="px-5 py-3">Account Flow & VPA</th>
                  <th className="px-5 py-3">Payment Rail</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Amount (INR)</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTransactions.map((txn) => {
                  const isCredit = txn.type === 'DIRECT_DEPOSIT' || txn.beneficiaryName.includes('Consulting');
                  const isReversal = txn.type === 'REVERSAL' || txn.isReversal;

                  return (
                    <tr key={txn.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{txn.beneficiaryName}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>{formatDate(txn.createdAt)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-slate-600 font-medium">RRN: {txn.rrn || '—'}</span>
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="text-slate-700 font-mono text-[11px]">
                          {txn.sourceAccountMasked} → {txn.destinationAccountMasked}
                        </div>
                        <div className="text-slate-400 text-[11px] truncate max-w-xs">{txn.description}</div>
                      </td>

                      <td className="px-5 py-3.5">
                        <span className="font-bold text-slate-700 px-2 py-0.5 rounded bg-slate-100 text-[10px]">
                          {txn.type}
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        {txn.status === 'POSTED' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Posted
                          </span>
                        ) : txn.status === 'REVERSED' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                            <RefreshCw className="w-3.5 h-3.5" /> Reversed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                            <AlertCircle className="w-3.5 h-3.5" /> {txn.status}
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-right font-mono font-semibold tabular-nums">
                        <span className={isReversal ? 'text-amber-600' : isCredit ? 'text-emerald-600' : 'text-slate-900'}>
                          {isCredit ? '+' : '-'}{formatINR(txn.amount)}
                        </span>
                        {txn.fee > 0 && (
                          <div className="text-[10px] text-slate-400 font-normal">
                            +{formatINR(txn.fee)} fee
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedTxn(txn)}
                          className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                        >
                          Ledger Proof
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Transaction Ledger & Saga Detail Modal */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Ledger Entry & 2PC Saga Proof</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Ref: {selectedTxn.referenceNumber} · RRN: {selectedTxn.rrn}
                </p>
              </div>
              <button
                onClick={() => setSelectedTxn(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Transaction ID:</span>
                  <span className="text-slate-800">{selectedTxn.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">12-Digit RRN:</span>
                  <span className="text-blue-700 font-bold">{selectedTxn.rrn}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Distributed Trace ID:</span>
                  <span className="text-slate-800 truncate max-w-xs">{selectedTxn.distributedTraceId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Primary Core Node:</span>
                  <span className="text-emerald-700 font-bold">{selectedTxn.primaryNodeId || 'node-mum-dc1'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">SHA-256 Digest:</span>
                  <span className="text-slate-800 truncate max-w-xs">{selectedTxn.hashDigest}</span>
                </div>
              </div>

              {/* 2PC / Saga Execution Trace Stepper */}
              {selectedTxn.sagaSteps && selectedTxn.sagaSteps.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-800 mb-1.5">2PC / Saga Distributed Transaction Steps</h4>
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                    {selectedTxn.sagaSteps.map((s, idx) => (
                      <div key={idx} className="flex items-start justify-between text-[11px]">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-slate-900">{s.step}</span>
                            <span className="text-slate-500 block">{s.participant} ({s.nodeId})</span>
                            {s.details && <span className="text-slate-600 italic block">{s.details}</span>}
                          </div>
                        </div>
                        <span className="font-mono text-slate-400 shrink-0 text-[10px]">
                          {new Date(s.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Double-Entry Journal Postings */}
              <div>
                <h4 className="font-semibold text-slate-800 mb-2">Double-Entry Journal Postings (INR)</h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase">
                      <tr>
                        <th className="p-2">Account</th>
                        <th className="p-2">Direction</th>
                        <th className="p-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedTxn.ledgerEntries.map((le) => (
                        <tr key={le.id}>
                          <td className="p-2 font-mono text-slate-700">
                            {le.accountNumber} ({le.accountId})
                          </td>
                          <td className="p-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                le.direction === 'DEBIT' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {le.direction}
                            </span>
                          </td>
                          <td className="p-2 text-right font-mono tabular-nums font-semibold">
                            {formatINR(le.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedTxn.reversalReason && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-900">
                  <p className="font-semibold">Reversal Audit Notice:</p>
                  <p className="mt-0.5">{selectedTxn.reversalReason}</p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedTxn(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Close Audit Proof
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
