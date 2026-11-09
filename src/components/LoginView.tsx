/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Phone,
  QrCode,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { User } from '../types.ts';
import { api } from '../api.ts';

interface LoginViewProps {
  onLoginSuccess: (user: User, token: string) => void;
  availableUsers: Array<Pick<User, 'id' | 'name' | 'email' | 'role' | 'kycStatus'>>;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, availableUsers }) => {
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('elena@novabank.demo');
  const [loginPassword, setLoginPassword] = useState('demo1234');
  const [showPassword, setShowPassword] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('+91 98');
  const [regPassword, setRegPassword] = useState('demo1234');

  // Loading & error
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const demoPersonas = [
    {
      name: 'Elena Vance (Sharma)',
      email: 'elena@novabank.demo',
      role: 'CUSTOMER',
      badge: 'Verified Customer',
      badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      description: 'Checking & Savings (₹23,27,020.00) · Full UPI, IMPS & RTGS access',
    },
    {
      name: 'Marcus Brody (Patel)',
      email: 'marcus@novabank.demo',
      role: 'CUSTOMER',
      badge: 'Pending KYC',
      badgeColor: 'text-amber-700 bg-amber-50 border-amber-200',
      description: 'Digital Account (₹50,000.00) · ₹50,000 transfer ceiling limit',
    },
    {
      name: 'Sarah Jenkins (Iyer)',
      email: 'sarah.compliance@novabank.demo',
      role: 'STAFF',
      badge: 'Compliance Officer',
      badgeColor: 'text-blue-700 bg-blue-50 border-blue-200',
      description: 'Aadhaar/PAN KYC desk · Transaction reversals · Limit upgrades',
    },
    {
      name: 'Alex Rivera (Deshmukh)',
      email: 'alex.admin@novabank.demo',
      role: 'ADMIN',
      badge: 'Cluster Architect',
      badgeColor: 'text-purple-700 bg-purple-50 border-purple-200',
      description: 'Raft consensus nodes · Double-entry audits · Chaos lab',
    },
  ];

  const handleLogin = async (e?: React.FormEvent, directEmail?: string, directPassword?: string) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    const emailToUse = directEmail || loginEmail;
    const passwordToUse = directPassword || loginPassword;

    try {
      const res = await api.login({ email: emailToUse, password: passwordToUse });
      onLoginSuccess(res.user, res.token);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    if (!regName.trim() || !regEmail.trim()) {
      setErrorMessage('Please provide legal name and email address');
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.register({
        name: regName.trim(),
        email: regEmail.trim(),
        phone: regPhone.trim(),
        password: regPassword || 'demo1234',
      });
      onLoginSuccess(res.user, res.token);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const selectPersona = (email: string) => {
    setLoginEmail(email);
    setLoginPassword('demo1234');
    handleLogin(undefined, email, 'demo1234');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between antialiased">
      {/* Top Disclaimer Strip */}
      <div className="bg-slate-900 text-slate-300 text-xs px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white tracking-wide">SIMULATED CORE BANKING (INR ₹)</span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span>NPCI UPI / IMPS & RBI RTGS Rails</span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span className="text-amber-400">Educational Distributed Banking System Architecture</span>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
          <span>Double-Entry Balance: Δ = ₹0.00</span>
          <span aria-hidden="true">·</span>
          <span>Multi-Node Raft Consensus</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: Brand & Security Overview */}
          <div className="lg:col-span-5 flex flex-col justify-between bg-slate-900 text-white rounded-2xl p-8 shadow-xl">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight">NovaBank India</h1>
                  <p className="text-xs text-slate-400 font-mono">Distributed Core Banking Ledger</p>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <h2 className="text-xl font-bold tracking-tight text-white leading-snug">
                  Enterprise Indian distributed core banking, right in your browser.
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Sign in to test Indian payment rails (UPI instant VPA, IMPS, RTGS, NEFT), 12-digit RRNs, PAN/Aadhaar KYC tiers, and multi-node Raft consensus replication.
                </p>
              </div>

              <div className="mt-8 space-y-3 pt-6 border-t border-slate-800 text-xs">
                <div className="flex items-start gap-2.5 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Indian Payment Rails:</strong> Full UPI VPA routing, IMPS 24x7, NEFT batch clearing, and high-value RTGS.
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Strict Double-Entry Ledger:</strong> Invariant maintained across all transactions ($\sum Dr \equiv \sum Cr$).
                  </span>
                </div>
                <div className="flex items-start gap-2.5 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Distributed Raft Consensus:</strong> Real-time replication across Mumbai Leader, Bengaluru Follower, and Delhi DR.
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
              <span>Default password: <code className="text-slate-300 font-mono">demo1234</code></span>
              <span className="font-mono text-slate-400">IFSC: NOVA0001001</span>
            </div>
          </div>

          {/* Right Column: Authentication Card */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xl p-8 flex flex-col justify-between">
            <div>
              {/* Tab Selector */}
              <div className="flex items-center p-1 bg-slate-100 rounded-xl mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('LOGIN');
                    setErrorMessage(null);
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'LOGIN'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Sign In to Account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('REGISTER');
                    setErrorMessage(null);
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    activeTab === 'REGISTER'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Open New Account
                </button>
              </div>

              {errorMessage && (
                <div className="mb-5 bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-800 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* TAB 1: SIGN IN */}
              {activeTab === 'LOGIN' && (
                <form onSubmit={(e) => handleLogin(e)} className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="you@novabank.demo"
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-blue-600 focus:bg-white text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block font-semibold text-slate-700">Password</label>
                      <span className="text-[11px] text-slate-400">All demo accounts: demo1234</span>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-blue-600 focus:bg-white text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-99 text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isLoading ? 'Verifying Credentials...' : 'Sign In'}
                  </button>
                </form>
              )}

              {/* TAB 2: REGISTER */}
              {activeTab === 'REGISTER' && (
                <form onSubmit={handleRegister} className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Full Legal Name</label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="e.g. Liam Sterling / Vikram Malhotra"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-blue-600 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="vikram@example.in"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-blue-600 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Indian Mobile Number</label>
                      <input
                        type="text"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        placeholder="+91 98200 00000"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-blue-600 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Password</label>
                      <input
                        type="password"
                        required
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="demo1234"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-blue-600 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50/60 border border-blue-200/60 rounded-xl text-[11px] text-blue-800">
                    A simulated everyday UPI savings account with IFSC <strong className="font-mono">NOVA0001001</strong> and ₹50,000 initial transfer ceiling will be provisioned.
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-99 text-white rounded-xl text-xs font-semibold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {isLoading ? 'Opening Account...' : 'Open Account & Sign In'}
                  </button>
                </form>
              )}
            </div>

            {/* Quick Demo Persona Auto-Fill Strip */}
            <div className="mt-8 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Quick 1-Click Demo Personas
                </span>
                <span className="text-[11px] text-slate-400">Click to authenticate immediately</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {demoPersonas.map((p) => (
                  <button
                    key={p.email}
                    type="button"
                    onClick={() => selectPersona(p.email)}
                    className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-left transition-colors cursor-pointer group flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 text-xs group-hover:text-blue-600 transition-colors">
                        {p.name}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${p.badgeColor}`}>
                        {p.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">{p.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-400">
        NovaBank India Core Ledger Demo · Educational & Learning Only · No Real Financial Transactions
      </footer>
    </div>
  );
};
