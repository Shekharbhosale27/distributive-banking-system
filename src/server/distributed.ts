/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { ClusterNode, SagaTraceStep } from './types.ts';
import { auditService } from './audit.ts';

class DistributedClusterService {
  public nodes: ClusterNode[] = [
    {
      id: 'node-mum-dc1',
      name: 'Mumbai Primary Core Datacenter',
      region: 'ap-south-1 (Mumbai West)',
      role: 'LEADER',
      status: 'HEALTHY',
      raftTerm: 4,
      appliedLogIndex: 2840,
      commitIndex: 2840,
      heartbeatLatencyMs: 1.2,
    },
    {
      id: 'node-blr-dc2',
      name: 'Bengaluru Distributed Replica',
      region: 'ap-south-2 (Bengaluru South)',
      role: 'FOLLOWER',
      status: 'HEALTHY',
      raftTerm: 4,
      appliedLogIndex: 2840,
      commitIndex: 2840,
      heartbeatLatencyMs: 8.4,
    },
    {
      id: 'node-del-dr3',
      name: 'Delhi Disaster Recovery Node',
      region: 'in-north-1 (Delhi NCR)',
      role: 'READ_REPLICA',
      status: 'HEALTHY',
      raftTerm: 4,
      appliedLogIndex: 2839,
      commitIndex: 2839,
      heartbeatLatencyMs: 14.1,
    },
  ];

  public eventStreamTopics = [
    { name: 'novabank.in.ledger.postings', partitionCount: 6, retentionDays: 30 },
    { name: 'novabank.in.upi.clearing', partitionCount: 12, retentionDays: 7 },
    { name: 'novabank.in.imps.settlement', partitionCount: 4, retentionDays: 14 },
    { name: 'novabank.in.rtgs.gross', partitionCount: 2, retentionDays: 90 },
    { name: 'novabank.in.audit.events', partitionCount: 3, retentionDays: 365 },
  ];

  public getLeaderNode(): ClusterNode {
    const leader = this.nodes.find((n) => n.role === 'LEADER' && n.status === 'HEALTHY');
    return leader || this.nodes[0];
  }

  public incrementLogIndex() {
    for (const node of this.nodes) {
      if (node.status === 'HEALTHY') {
        node.appliedLogIndex += 1;
        node.commitIndex = node.appliedLogIndex;
      }
    }
  }

  public createTraceId(rail: string): string {
    const hex = crypto.randomBytes(4).toString('hex');
    return `trace-in-${rail.toLowerCase()}-${Date.now().toString().slice(-6)}-${hex}`;
  }

  public generateRrn(): string {
    // 12-digit Retrieval Reference Number standard across Indian payment rails (NPCI/RBI)
    const year = new Date().getFullYear().toString().slice(-2);
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24
    )
      .toString()
      .padStart(3, '0');
    const randomDigits = Math.floor(1000000 + Math.random() * 9000000).toString();
    return `${year}${dayOfYear}${randomDigits.slice(0, 7)}`;
  }

  /**
   * Chaos injection: Toggle node partition to demonstrate distributed consensus resilience
   */
  public toggleNodePartition(nodeId: string): ClusterNode {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error('Node not found');

    node.status = node.status === 'HEALTHY' ? 'PARTITIONED' : 'HEALTHY';

    auditService.record({
      actorUserId: 'SYSTEM',
      actorRole: 'ADMIN',
      actorName: 'Distributed Chaos Engine',
      action: node.status === 'PARTITIONED' ? 'NODE_NETWORK_PARTITION_INJECTED' : 'NODE_NETWORK_HEALED',
      targetType: 'DISTRIBUTED',
      targetId: node.id,
      nodeId: this.getLeaderNode().id,
      details: {
        nodeId: node.id,
        status: node.status,
        region: node.region,
      },
    });

    return node;
  }
}

export const distributedCluster = new DistributedClusterService();
