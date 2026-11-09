/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck,
  Fingerprint,
  Lock,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserCheck,
} from 'lucide-react';
import { BankAccount, User } from '../types.ts';
import { api } from '../api.ts';
import { formatINR } from '../utils/format.ts';

interface KycViewProps {
  currentUser: User;
  accounts: BankAccount[];
  onUserUpdated: (user: User) => void;
  onLimitsUpdated: () => void;
}

export const KycView: React.FC<KycViewProps> = ({
  currentUser,
  accounts,
  onUserUpdated,
  onLimitsUpdated,
}) => {
  // Indian KYC Form state
  const [legalName, setLegalName] = useState(currentUser.kycDetails?.legalName || currentUser.name);
  const [dateOfBirth, setDateOfBirth] = useState(currentUser.kycDetails?.dateOfBirth || '1991-04-14');
  const [panNumber, setPanNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [address, setAddress] = useState(
    currentUser.kycDetails?.address || 'Flat 1402, Sea Green Towers, Worli Sea Face, Mumbai, MH 400018'
  );
  const [documentType, setDocumentType] = useState(currentUser.kycDetails?.documentType || 'PAN_CARD');
  const [documentNumber, setDocumentNumber] = useState('');

  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [kycSuccessMsg, setKycSuccessMsg] = useState<string | null>(null);
  const [kycError, setKycError] = useState<string | null>(null);

  // Limits state (INR Lakhs)
  const primaryAccount = accounts[0];
  const [dailyLimit, setDailyLimit] = useState(primaryAccount?.dailyTransferLimit || 1000000);
  const [perTxnLimit, setPerTxnLimit] = useState(primaryAccount?.perTransactionLimit || 500000);
  const [savingLimits, setSavingLimits] = useState(false);
  const [limitsSuccessMsg, setLimitsSuccessMsg] = useState<string | null>(null);

  const handleSubmitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingKyc(true);
    setKycSuccessMsg(null);
    setKycError(null);

    try {
      const res = await api.submitKyc({
        legalName,
        dateOfBirth,
        panNumber: panNumber || 'ABCDE1234F',
        aadhaarNumber: aadhaarNumber || '999948214921',
        address,
        documentType,
        documentNumber: documentNumber || panNumber || 'ABCDE1234F',
      });
      onUserUpdated(res.user);
      setKycSuccessMsg('Simulated Indian KYC credentials (PAN & Aadhaar) submitted! Status updated to PENDING_REVIEW.');
    } catch (err: unknown) {
      setKycError(err instanceof Error ? err.message : 'KYC submission failed');
    } finally {
      setSubmittingKyc(false);
    }
  };

  const handleUpdateLimits = async () => {
    if (!primaryAccount) return;
    setSavingLimits(true);
    setLimitsSuccessMsg(null);

    try {
      await api.updateLimits(primaryAccount.id, dailyLimit, perTxnLimit);
      onLimitsUpdated();
      setLimitsSuccessMsg('Security transaction limits updated and recorded in immutable audit log.');
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setSavingLimits(false);
    }
  };

  const isVerified = currentUser.kycStatus === 'VERIFIED';
  const isPending = currentUser.kycStatus === 'PENDING_REVIEW';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header & Status Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              RBI Compliance & Customer Due Diligence
            </span>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">Know Your Customer (KYC) Verification</h2>
            <p className="text-xs text-slate-500 mt-1">
              Simulated PAN (Permanent Account Number) & Aadhaar verification determining UPI, IMPS, and RTGS volume limits.
            </p>
          </div>

          <div className="shrink-0">
            {isVerified ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Tier 1 Verified Customer (Full Access)</span>
              </div>
            ) : isPending ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Pending Compliance Review</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span>Unverified Profile</span>
              </div>
            )}
          </div>
        </div>

        {/* Status explanation */}
        <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="font-semibold text-slate-700">Daily Transfer Limit</p>
            <p className="text-lg font-bold font-mono text-slate-900 mt-0.5">
              {isVerified ? formatINR(1000000) : isPending ? formatINR(50000) : formatINR(25000)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Regulated ceiling per 24 hours</p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="font-semibold text-slate-700">Payment Rails Access</p>
            <p className="text-lg font-bold text-slate-900 mt-0.5">
              {isVerified ? 'UPI · IMPS · RTGS · NEFT' : 'Internal & UPI (Capped)'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Interbank settlement unlocked</p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="font-semibold text-slate-700">PII Privacy Protection</p>
            <p className="text-lg font-bold text-emerald-700 mt-0.5 flex items-center gap-1">
              <Lock className="w-4 h-4" /> Masked & Salted
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Never logs raw Aadhaar or PAN</p>
          </div>
        </div>
      </div>

      {/* KYC Document Submission Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-5">
        <div>
          <h3 className="text-base font-bold text-slate-900">Simulated Indian Identity Submission</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Test UIDAI Aadhaar and NSDL PAN verification workflows. Real credentials are never stored.
          </p>
        </div>

        {kycSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{kycSuccessMsg}</span>
          </div>
        )}

        {kycError && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{kycError}</span>
          </div>
        )}

        {currentUser.kycDetails && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2">
            <p className="font-semibold text-slate-800">Current KYC Record On File:</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] text-slate-600">
              <div>
                <span className="text-slate-400 block">Legal Name:</span>
                <span className="text-slate-900 font-semibold">{currentUser.kycDetails.legalName}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Masked PAN:</span>
                <span className="text-slate-900 font-semibold">{currentUser.kycDetails.maskedPan}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Masked Aadhaar:</span>
                <span className="text-slate-900 font-semibold">{currentUser.kycDetails.maskedAadhaar}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Document:</span>
                <span className="text-slate-900 font-semibold">
                  {currentUser.kycDetails.documentType} ({currentUser.kycDetails.documentNumberMasked})
                </span>
              </div>
            </div>
            {currentUser.kycDetails.reviewedBy && (
              <p className="text-[11px] text-blue-700 font-medium pt-1">
                Verified by compliance officer: {currentUser.kycDetails.reviewedBy} on{' '}
                {new Date(currentUser.kycDetails.reviewedAt || '').toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmitKyc} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Full Legal Name (as per PAN)</label>
              <input
                type="text"
                required
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. Elena Vance Sharma"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-blue-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                required
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-blue-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Permanent Account Number (PAN Card)
              </label>
              <input
                type="text"
                placeholder="ABCDE1234F"
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-900 focus:outline-blue-600 uppercase"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                10-character alphanumeric PAN. Automatically masked to ABCDE••••F.
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                12-Digit UIDAI Aadhaar Number
              </label>
              <input
                type="text"
                placeholder="•••• •••• 4921"
                value={aadhaarNumber}
                onChange={(e) => setAadhaarNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-900 focus:outline-blue-600"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Simulated UIDAI token. Masked to •••• •••• XXXX.
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Primary KYC Document Type</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-blue-600 cursor-pointer"
              >
                <option value="PAN_CARD">PAN Card (Income Tax Dept)</option>
                <option value="AADHAAR">UIDAI Aadhaar Card</option>
                <option value="PASSPORT">Indian Passport</option>
                <option value="VOTER_ID">Election Commission Voter ID</option>
                <option value="DRIVING_LICENCE">Driving Licence</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Document Serial Number</label>
              <input
                type="text"
                placeholder="e.g. PAN-984210"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-900 focus:outline-blue-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Residential Address (with PIN Code)</label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Flat / Building, Street, City, State, PIN Code"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-blue-600"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Demo sandbox: Staff can review and verify in the Staff Console.
            </span>
            <button
              type="submit"
              disabled={submittingKyc}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              {submittingKyc ? 'Submitting to NSDL/UIDAI...' : 'Submit Simulated KYC'}
            </button>
          </div>
        </form>
      </div>

      {/* Security & Transaction Limits Configuration (INR Lakhs) */}
      {primaryAccount && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">Configurable Transaction Limits (INR)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Set customer risk thresholds for outbound UPI, IMPS, and RTGS transfers on account {primaryAccount.nickname} (•••• {primaryAccount.accountNumber.slice(-4)})
            </p>
          </div>

          {limitsSuccessMsg && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{limitsSuccessMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="font-semibold text-slate-700">Daily Cumulative Limit</label>
                <span className="font-mono font-bold text-slate-900">{formatINR(dailyLimit)}</span>
              </div>
              <input
                type="range"
                min="50000"
                max="5000000"
                step="50000"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(parseFloat(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400">Max cumulative volume allowed every 24 hours</span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="font-semibold text-slate-700">Per-Transaction Ceiling</label>
                <span className="font-mono font-bold text-slate-900">{formatINR(perTxnLimit)}</span>
              </div>
              <input
                type="range"
                min="10000"
                max={dailyLimit}
                step="25000"
                value={perTxnLimit}
                onChange={(e) => setPerTxnLimit(parseFloat(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <span className="text-[11px] text-slate-400">Single transfer ceiling</span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleUpdateLimits}
              disabled={savingLimits}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              {savingLimits ? 'Saving...' : 'Save Limit Preferences'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
