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
  Download,
  FileText,
  Filter,
  Printer,
  RefreshCw,
  Search,
  Server,
  Shield,
  X,
} from 'lucide-react';
import { AccountStatement, BankAccount, TransactionRecord } from '../types.ts';
import { api } from '../api.ts';
import { formatINR, formatDate } from '../utils/format.ts';

interface ActivityViewProps {
  accounts: BankAccount[];
  transactions: TransactionRecord[];
  onRefresh: () => void;
  selectedAccountIdForStatement?: string;
}

export const ActivityView: React.FC<ActivityViewProps> = ({
  accounts,
  transactions,
  onRefresh,
  selectedAccountIdForStatement,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('ALL');

  // Statement Generator modal
  const [activeStatement, setActiveStatement] = useState<AccountStatement | null>(null);
  const [statementAccountId, setStatementAccountId] = useState<string>(
    selectedAccountIdForStatement || accounts[0]?.id || ''
  );
  const [loadingStatement, setLoadingStatement] = useState(false);

  // Selected Transaction for ledger proof
  const [selectedTxn, setSelectedTxn] = useState<TransactionRecord | null>(null);

  // Filter logic
  const filtered = transactions.filter((t) => {
    if (selectedStatusFilter !== 'ALL' && t.status !== selectedStatusFilter) return false;
    if (selectedTypeFilter !== 'ALL' && t.type !== selectedTypeFilter) return false;
    if (selectedAccountFilter !== 'ALL') {
      if (t.sourceAccountId !== selectedAccountFilter && t.destinationAccountId !== selectedAccountFilter) {
        return false;
      }
    }
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchName = t.beneficiaryName.toLowerCase().includes(q);
      const matchDesc = t.description.toLowerCase().includes(q);
      const matchRef = t.referenceNumber.toLowerCase().includes(q);
      const matchRrn = t.rrn?.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchRef && !matchRrn) return false;
    }
    return true;
  });

  const handleGenerateStatement = async (accId = statementAccountId) => {
    if (!accId) return;
    setLoadingStatement(true);
    try {
      const res = await api.getStatement(accId);
      setActiveStatement(res);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoadingStatement(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Statement Trigger */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Passbook & Statement Records</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable transaction records with NPCI/RBI 12-digit RRNs and cryptographic proof
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={statementAccountId}
            onChange={(e) => setStatementAccountId(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-medium cursor-pointer"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname || a.type} (•••• {a.accountNumber.slice(-4)})
              </option>
            ))}
          </select>

          <button
            onClick={() => handleGenerateStatement()}
            disabled={loadingStatement}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
          >
            <FileText className="w-3.5 h-3.5" />
            {loadingStatement ? 'Generating...' : 'View Passbook'}
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search box */}
          <div className="relative md:col-span-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search payee, RRN, ref, VPA..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-blue-600"
            />
          </div>

          {/* Account selector */}
          <div>
            <select
              value={selectedAccountFilter}
              onChange={(e) => setSelectedAccountFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 cursor-pointer"
            >
              <option value="ALL">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nickname || a.type} (•••• {a.accountNumber.slice(-4)})
                </option>
              ))}
            </select>
          </div>

          {/* Status selector */}
          <div>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="POSTED">Posted</option>
              <option value="PENDING">Pending</option>
              <option value="REVERSED">Reversed</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          {/* Rail selector */}
          <div>
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 cursor-pointer"
            >
              <option value="ALL">All Payment Rails</option>
              <option value="UPI">UPI (Instant VPA)</option>
              <option value="IMPS">IMPS 24x7</option>
              <option value="RTGS">RTGS (&ge; ₹2 Lakhs)</option>
              <option value="NEFT">NEFT Batch Clearing</option>
              <option value="INTERNAL_TRANSFER">Internal Instant</option>
              <option value="DIRECT_DEPOSIT">Direct Deposit Payroll</option>
              <option value="REVERSAL">Reversal Entry</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>
            Showing <strong className="text-slate-800">{filtered.length}</strong> of {transactions.length} records
          </span>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 hover:text-slate-900 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh List
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Reference & 12-Digit RRN</th>
                <th className="px-5 py-3.5">Beneficiary / Memo</th>
                <th className="px-5 py-3.5">Accounts Flow</th>
                <th className="px-5 py-3.5">Rail</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Amount (INR)</th>
                <th className="px-5 py-3.5 text-right">Ledger Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                    No transactions match your filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((txn) => {
                  const isCredit = txn.type === 'DIRECT_DEPOSIT' || txn.beneficiaryName.includes('Consulting');
                  const isReversal = txn.type === 'REVERSAL' || txn.isReversal;

                  return (
                    <tr key={txn.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-[11px]">
                        <span className="font-bold text-slate-900 block">{txn.referenceNumber}</span>
                        <span className="text-blue-700 font-medium">RRN: {txn.rrn || '—'}</span>
                        <span className="text-slate-400 block text-[10px]">{formatDate(txn.createdAt)}</span>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{txn.beneficiaryName}</div>
                        {txn.beneficiaryUpiOrIfsc && (
                          <div className="text-[10px] font-mono text-blue-600">{txn.beneficiaryUpiOrIfsc}</div>
                        )}
                        <div className="text-slate-400 text-[11px] truncate max-w-xs">{txn.description}</div>
                      </td>

                      <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                        {txn.sourceAccountMasked} → {txn.destinationAccountMasked}
                      </td>

                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-700 text-[10px]">
                          {txn.type}
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        {txn.status === 'POSTED' ? (
                          <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Posted
                          </span>
                        ) : txn.status === 'REVERSED' ? (
                          <span className="text-amber-700 font-medium inline-flex items-center gap-1">
                            <RefreshCw className="w-3.5 h-3.5" /> Reversed
                          </span>
                        ) : (
                          <span className="text-rose-700 font-medium inline-flex items-center gap-1">
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
                          Proof
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Account Statement View Modal */}
      {activeStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">
                  NovaBank India · Official Account Passbook Statement
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">{activeStatement.period}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Statement ID: {activeStatement.statementId} · Account: {activeStatement.accountNumberMasked} · IFSC: NOVA0001001
                </p>
              </div>
              <button
                onClick={() => setActiveStatement(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Statement Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
              <div>
                <p className="text-slate-500 font-medium">Starting Balance</p>
                <p className="text-base font-bold font-mono text-slate-800 mt-0.5 tabular-nums">
                  {formatINR(activeStatement.startingBalance)}
                </p>
              </div>
              <div>
                <p className="text-slate-500 font-medium">Total Credits</p>
                <p className="text-base font-bold font-mono text-emerald-600 mt-0.5 tabular-nums">
                  +{formatINR(activeStatement.totalCredits)}
                </p>
              </div>
              <div>
                <p className="text-slate-500 font-medium">Total Debits</p>
                <p className="text-base font-bold font-mono text-slate-800 mt-0.5 tabular-nums">
                  -{formatINR(activeStatement.totalDebits)}
                </p>
              </div>
              <div>
                <p className="text-slate-500 font-medium">Ending Balance</p>
                <p className="text-base font-bold font-mono text-blue-600 mt-0.5 tabular-nums">
                  {formatINR(activeStatement.endingBalance)}
                </p>
              </div>
            </div>

            {/* Journal Entries in Statement */}
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                Itemized Ledger Entries ({activeStatement.entries.length})
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Narration</th>
                      <th className="p-2.5">Direction</th>
                      <th className="p-2.5 text-right">Amount (INR)</th>
                      <th className="p-2.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeStatement.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="p-2.5 font-mono text-[11px] text-slate-500">
                          {formatDate(entry.createdAt)}
                        </td>
                        <td className="p-2.5 text-slate-800 font-medium">{entry.description}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              entry.direction === 'DEBIT' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {entry.direction}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold tabular-nums">
                          {entry.direction === 'CREDIT' ? '+' : '-'}{formatINR(entry.amount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {formatINR(entry.runningBalanceAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cryptographic verification proof footer */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-500 space-y-1 font-mono">
              <div className="flex justify-between">
                <span>Ledger Proof Hash:</span>
                <span className="text-slate-800">{activeStatement.ledgerProofHash}</span>
              </div>
              <div className="flex justify-between">
                <span>Generated Timestamp:</span>
                <span>{activeStatement.generatedAt}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">Official simulated core banking record (RBI Compliant Format)</span>
              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" /> Print Passbook Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Detail Proof Modal */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Ledger Posting & 2PC Saga Proof</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Ref: {selectedTxn.referenceNumber} · RRN: {selectedTxn.rrn}
                </p>
              </div>
              <button onClick={() => setSelectedTxn(null)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <div className="space-y-2 font-mono bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-500">Transaction ID:</span>
                <span className="text-slate-800">{selectedTxn.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">12-Digit RRN:</span>
                <span className="text-blue-700 font-bold">{selectedTxn.rrn}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Trace ID:</span>
                <span className="text-slate-800 truncate max-w-xs">{selectedTxn.distributedTraceId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Hash (SHA-256):</span>
                <span className="text-slate-800 truncate max-w-xs">{selectedTxn.hashDigest}</span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-800 mb-1.5">Double-Entry Journal Postings</h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 text-slate-500 uppercase">
                    <tr>
                      <th className="p-2">Account</th>
                      <th className="p-2">Direction</th>
                      <th className="p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedTxn.ledgerEntries.map((le) => (
                      <tr key={le.id}>
                        <td className="p-2 font-mono text-slate-700">{le.accountNumber} ({le.accountId})</td>
                        <td className="p-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              le.direction === 'DEBIT' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {le.direction}
                          </span>
                        </td>
                        <td className="p-2 text-right font-mono font-semibold">{formatINR(le.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedTxn(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
