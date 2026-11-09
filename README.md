# NovaBank Core Ledger — Distributed Indian Banking System Demo

> **DISCLAIMER:** This application is built strictly for **demonstration and educational learning purposes**. It uses simulated customers, accounts, Indian payment rails, and KYC identity verification. It **does not connect to real banks**, **does not move real money**, and **does not process real PAN/Aadhaar data or customer PII**. It is not claimed to be production-ready or legally compliant.

---

## 1. Overview & Indian Banking Infrastructure

NovaBank is an interactive demonstration of a modern distributed core banking ledger engine adapted specifically to **Indian Banking Standards & National Payment Corporation of India (NPCI) / Reserve Bank of India (RBI) specifications**:

- **Indian Rupee (INR `₹`) & Indian Numbering System:** Strict `en-IN` numbering format (Lakhs & Crores scale: e.g. `₹4,85,020.00`, `₹18,42,000.00`, `₹50,00,00,000.00`).
- **Indian Account Routing:** 11-character RBI IFSC codes (`NOVA0001001` for Mumbai Nariman Point, `NOVA0001002` for Bengaluru Indiranagar), 9-digit MICR code (`400240001`), and UPI Virtual Payment Addresses (VPA, e.g. `elena@novaupi`, `marcus@novaupi`).
- **Standard Indian Payment Rails:**
  - **UPI (Unified Payments Interface):** Instant retail transfer via VPA with zero switch fee.
  - **IMPS (Immediate Payment Service):** 24x7 interbank instant settlement via Account + IFSC (₹5 switch fee).
  - **NEFT (National Electronic Funds Transfer):** Deferred net batch settlement (₹2.50 fee).
  - **RTGS (Real-Time Gross Settlement):** High-value gross settlement with strict RBI-mandated minimum of **₹2,00,000** (₹25 switch fee).
- **12-Digit RRN (Retrieval Reference Numbers):** NPCI/RBI standard 12-digit transaction identifiers (e.g. `406983019241`) generated for every interbank payment.
- **Indian KYC Verification:** PAN (Permanent Account Number masked e.g. `ABCDE••••F`), 12-digit UIDAI Aadhaar (`•••• •••• 4921`), Indian Passport, Voter ID, and Driving Licence with dynamic limit upgrades upon compliance review.
- **Double-Entry Ledger Engine:** Every posted transaction creates balanced debit and credit journal entries ($\sum \text{Dr} = \sum \text{Cr}$). Account balances are derived directly from immutable ledger records.
- **Transaction Lifecycle & Reversals:** Transactions move through `PENDING` $\to$ `POSTED` or `FAILED`. Financial records are **never mutated or deleted**; cancellations and refunds execute strictly via auditable **reversing journal entries**.

---

## 2. Distributed System Architecture & Consensus

The system models a multi-node distributed core ledger cluster operating under **Raft-style leader-follower replication** and **Two-Phase Commit (2PC) / Saga distributed transaction orchestration**:

```
                              ┌──────────────────────────────────────────────┐
                              │              Client (React + Vite)           │
                              └──────────────────────┬───────────────────────┘
                                                     │ HTTP / REST + Idempotency-Key
                                                     ▼
                              ┌──────────────────────────────────────────────┐
                              │        API Gateway & Saga Orchestrator       │
                              └──────┬───────────────────────┬───────────────┘
                                     │                       │
                   ┌─────────────────▼──────────┐ ┌──────────▼─────────────────┐
                   │    Two-Phase Commit (2PC)  │ │      Account & KYC Service  │
                   │  - Step 1: Local Hold      │ │ (PAN/Aadhaar Masking,      │
                   │  - Step 2: NPCI / RBI Wire │ │  Tiered Indian Limits)      │
                   │  - Step 3: Beneficiary Ack │ └──────────┬─────────────────┘
                   │  - Step 4: Ledger Commit   │            │
                   └─────────────────┬──────────┘            │
                                     │                       │
      ┌──────────────────────────────┴───────────────────────┴──────────────────────────────┐
      │                      Multi-Node Raft Consensus Cluster                             │
      │                                                                                    │
      │   ┌────────────────────────┐  Heartbeat   ┌────────────────────────┐               │
      │   │ node-mum-dc1 (LEADER)  │ ───────────► │ node-blr-dc2 (FOLLOWER)│ (Active Sync) │
      │   │ Mumbai DC1             │              │ Bengaluru DC2          │               │
      │   └───────────┬────────────┘              └────────────────────────┘               │
      │               │                                                                    │
      │               │ Asynchronous Replication Log                                       │
      │               ▼                                                                    │
      │   ┌────────────────────────┐                                                       │
      │   │ node-del-dr3 (REPLICA) │ Disaster Recovery Hot Standby                         │
      │   │ Delhi DR3              │                                                       │
      │   └────────────────────────┘                                                       │
      └────────────────────────────────────────────────────────────────────────────────────┘
```

