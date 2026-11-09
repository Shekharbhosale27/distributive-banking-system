/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { AuditLogEntry, UserRole } from './types.ts';

class AuditService {
  private logs: AuditLogEntry[] = [];
  private latestHash = '0000000000000000000000000000000000000000000000000000000000000000';

  /**
   * Sanitizes details to ensure no sensitive credentials or card data can ever be logged.
   */
  private sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const lower = key.toLowerCase();
      if (lower.includes('password') || lower.includes('secret') || lower.includes('pin') || lower.includes('cvv')) {
        sanitized[key] = '[REDACTED]';
      } else if (lower.includes('ssn') || lower.includes('taxid')) {
        sanitized[key] = typeof value === 'string' ? value.replace(/\d(?=\d{4})/g, '•') : '[MASKED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitize(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  public record(params: {
    actorUserId: string;
    actorRole: UserRole;
    actorName: string;
    action: string;
    targetType: AuditLogEntry['targetType'];
    targetId: string;
    details: Record<string, unknown>;
    nodeId?: string;
    ipAddress?: string;
  }): AuditLogEntry {
    const id = `AUD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();
    const sanitizedDetails = this.sanitize(params.details);
    const ipAddress = params.ipAddress || '127.0.0.1';
    const nodeId = params.nodeId || 'node-mum-dc1';

    const rawBlock = `${this.latestHash}|${timestamp}|${params.actorUserId}|${params.action}|${params.targetType}|${params.targetId}|${JSON.stringify(sanitizedDetails)}`;
    const hash = crypto.createHash('sha256').update(rawBlock).digest('hex');

    const entry: AuditLogEntry = {
      id,
      timestamp,
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      actorName: params.actorName,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      details: sanitizedDetails,
      nodeId,
      ipAddress,
      previousHash: this.latestHash,
      hash,
    };

    this.latestHash = hash;
    this.logs.unshift(entry); // newest first

    // Structured stdout log for observability
    console.log(`[AUDIT] [${timestamp}] [${nodeId}] [${entry.action}] [Actor: ${entry.actorName} (${entry.actorRole})] Target: ${entry.targetType}/${entry.targetId}`);

    return entry;
  }

  public getLogs(limit = 100, filterType?: string): AuditLogEntry[] {
    if (filterType && filterType !== 'ALL') {
      return this.logs.filter((l) => l.targetType === filterType).slice(0, limit);
    }
    return this.logs.slice(0, limit);
  }

  public verifyIntegrity(): { isValid: boolean; checkedCount: number; brokenAt?: string } {
    if (this.logs.length === 0) return { isValid: true, checkedCount: 0 };

    // Logs are newest first, so iterate from oldest to newest
    const chronological = [...this.logs].reverse();
    let prev = '0000000000000000000000000000000000000000000000000000000000000000';

    for (const entry of chronological) {
      if (entry.previousHash !== prev) {
        return { isValid: false, checkedCount: chronological.length, brokenAt: entry.id };
      }
      const rawBlock = `${entry.previousHash}|${entry.timestamp}|${entry.actorUserId}|${entry.action}|${entry.targetType}|${entry.targetId}|${JSON.stringify(entry.details)}`;
      const expectedHash = crypto.createHash('sha256').update(rawBlock).digest('hex');
      if (expectedHash !== entry.hash) {
        return { isValid: false, checkedCount: chronological.length, brokenAt: entry.id };
      }
      prev = entry.hash;
    }

    return { isValid: true, checkedCount: chronological.length };
  }

  public reset(): void {
    this.logs = [];
    this.latestHash = '0000000000000000000000000000000000000000000000000000000000000000';
  }
}

export const auditService = new AuditService();
