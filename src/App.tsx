/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { OverviewView } from './components/OverviewView.tsx';
import { ActivityView } from './components/ActivityView.tsx';
import { KycView } from './components/KycView.tsx';
import { StaffConsoleView } from './components/StaffConsoleView.tsx';
import { TransferModal } from './components/TransferModal.tsx';
import { LoginView } from './components/LoginView.tsx';
import { BankAccount, ClusterStatus, TransactionRecord, User } from './types.ts';
import { api, setSessionToken } from './api.ts';
import { formatINR } from './utils/format.ts';
import { AlertCircle, CheckCircle2, Info, Loader2, ShieldAlert } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [availableUsers, setAvailableUsers] = useState<
    Array<Pick<User, 'id' | 'name' | 'email' | 'role' | 'kycStatus'>>
  >([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [clusterStatus, setClusterStatus] = useState<ClusterStatus | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // Transfer Modal state
  const [transferModalOpen, setTransferModalOpen] = useState<boolean>(false);
  const [transferSourceAccountId, setTransferSourceAccountId] = useState<string | undefined>(undefined);

  // Statement navigation helper
  const [statementTargetAccountId, setStatementTargetAccountId] = useState<string | undefined>(undefined);

  // Notification Banner
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  // Initial Data Load
  const loadData = async () => {
    try {
      const [session, clusterRes] = await Promise.all([
        api.getSession(),
        api.getCluster().catch(() => null),
      ]);
      setCurrentUser(session.user);
      setAvailableUsers(session.availableUsers);
      if (clusterRes) setClusterStatus(clusterRes);

      if (session.user) {
        const [accRes, txnRes] = await Promise.all([
          api.getAccounts(),
          api.getTransactions({ limit: 50 }),
        ]);
        setAccounts(accRes.accounts);
        setTransactions(txnRes.transactions);
      } else {
        setAccounts([]);
        setTransactions([]);
      }
    } catch (err: unknown) {
      console.error('Failed to load banking data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLoginSuccess = async (user: User, token: string) => {
    setSessionToken(token);
    setCurrentUser(user);
    setLoading(true);
    try {
      const [accRes, txnRes, clusterRes] = await Promise.all([
        api.getAccounts(),
        api.getTransactions({ limit: 50 }),
        api.getCluster().catch(() => null),
      ]);
      setAccounts(accRes.accounts);
      setTransactions(txnRes.transactions);
      if (clusterRes) setClusterStatus(clusterRes);
      showToast(`Namaste, ${user.name}! Connected to Mumbai Leader Node.`, 'success');
    } catch (err: unknown) {
      console.error(err);
      showToast('Error loading banking accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (e) {
      console.error(e);
    }
    setCurrentUser(null);
    setAccounts([]);
    setTransactions([]);
    showToast('You have been securely signed out of NovaBank India.', 'info');
  };

  const handleSwitchUser = async (userId: string) => {
    setLoading(true);
    try {
      const res = await api.switchUser(userId);
      setSessionToken(res.token);
      setCurrentUser(res.user);

      const [accRes, txnRes, clusterRes] = await Promise.all([
        api.getAccounts(),
        api.getTransactions({ limit: 50 }),
        api.getCluster().catch(() => null),
      ]);
      setAccounts(accRes.accounts);
      setTransactions(txnRes.transactions);
      if (clusterRes) setClusterStatus(clusterRes);
      showToast(`Switched persona to ${res.user.name} (${res.user.role.toLowerCase()})`, 'info');
    } catch (err: unknown) {
      console.error(err);
      showToast('Failed to switch persona', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSystem = async () => {
    if (!window.confirm('Reset all demo banking data, accounts, and ledger to pristine seed baseline?')) {
      return;
    }
    setIsResetting(true);
    try {
      await api.resetSystem();
      await loadData();
      showToast('Database, accounts, and double-entry ledger reset to baseline.', 'success');
    } catch (err: unknown) {
      console.error(err);
      showToast('Reset failed', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const handleOpenTransfer = (sourceAccountId?: string) => {
    setTransferSourceAccountId(sourceAccountId);
    setTransferModalOpen(true);
  };

  const handleViewStatements = (accountId: string) => {
    setStatementTargetAccountId(accountId);
    setActiveTab('activity');
  };

  const handleSimulateHold = async (accountId: string) => {
    try {
      const res = await api.manageHold(accountId, 'PLACE', 2500.0, 'Simulated Fuel Pre-Auth: Bharat Petroleum #4820');
      setAccounts((prev) => prev.map((a) => (a.id === accountId ? res.account : a)));
      showToast('Placed ₹2,500.00 fuel station pre-auth hold. Available liquidity reduced.', 'info');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Hold failed', 'error');
    }
  };

  const handleSimulateRetry = async () => {
    const postedWithKey = transactions.find((t) => t.idempotencyKey);
    if (!postedWithKey || !postedWithKey.idempotencyKey) {
      showToast('Please execute a transfer first to generate an idempotency key to test.', 'info');
      return;
    }

    try {
      const res = await api.simulateRetry(postedWithKey.idempotencyKey);
      showToast(
        `✓ Idempotency Replay Detected: Key ${postedWithKey.idempotencyKey} safely returned cached original (RRN ${res.transaction.rrn}) with zero duplicate deduction.`,
        'success'
      );
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Simulation failed', 'error');
    }
  };

  const handleSimulateConcurrency = async () => {
    showToast('Dispatching 4 concurrent parallel transfer attempts competing for funds...', 'info');
    try {
      const res = await api.simulateConcurrency(4, 150000);
      const succeeded = res.results.filter((r) => r.status === 'SUCCESS').length;
      const blocked = res.results.filter((r) => r.status !== 'SUCCESS').length;

      showToast(
        `Mutex Safety Confirmed: ${succeeded} transfers processed, ${blocked} safely blocked by balance limits. Ledger invariant Delta = ₹0.00.`,
        'success'
      );
      await loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Concurrency test failed', 'error');
    }
  };

  const handleSimulateSagaTimeout = async () => {
    try {
      const res = await api.simulateSagaTimeout(5000);
      showToast(
        `Saga Rollback Verified: NPCI switch timeout on RRN ${res.rrn} triggered automated compensating rollback. Zero ledger drift (Delta = ₹0.00).`,
        'success'
      );
      await loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Simulation failed', 'error');
    }
  };

  if (loading && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">Connecting to Distributed Core Banking Cluster...</p>
          <p className="text-xs text-slate-400">Synchronizing with Mumbai Leader node (node-mum-dc1)</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        {toast && (
          <div className="fixed top-14 right-6 z-50 max-w-md animate-fade-in">
            <div
              className={`p-3.5 rounded-xl border shadow-lg text-xs flex items-start gap-2.5 ${
                toast.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : toast.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-slate-900 border-slate-800 text-white'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : toast.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-semibold">{toast.message}</p>
              </div>
              <button
                onClick={() => setToast(null)}
                className="text-slate-400 hover:text-white cursor-pointer ml-1"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        <LoginView onLoginSuccess={handleLoginSuccess} availableUsers={availableUsers} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col antialiased">
      {/* Toast alert */}
      {toast && (
        <div className="fixed top-14 right-6 z-50 max-w-md animate-fade-in">
          <div
            className={`p-3.5 rounded-xl border shadow-lg text-xs flex items-start gap-2.5 ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : toast.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-slate-900 border-slate-800 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="font-semibold">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white cursor-pointer ml-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Header */}
      <Header
        currentUser={currentUser}
        availableUsers={availableUsers}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSwitchUser={handleSwitchUser}
        onResetSystem={handleResetSystem}
        isResetting={isResetting}
        onOpenTransfer={() => handleOpenTransfer()}
        onLogout={handleLogout}
        clusterStatus={clusterStatus}
      />

      {/* Main Viewport (1440px max width baseline) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {currentUser && (
          <>
            {activeTab === 'overview' && (
              <OverviewView
                currentUser={currentUser}
                accounts={accounts}
                transactions={transactions}
                onOpenTransfer={handleOpenTransfer}
                onViewStatements={handleViewStatements}
                onSimulateHold={handleSimulateHold}
                onSimulateRetry={handleSimulateRetry}
                onSimulateConcurrency={handleSimulateConcurrency}
                onSimulateSagaTimeout={handleSimulateSagaTimeout}
                onNavigateTab={setActiveTab}
              />
            )}

            {activeTab === 'activity' && (
              <ActivityView
                accounts={accounts}
                transactions={transactions}
                onRefresh={loadData}
                selectedAccountIdForStatement={statementTargetAccountId}
              />
            )}

            {activeTab === 'kyc' && (
              <KycView
                currentUser={currentUser}
                accounts={accounts}
                onUserUpdated={(u) => {
                  setCurrentUser(u);
                  showToast('PAN & Aadhaar KYC profile updated.', 'success');
                }}
                onLimitsUpdated={loadData}
              />
            )}

            {activeTab === 'staff' && (
              <StaffConsoleView
                currentUser={currentUser}
                accounts={accounts}
                transactions={transactions}
                onRefreshData={loadData}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">NovaBank India Core Ledger</span>
            <span aria-hidden="true">·</span>
            <span>Educational Distributed Banking System Architecture (INR ₹)</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-600 font-medium">Demo Only — Simulated Funds</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <span>Double-Entry Balance: Δ = ₹0.00</span>
            <span aria-hidden="true">·</span>
            <span>Raft Consensus Monotonic Log</span>
            <span aria-hidden="true">·</span>
            <span>NPCI / RBI 2PC Saga</span>
          </div>
        </div>
      </footer>

      {/* Transfer Modal */}
      {currentUser && (
        <TransferModal
          isOpen={transferModalOpen}
          onClose={() => setTransferModalOpen(false)}
          currentUser={currentUser}
          accounts={accounts}
          initialSourceAccountId={transferSourceAccountId}
          onTransferSuccess={(txn) => {
            loadData();
            showToast(`Payment ${txn.referenceNumber} (RRN ${txn.rrn}) posted to core ledger!`, 'success');
          }}
        />
      )}
    </div>
  );
}