### Distributed System Capabilities
1. **Raft Replication Index:** Monotonically advancing commit index (e.g. Log `#2845`) across leader and follower nodes with periodic heartbeats (1,200 ms).
2. **2PC Saga Step Tracing:** Inspectable trace steps for every interbank payment:
   - `LOCAL_HOLD_PREPARED` $\to$ Pre-authorizes funds on source node.
   - `NPCI_UPI_SWITCH_DISPATCHED` $\to$ Routes payment through simulated NPCI switch.
   - `BENEFICIARY_NODE_ACK` $\to$ Receives confirmation from destination node.
   - `DOUBLE_ENTRY_COMMITTED` $\to$ Posts balanced double-entry journal entries.
3. **Interactive Chaos Lab:**
   - **Simulate Network Partition:** Disconnect follower `node-blr-dc2` to test cluster fault-tolerance and replication recovery.
   - **Simulate NPCI Switch Timeout:** Trigger an upstream interbank switch failure to verify that the Saga orchestrator automatically releases local holds with a compensating rollback, producing **zero ledger drift**.
4. **Distributed Idempotency Protection:** Clients transmit unique `Idempotency-Key` tokens. Network retries, duplicate clicks, or dropped packets safely return cached transaction receipts without double-debiting accounts.
5. **Transactional Outbox Event Bus:** Event topics (`novabank.in.ledger.postings`, `novabank.in.upi.clearing`, `novabank.in.rtgs.gross`, `novabank.in.audit.events`) with asynchronous worker dispatch and Dead Letter Queue (DLQ) support.

---

## 3. Authentication & Demo Personas

The application features persistent sessions via browser `localStorage` and quick-fill demo personas:

| Name | Role | Email | Password | Initial Balances | IFSC / UPI | KYC Status & Permissions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Elena Vance Sharma** | Customer | `elena@novabank.demo` | `demo1234` | Checking: ₹4,85,020.00<br>Savings: ₹18,42,000.00 | `NOVA0001001`<br>`elena@novaupi` | **Tier 1 Verified**<br>Full UPI/IMPS/NEFT/RTGS access (₹10 Lakh daily limit) |
| **Marcus Brody Patel** | Customer | `marcus@novabank.demo` | `demo1234` | Checking: ₹50,000.00 | `NOVA0001002`<br>`marcus@novaupi` | **Pending Review**<br>Restricted to ₹50,000 max transfer until approved |
| **Sarah Jenkins** | Staff | `sarah.compliance@novabank.demo` | `demo1234` | Operations Console | N/A | **Compliance Officer**<br>Approves KYC, reverses transactions, manages limits |
| **Alex Rivera** | Admin | `alex.admin@novabank.demo` | `demo1234` | Treasury & Vault | N/A | **System Architect**<br>Audits ledger invariants and monitors cluster topology |

---

## 4. Setup & Running Locally

### Prerequisites
- Node.js $\ge 18$
- npm

### Installation
```bash
npm install
```

### Development Server (Port 3000)
```bash
npm run dev
```
Starts full-stack Express server at `http://localhost:3000` with embedded Vite dev middleware.

### Automated Banking Invariant Tests
```bash
npm test
```
Executes the comprehensive automated test suite verifying:
1. Double-Entry Invariant ($\sum \text{Dr} = \sum \text{Cr}$, Delta = ₹0.0000 across Assets, Liabilities, and Equity)
2. Idempotency Protection (Duplicate transfer retries prevented)
3. Insufficient Funds & Hold Protection (Overdraft prevention in INR)
4. Concurrent Race-Condition Mutex Lock Safety
5. Immutable Reversal Journal Entries
6. RBAC & Account Ownership Authorization
7. RTGS Minimum Amount Rule & Multi-Step 2PC Saga Orchestration (with 12-digit RRN & distributed trace ID)

### Production Build
```bash
npm run build
npm start
```

---

## 5. Environment Variables

Defined in `.env.example`:
```ini
# GEMINI_API_KEY: Optional AI Studio integration key
GEMINI_API_KEY="MY_GEMINI_API_KEY"

# APP_URL: Development or production service URL
APP_URL="http://localhost:3000"

# PORT: Server port (defaults to 3000)
PORT=3000
```

---

## 6. Known Limitations (Demo Scope)

- **Simulated In-Memory Cluster:** The 3-node cluster and Raft log state operate in-memory with seed rehydration for rapid experimentation. For high-throughput production, an external consensus engine (e.g. etcd, CockroachDB, or TigerBeetle) would be deployed.
- **Simulated Clearing Switch:** NPCI UPI, IMPS, and RBI RTGS switches are simulated locally with realistic latency and protocol steps rather than connecting to live National Automated Clearing House (NACH) or RBI SFMS endpoints.
- **Demo KYC Storage:** PAN and Aadhaar identity documents are masked client-side and server-side; no real identity databases are consulted.
