/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Building2,
  ChevronDown,
  Cpu,
  Globe2,
  LogOut,
  RotateCcw,
  Server,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { ClusterStatus, User } from '../types.ts';

interface HeaderProps {
  currentUser: User | null;
  availableUsers: Array<Pick<User, 'id' | 'name' | 'email' | 'role' | 'kycStatus'>>;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSwitchUser: (userId: string) => void;
  onResetSystem: () => void;
  isResetting: boolean;
  onOpenTransfer: () => void;
  onLogout: () => void;
  clusterStatus?: ClusterStatus | null;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  availableUsers,
  activeTab,
  onTabChange,
  onSwitchUser,
  onResetSystem,
  isResetting,
  onOpenTransfer,
  onLogout,
  clusterStatus,
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isStaffOrAdmin = currentUser?.role === 'STAFF' || currentUser?.role === 'ADMIN';
  const leaderNode = clusterStatus?.leader || {
    id: 'node-mum-dc1',
    name: 'Mumbai Core DC1',
    region: 'ap-south-1 (Mumbai)',
    role: 'LEADER',
    status: 'HEALTHY',
    raftTerm: 4,
    appliedLogIndex: 2842,
    heartbeatLatencyMs: 1.2,
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      {/* Top Banner indicating simulated Indian banking environment & distributed consensus status */}
      <div className="bg-slate-900 text-slate-300 text-xs px-6 py-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white tracking-wide flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            SIMULATED CORE BANKING (INR ₹)
          </span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span>NPCI UPI / IMPS & RBI RTGS Rails</span>
          <span aria-hidden="true" className="text-slate-500">·</span>
          <span className="text-amber-400 font-medium">Demo Only — No Real Funds or Aadhaar/PAN</span>
        </div>

        {/* Live Distributed Node Status Pill */}
        <div className="flex items-center gap-3">
          <div
            onClick={() => onTabChange('staff')}
            className="flex items-center gap-1.5 text-[11px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded cursor-pointer hover:bg-slate-700 transition-colors"
            title="Active Distributed Node & Raft Consensus State"
          >
            <Server className="w-3 h-3 text-blue-400" />
            <span>Leader: {leaderNode.id} ({leaderNode.region.split(' ')[0]})</span>
            <span className="text-slate-500">·</span>
            <span className="text-emerald-400">Term {leaderNode.raftTerm} (#{leaderNode.appliedLogIndex})</span>
          </div>

          <button
            onClick={onResetSystem}
            disabled={isResetting}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Reset in-memory balances and ledger to original seed baseline"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
            <span>Reset Demo</span>
          </button>
        </div>
      </div>

      {/* Top Bar Contract (3 Zones separated by gap-8) */}
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Building2 className="w-4 h-4" />
          </div>
          <button
            onClick={() => onTabChange('overview')}
            className="text-lg font-bold tracking-tight text-slate-900 hover:text-blue-600 transition-colors whitespace-nowrap text-left"
          >
            NovaBank India
          </button>
        </div>

        {/* Zone 2: 4 single-line clean nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => onTabChange('overview')}
            className={`whitespace-nowrap transition-colors cursor-pointer py-1 border-b-2 ${
              activeTab === 'overview'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Accounts & UPI
          </button>

          <button
            onClick={() => onTabChange('activity')}
            className={`whitespace-nowrap transition-colors cursor-pointer py-1 border-b-2 ${
              activeTab === 'activity'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Passbook & Statements
          </button>

          <button
            onClick={() => onTabChange('kyc')}
            className={`whitespace-nowrap transition-colors cursor-pointer py-1 border-b-2 ${
              activeTab === 'kyc'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            PAN & Aadhaar KYC
          </button>

          <button
            onClick={() => onTabChange('staff')}
            className={`whitespace-nowrap transition-colors cursor-pointer py-1 border-b-2 flex items-center gap-1.5 ${
              activeTab === 'staff'
                ? 'text-blue-600 border-blue-600 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <span>Distributed Cluster & Ops</span>
            {isStaffOrAdmin && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                Staff
              </span>
            )}
          </button>
        </nav>

        {/* Zone 3: 1 primary action & persona switcher */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onOpenTransfer}
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:scale-98 transition-all shadow-xs whitespace-nowrap cursor-pointer"
          >
            Pay / Transfer (UPI/IMPS)
          </button>

          {/* Persona Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              aria-expanded={userMenuOpen}
              aria-label="Switch User Persona"
            >
              <div className="w-5 h-5 rounded-full bg-slate-300 text-slate-800 font-bold flex items-center justify-center text-[10px]">
                {currentUser?.name?.slice(0, 1) || 'U'}
              </div>
              <span className="hidden sm:inline font-semibold">{currentUser?.name}</span>
              <span className="text-slate-400">({currentUser?.role?.toLowerCase()})</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
                  <div className="px-3.5 py-2 border-b border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Switch Simulated Persona
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Test permissions, limits, and customer vs staff workflows.
                    </p>
                  </div>
                  <div className="py-1">
                    {availableUsers.map((u) => {
                      const isCurrent = u.id === currentUser?.id;
                      return (
                        <button
                          key={u.id}
                          onClick={() => {
                            onSwitchUser(u.id);
                            setUserMenuOpen(false);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer ${
                            isCurrent ? 'bg-blue-50/70 font-semibold' : ''
                          }`}
                        >
                          <div>
                            <p className="text-slate-900 flex items-center gap-1.5">
                              {u.name}
                              {u.role === 'STAFF' && (
                                <span className="text-[10px] px-1 py-0.2 bg-amber-100 text-amber-800 rounded font-medium">
                                  Staff
                                </span>
                              )}
                              {u.role === 'ADMIN' && (
                                <span className="text-[10px] px-1 py-0.2 bg-purple-100 text-purple-800 rounded font-medium">
                                  Admin
                                </span>
                              )}
                            </p>
                            <p className="text-slate-500 text-[11px]">{u.email}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {u.kycStatus === 'VERIFIED' ? (
                              <span className="text-emerald-600 flex items-center gap-1 text-[11px]">
                                <ShieldCheck className="w-3.5 h-3.5" /> Verified
                              </span>
                            ) : u.kycStatus === 'PENDING_REVIEW' ? (
                              <span className="text-amber-600 flex items-center gap-1 text-[11px]">
                                <UserCheck className="w-3.5 h-3.5" /> Pending KYC
                              </span>
                            ) : (
                              <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                                <UserX className="w-3.5 h-3.5" /> Unverified
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="pt-1 mt-1 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out of NovaBank</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Explicit Header Log Out Button */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors cursor-pointer"
            title="Sign out of current account"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Log Out</span>
          </button>
        </div>
      </div>
    </header>
  );
};
