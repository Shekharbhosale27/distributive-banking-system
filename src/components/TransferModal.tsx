/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Info,
  Lock,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import { BankAccount, Beneficiary, PaymentRail, TransactionRecord, User } from '../types.ts';
import { api } from '../api.ts';
import { formatINR } from '../utils/format.ts';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  accounts: BankAccount[];
  initialSourceAccountId?: string;
  onTransferSuccess: (txn: TransactionRecord) => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  accounts,
  initialSourceAccountId,
  onTransferSuccess,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [sourceAccountId, setSourceAccountId] = useState<string>(
    initialSourceAccountId || accounts[0]?.id || ''
  );
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState<string>('');
  const [isAddingNewPayee, setIsAddingNewPayee] = useState<boolean>(false);

  // New Payee fields (Indian Banking: IFSC & UPI)
  const [newPayeeName, setNewPayeeName] = useState('');
  const [newPayeeAccount, setNewPayeeAccount] = useState('');
  const [newPayeeIfsc, setNewPayeeIfsc] = useState('NOVA0001001');
  const [newPayeeBank, setNewPayeeBank] = useState('NovaBank Core');
  const [newPayeeUpiId, setNewPayeeUpiId] = useState('');

  // Transfer Fields
  const [amount, setAmount] = useState<string>('');
  const [transferType, setTransferType] = useState<PaymentRail>('UPI');
  const [destinationUpiInput, setDestinationUpiInput] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  // Execution states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [sagaProgressStep, setSagaProgressStep] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedTxn, setCompletedTxn] = useState<TransactionRecord | null>(null);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);

  // Load beneficiaries & generate fresh idempotency key on open
  useEffect(() => {
    if (isOpen) {
      api.getBeneficiaries().then((res) => {
        setBeneficiaries(res.beneficiaries);
        if (res.beneficiaries.length > 0 && !selectedBeneficiaryId) {
          setSelectedBeneficiaryId(res.beneficiaries[0].id);
        }
      });
      generateNewIdempotencyKey();
      setStep(1);
      setSagaProgressStep(0);
      setErrorMessage(null);
      setCompletedTxn(null);
      setReplayNotice(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialSourceAccountId) {
      setSourceAccountId(initialSourceAccountId);
    }
  }, [initialSourceAccountId]);

  const generateNewIdempotencyKey = () => {
    const key = `IDEMP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setIdempotencyKey(key);
  };

  if (!isOpen) return null;

  const sourceAccount = accounts.find((a) => a.id === sourceAccountId) || accounts[0];
  const selectedBeneficiary = beneficiaries.find((b) => b.id === selectedBeneficiaryId);

  const parsedAmount = parseFloat(amount) || 0;
  // Indian rail fees: RTGS = ₹25.00, IMPS external = ₹5.00, UPI = ₹0.00
  let fee = 0.0;
  if (transferType === 'RTGS') fee = 25.0;
  else if (transferType === 'IMPS' && !selectedBeneficiary?.isInternal) fee = 5.0;

  const totalDeduction = parsedAmount + fee;

  // Validation rules
  const isOverAvailable = sourceAccount && totalDeduction > sourceAccount.availableBalance;
  const isOverPerTxnLimit = sourceAccount && parsedAmount > sourceAccount.perTransactionLimit;
  const isKycRestricted = currentUser.kycStatus !== 'VERIFIED' && parsedAmount > 50000;
  const isRtgsBelowMin = transferType === 'RTGS' && parsedAmount < 200000;

  const handleCreateNewPayee = async () => {
    if (!newPayeeName || (!newPayeeAccount && !newPayeeUpiId)) {
      setErrorMessage('Please fill in payee name and either Account+IFSC or UPI ID');
      return;
    }
    try {
      const res = await api.addBeneficiary({
        name: newPayeeName,
        accountNumber: newPayeeAccount || '0000000000',
        ifscCode: newPayeeIfsc || 'NOVA0001001',
        bankName: newPayeeBank,
        upiId: newPayeeUpiId,
      });
      setBeneficiaries((prev) => [...prev, res.beneficiary]);
      setSelectedBeneficiaryId(res.beneficiary.id);
      setIsAddingNewPayee(false);
      setErrorMessage(null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to add payee');
    }
  };

  const handleExecuteTransfer = async (overrideKey?: string) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setReplayNotice(null);

    const keyToUse = overrideKey || idempotencyKey;

    try {
      // Simulate real-time 2PC Saga visual progress
      setSagaProgressStep(1);
      await new Promise((r) => setTimeout(r, 250));
      setSagaProgressStep(2);
      await new Promise((r) => setTimeout(r, 250));

      const res = await api.executeTransfer({
        sourceAccountId: sourceAccount.id,
        destinationAccountNumber: selectedBeneficiary?.accountNumber,
        destinationIfscCode: selectedBeneficiary?.ifscCode,
        destinationUpiId: selectedBeneficiary?.upiId || destinationUpiInput,
        beneficiaryName: selectedBeneficiary?.name || 'Beneficiary Payee',
        beneficiaryUpiOrIfsc: selectedBeneficiary?.upiId || selectedBeneficiary?.ifscCode,
        amount: parsedAmount,
        type: transferType,
        description: description || 'Funds Transfer',
        idempotencyKey: keyToUse,
      });

      setSagaProgressStep(3);
      await new Promise((r) => setTimeout(r, 150));
      setSagaProgressStep(4);

      setCompletedTxn(res.transaction);
      onTransferSuccess(res.transaction);
      setStep(4);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Transfer failed');
      setSagaProgressStep(0);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestIdempotentReplay = async () => {
    if (!completedTxn?.idempotencyKey) return;
    setIsSubmitting(true);
    try {
      const res = await api.simulateRetry(completedTxn.idempotencyKey);
      setReplayNotice(
        `✓ Idempotency Replay Confirmed: Server recognized key ${completedTxn.idempotencyKey} and returned original transaction (RRN ${res.transaction.rrn}) with zero duplicate balance debit.`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Replay test failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">Transfer Funds (INR ₹)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Step {step} of 4 · Distributed 2PC Saga · NPCI / RBI Rails
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[80vh] space-y-6 text-xs">
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Transfer Blocked by Rule:</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* STEP 1: Select Accounts & Beneficiary & Rail */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Debit From Account</label>
                <select
                  value={sourceAccountId}
                  onChange={(e) => setSourceAccountId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-blue-600 cursor-pointer"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.nickname || acc.type} (•••• {acc.accountNumber.slice(-4)}) — Available: {formatINR(acc.availableBalance)}
                    </option>
                  ))}
                </select>
                {sourceAccount && (
                  <div className="mt-2 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      IFSC: <strong className="font-mono text-slate-700">{sourceAccount.ifscCode}</strong>
                    </span>
                    <span>
                      Posted: <strong className="font-mono text-slate-700">{formatINR(sourceAccount.postedBalance)}</strong>
                    </span>
                    {sourceAccount.holdsAmount > 0 && (
                      <span className="text-amber-600">
                        Hold: <strong className="font-mono">{formatINR(sourceAccount.holdsAmount)}</strong>
                      </span>
                    )}
                    <span>
                      Available: <strong className="font-mono text-blue-700">{formatINR(sourceAccount.availableBalance)}</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Indian Payment Rail Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Payment Rail & Network</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setTransferType('UPI')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                      transferType === 'UPI'
                        ? 'border-blue-600 bg-blue-50/70 font-semibold text-blue-900'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <p className="font-bold flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5 text-blue-600" /> UPI
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Instant · Free</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTransferType('IMPS')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                      transferType === 'IMPS'
                        ? 'border-blue-600 bg-blue-50/70 font-semibold text-blue-900'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <p className="font-bold">IMPS 24x7</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">₹5.00 Fee · Real-time</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTransferType('NEFT')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                      transferType === 'NEFT'
                        ? 'border-blue-600 bg-blue-50/70 font-semibold text-blue-900'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <p className="font-bold">NEFT</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Free · Batch clearing</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTransferType('RTGS')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                      transferType === 'RTGS'
                        ? 'border-blue-600 bg-blue-50/70 font-semibold text-blue-900'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <p className="font-bold">RTGS</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">₹25.00 · &ge; ₹2 Lakhs</p>
                  </button>
                </div>
              </div>

              {/* Beneficiary Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-semibold text-slate-700">Select Payee / Beneficiary</label>
                  <button
                    onClick={() => setIsAddingNewPayee(!isAddingNewPayee)}
                    className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                  >
                    {isAddingNewPayee ? 'Select Existing Payee' : '+ Add New Payee'}
                  </button>
                </div>

                {!isAddingNewPayee ? (
                  <div className="space-y-2">
                    <select
                      value={selectedBeneficiaryId}
                      onChange={(e) => {
                        setSelectedBeneficiaryId(e.target.value);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-blue-600 cursor-pointer"
                    >
                      {beneficiaries.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.bankName} · IFSC: {b.ifscCode} · VPA: {b.upiId || '—'}) {b.isInternal ? '[NovaBank Instant]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <p className="font-semibold text-slate-800">Add Simulated Indian Payee</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-500">Payee Legal Name</label>
                        <input
                          type="text"
                          value={newPayeeName}
                          onChange={(e) => setNewPayeeName(e.target.value)}
                          placeholder="e.g. Rahul Verma"
                          className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500">Account Number</label>
                        <input
                          type="text"
                          value={newPayeeAccount}
                          onChange={(e) => setNewPayeeAccount(e.target.value)}
                          placeholder="e.g. 100994821503"
                          className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 mt-1 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500">IFSC Code (11-chars)</label>
                        <input
                          type="text"
                          value={newPayeeIfsc}
                          onChange={(e) => setNewPayeeIfsc(e.target.value.toUpperCase())}
                          placeholder="NOVA0001001"
                          className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 mt-1 font-mono uppercase"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500">UPI ID / VPA (Optional)</label>
                        <input
                          type="text"
                          value={newPayeeUpiId}
                          onChange={(e) => setNewPayeeUpiId(e.target.value)}
                          placeholder="rahul@okhdfcbank"
                          className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 mt-1 font-mono"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleCreateNewPayee}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium cursor-pointer"
                    >
                      Save Payee
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Amount & Memo */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-semibold text-slate-700">Transfer Amount (INR ₹)</label>
                  <span className="text-[11px] text-slate-500">
                    Available: <strong className="font-mono text-slate-800">{formatINR(sourceAccount.availableBalance)}</strong>
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">₹</span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-lg font-bold text-slate-900 focus:outline-blue-600"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {[1000, 5000, 25000, 100000, 200000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(String(preset))}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-mono cursor-pointer"
                    >
                      ₹{preset.toLocaleString('en-IN')}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const maxPossible = Math.max(0, sourceAccount.availableBalance - fee);
                      setAmount(String(Math.floor(maxPossible)));
                    }}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded text-[11px] cursor-pointer"
                  >
                    Max ({formatINR(Math.max(0, sourceAccount.availableBalance - fee))})
                  </button>
                </div>

                {/* Validation Warnings */}
                {isOverAvailable && (
                  <p className="mt-2 text-rose-600 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Insufficient funds: Amount plus fees ({formatINR(totalDeduction)}) exceeds available balance ({formatINR(sourceAccount.availableBalance)}).
                  </p>
                )}
                {isOverPerTxnLimit && (
                  <p className="mt-2 text-rose-600 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Exceeds per-transaction limit of {formatINR(sourceAccount.perTransactionLimit)}.
                  </p>
                )}
                {isKycRestricted && (
                  <p className="mt-2 text-amber-600 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Unverified KYC: Unverified profiles are capped at ₹50,000.00 per transfer.
                  </p>
                )}
                {isRtgsBelowMin && (
                  <p className="mt-2 text-rose-600 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> RTGS Rule: Under RBI rules, RTGS requires minimum ₹2,00,000.00. Use UPI or IMPS instead.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Payment Remark / Narration</label>
                <input
                  type="text"
                  placeholder="e.g. Rent, Salary, Supplier Invoice, or Family"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-blue-600"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                <div className="flex justify-between text-slate-500">
                  <span>Transfer Principal:</span>
                  <span className="font-mono text-slate-800">{formatINR(parsedAmount)}</span>
                </div>
                {fee > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>{transferType} Interbank Clearing Fee:</span>
                    <span className="font-mono text-amber-700">+{formatINR(fee)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                  <span>Total Outflow Debit:</span>
                  <span className="font-mono text-blue-700">{formatINR(totalDeduction)}</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Review & Distributed Idempotency Inspection */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Debit From:</span>
                  <span className="font-semibold text-slate-900">
                    {sourceAccount.nickname} (•••• {sourceAccount.accountNumber.slice(-4)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">To Payee:</span>
                  <span className="font-semibold text-slate-900">
                    {selectedBeneficiary?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">IFSC & Rail:</span>
                  <span className="font-mono text-slate-700">
                    {selectedBeneficiary?.ifscCode} · {transferType}
                  </span>
                </div>
                {selectedBeneficiary?.upiId && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">UPI VPA:</span>
                    <span className="font-mono text-blue-700">{selectedBeneficiary.upiId}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Narration:</span>
                  <span className="text-slate-800">{description || 'Funds Transfer'}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-bold text-slate-900">
                  <span>Total Debit Amount:</span>
                  <span className="font-mono text-blue-600">{formatINR(totalDeduction)}</span>
                </div>
              </div>

              {/* Idempotency Key Inspector Card */}
              <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Distributed Idempotency Protection
                  </span>
                  <button
                    onClick={generateNewIdempotencyKey}
                    className="text-[11px] text-blue-700 hover:underline cursor-pointer"
                  >
                    Regenerate Key
                  </button>
                </div>
                <p className="text-[11px] text-blue-800">
                  Unique token preventing duplicate payments across network drops or NPCI switch retries.
                </p>
                <div className="bg-white border border-blue-200 rounded px-2.5 py-1.5 font-mono text-[11px] text-slate-700 break-all select-all">
                  {idempotencyKey}
                </div>
              </div>

              {/* Live Saga Progress Stepper while Submitting */}
              {isSubmitting && (
                <div className="bg-slate-900 text-white rounded-xl p-4 space-y-2.5 font-mono text-[11px]">
                  <p className="text-slate-400 uppercase text-[10px] tracking-wider font-bold flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    Executing 2PC / Saga Distributed Consensus
                  </p>
                  <div className="space-y-1.5">
                    <div className={`flex items-center gap-2 ${sagaProgressStep >= 1 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <span>{sagaProgressStep >= 1 ? '✓' : '○'}</span>
                      <span>1. Prepared local debit hold on node-mum-dc1</span>
                    </div>
                    <div className={`flex items-center gap-2 ${sagaProgressStep >= 2 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <span>{sagaProgressStep >= 2 ? '✓' : '○'}</span>
                      <span>2. Dispatched to NPCI/RBI interbank clearing switch</span>
                    </div>
                    <div className={`flex items-center gap-2 ${sagaProgressStep >= 3 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <span>{sagaProgressStep >= 3 ? '✓' : '○'}</span>
                      <span>3. Recipient endpoint acknowledged credit</span>
                    </div>
                    <div className={`flex items-center gap-2 ${sagaProgressStep >= 4 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <span>{sagaProgressStep >= 4 ? '✓' : '○'}</span>
                      <span>4. Double-entry ledger journal committed to Raft quorum</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Success Receipt & Ledger Journal Proof with 12-Digit RRN */}
          {step === 4 && completedTxn && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-900 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Payment Successful · Posted to Core Ledger</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    12-digit Retrieval Reference Number (RRN): <strong className="font-mono">{completedTxn.rrn}</strong>
                  </p>
                </div>
              </div>

              {replayNotice && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-blue-900 text-xs">
                  {replayNotice}
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-slate-700 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Transaction ID:</span>
                  <span>{completedTxn.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">NPCI / RBI RRN:</span>
                  <span className="text-blue-700 font-bold">{completedTxn.rrn}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Distributed Trace:</span>
                  <span className="truncate max-w-[200px]">{completedTxn.distributedTraceId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount & Fee:</span>
                  <span>{formatINR(completedTxn.amount)} (Fee: {formatINR(completedTxn.fee)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="text-emerald-700 font-bold">{completedTxn.status}</span>
                </div>
              </div>

              {/* 2PC Saga Steps Trace */}
              {completedTxn.sagaSteps && (
                <div>
                  <h5 className="font-semibold text-slate-800 mb-1.5">Distributed 2PC Saga Execution Steps</h5>
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2 text-[11px]">
                    {completedTxn.sagaSteps.map((s, idx) => (
                      <div key={idx} className="flex items-start justify-between">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-medium text-slate-800">{s.step}</span>
                        </div>
                        <span className="font-mono text-slate-400">{s.nodeId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Double-Entry Journal Breakdown */}
              <div>
                <h5 className="font-semibold text-slate-800 mb-1.5">Double-Entry Journal Postings</h5>
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
                      {completedTxn.ledgerEntries.map((e) => (
                        <tr key={e.id}>
                          <td className="p-2 font-mono text-slate-700">{e.accountNumber} ({e.accountId})</td>
                          <td className="p-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                e.direction === 'DEBIT' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {e.direction}
                            </span>
                          </td>
                          <td className="p-2 text-right font-mono font-semibold">{formatINR(e.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Idempotent Replay Sandbox Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestIdempotentReplay}
                  disabled={isSubmitting}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
                  Re-send Same Request (Test Idempotency Replay)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          {step > 1 && step < 4 ? (
            <button
              onClick={() => setStep((s) => (s - 1) as any)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {step < 3 && (
              <button
                onClick={() => {
                  if (step === 1 && !selectedBeneficiaryId) {
                    setErrorMessage('Please select or add a payee');
                    return;
                  }
                  if (
                    step === 2 &&
                    (parsedAmount <= 0 ||
                      isOverAvailable ||
                      isOverPerTxnLimit ||
                      isKycRestricted ||
                      isRtgsBelowMin)
                  ) {
                    setErrorMessage('Please correct validation errors before proceeding');
                    return;
                  }
                  setErrorMessage(null);
                  setStep((s) => (s + 1) as any);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
              >
                Continue →
              </button>
            )}

            {step === 3 && (
              <button
                onClick={() => handleExecuteTransfer()}
                disabled={isSubmitting}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Authorizing 2PC Saga...
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" /> Authorize & Post Payment
                  </>
                )}
              </button>
            )}

            {step === 4 && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-xs"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
