/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './store.ts';
import { auditService } from './audit.ts';
import { distributedCluster } from './distributed.ts';
import { KycStatus, User, UserRole } from './types.ts';

export class KycService {
  public submitKyc(params: {
    userId: string;
    legalName: string;
    dateOfBirth: string;
    panNumber?: string;
    aadhaarNumber?: string;
    ssnOrTaxId?: string; // backwards compatibility
    address: string;
    documentType: 'PAN_CARD' | 'AADHAAR' | 'PASSPORT' | 'VOTER_ID' | 'DRIVING_LICENCE' | string;
    documentNumber: string;
  }): User {
    const user = db.users.get(params.userId);
    if (!user) throw new Error('User not found');

    const rawPan = (params.panNumber || params.ssnOrTaxId || '').toUpperCase().trim();
    const rawAadhaar = (params.aadhaarNumber || '').replace(/\D/g, '');

    // Format masked Indian PAN (e.g. ABCDE••••F)
    const maskedPan = rawPan.length >= 5
      ? `${rawPan.slice(0, 5)}••••${rawPan.slice(-1)}`
      : 'ABCDE••••F';

    // Format masked 12-digit Aadhaar (e.g. •••• •••• 4921)
    const maskedAadhaar = rawAadhaar.length >= 4
      ? `•••• •••• ${rawAadhaar.slice(-4)}`
      : '•••• •••• 4921';

    const maskedDoc = `${params.documentType.slice(0, 3).toUpperCase()}••••${params.documentNumber.slice(-4) || '1048'}`;

    user.kycStatus = 'PENDING_REVIEW';
    user.kycDetails = {
      legalName: params.legalName,
      dateOfBirth: params.dateOfBirth,
      maskedPan,
      maskedAadhaar,
      address: params.address,
      documentType: params.documentType as any,
      documentNumberMasked: maskedDoc,
      submittedAt: new Date().toISOString(),
    };

    const leader = distributedCluster.getLeaderNode();
    auditService.record({
      actorUserId: user.id,
      actorRole: user.role,
      actorName: user.name,
      action: 'KYC_DOCUMENTS_SUBMITTED',
      targetType: 'KYC',
      targetId: user.id,
      nodeId: leader.id,
      details: {
        documentType: params.documentType,
        maskedPan,
        maskedAadhaar,
        legalName: params.legalName,
      },
    });

    return user;
  }

  public reviewKyc(params: {
    targetUserId: string;
    reviewerUserId: string;
    reviewerRole: UserRole;
    reviewerName: string;
    status: KycStatus;
    rejectionReason?: string;
  }): User {
    if (params.reviewerRole !== 'STAFF' && params.reviewerRole !== 'ADMIN') {
      throw new Error('Only compliance staff or administrators can review KYC submissions');
    }

    const user = db.users.get(params.targetUserId);
    if (!user) throw new Error('Target user not found');

    const previousStatus = user.kycStatus;
    user.kycStatus = params.status;

    if (user.kycDetails) {
      user.kycDetails.reviewedAt = new Date().toISOString();
      user.kycDetails.reviewedBy = params.reviewerName;
      if (params.rejectionReason) {
        user.kycDetails.rejectionReason = params.rejectionReason;
      }
    }

    // If verified, upgrade accounts limits to standard ₹10 Lakhs daily / ₹5 Lakhs per txn
    if (params.status === 'VERIFIED') {
      for (const account of db.accounts.values()) {
        if (account.userId === user.id) {
          if (account.type === 'CHECKING' && account.dailyTransferLimit < 1000000) {
            account.dailyTransferLimit = 1000000; // ₹10,00,000 (10 Lakhs)
            account.perTransactionLimit = 500000; // ₹5,00,000 (5 Lakhs)
          }
        }
      }
    }

    const leader = distributedCluster.getLeaderNode();
    auditService.record({
      actorUserId: params.reviewerUserId,
      actorRole: params.reviewerRole,
      actorName: params.reviewerName,
      action: `KYC_${params.status}`,
      targetType: 'KYC',
      targetId: user.id,
      nodeId: leader.id,
      details: {
        previousStatus,
        newStatus: params.status,
        rejectionReason: params.rejectionReason || null,
      },
    });

    return user;
  }

  public updateAccountLimits(params: {
    accountId: string;
    dailyLimit: number;
    perTransactionLimit: number;
    actorUserId: string;
    actorRole: UserRole;
    actorName: string;
  }) {
    const account = db.accounts.get(params.accountId);
    if (!account) throw new Error('Account not found');

    const prevDaily = account.dailyTransferLimit;
    const prevPerTxn = account.perTransactionLimit;

    account.dailyTransferLimit = Math.max(1000, params.dailyLimit);
    account.perTransactionLimit = Math.max(500, Math.min(params.perTransactionLimit, account.dailyTransferLimit));

    const leader = distributedCluster.getLeaderNode();
    auditService.record({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      actorName: params.actorName,
      action: 'ACCOUNT_LIMITS_UPDATED',
      targetType: 'ACCOUNT',
      targetId: account.id,
      nodeId: leader.id,
      details: {
        previousDailyLimit: prevDaily,
        newDailyLimit: account.dailyTransferLimit,
        previousPerTxnLimit: prevPerTxn,
        newPerTxnLimit: account.perTransactionLimit,
      },
    });

    return account;
  }

  public toggleAccountFreeze(params: {
    accountId: string;
    freeze: boolean;
    reason: string;
    actorUserId: string;
    actorRole: UserRole;
    actorName: string;
  }) {
    if (params.actorRole !== 'STAFF' && params.actorRole !== 'ADMIN') {
      throw new Error('Unauthorized to freeze or unfreeze accounts');
    }

    const account = db.accounts.get(params.accountId);
    if (!account) throw new Error('Account not found');

    account.status = params.freeze ? 'FROZEN' : 'ACTIVE';

    const leader = distributedCluster.getLeaderNode();
    auditService.record({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      actorName: params.actorName,
      action: params.freeze ? 'ACCOUNT_FROZEN' : 'ACCOUNT_UNFROZEN',
      targetType: 'ACCOUNT',
      targetId: account.id,
      nodeId: leader.id,
      details: {
        status: account.status,
        reason: params.reason,
      },
    });

    return account;
  }
}

export const kycService = new KycService();
