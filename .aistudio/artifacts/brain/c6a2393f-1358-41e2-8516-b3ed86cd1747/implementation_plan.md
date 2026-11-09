# Dedicated Authentication, Registration & Logout System

Implement a dedicated authentication portal with login, new customer registration, persistent session tokens via browser local storage, and an explicit logout control in the top navigation bar.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following requirements have been confirmed based on your selections:
> - **Logged-Out Experience**: A dedicated full-page authentication portal with tabs for **Sign In** and **Create Account**, accompanied by 1-click quick-fill buttons for all seeded personas (Elena Vance, Marcus Brody, Sarah Jenkins, Alex Rivera).
> - **Session Persistence**: Authentication token stored in `localStorage` so sessions survive browser refreshes, with an immediate **Log Out** button in the header profile menu.
> - **Customer Registration**: New customers can register an account (name, email, phone, password), which automatically provisions a new checking account, logs them in, and establishes a fresh session.

---

## 1. Overview & Core Concept

Currently, the banking demo initializes with a default session for Elena Vance and allows switching personas via a dropdown. This update separates the unauthenticated and authenticated states:

- **Unauthenticated State**: When logged out or visiting for the first time without an active token, the user is presented with the **NovaBank Secure Portal**. From here, users can enter credentials, click any pre-configured demo persona to instantly populate and authenticate, or toggle to the registration tab to open a simulated customer account.
- **Authenticated State**: Once logged in, the full core banking application loads with the customer's or staff member's real-time accounts and permissions. The top bar displays an explicit **Log Out** button that invalidates the local session token and returns the user to the login screen with a confirmation toast.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Sign In Flow**:
   - User arrives at the login portal with NovaBank branding, security notices, and simulated environment disclaimers.
   - User can type their email and password (default `demo1234`), or click any quick-fill button:
     - **Elena Vance** (Verified Customer — Checking & High-Yield Savings)
     - **Marcus Brody** (Customer — Pending KYC Review)
     - **Sarah Jenkins** (Compliance & Operations Staff)
     - **Alex Rivera** (Core Banking System Administrator)
   - Clicking **Sign In** authenticates via `POST /api/auth/login`, stores the token in `localStorage`, and opens the dashboard.

2. **Self-Service Registration Flow**:
   - User switches to the **Create Customer Account** tab.
   - User enters Full Name, Email, Phone, and Password.
   - Clicking **Open Account** calls `POST /api/auth/register`, which hashes the password with salt, provisions a new everyday checking account (`100XXXXXXX`) with routing `021000021`, records the audit event, and logs the user into their fresh account.

3. **Log Out Flow**:
   - In the top header bar, the user profile area provides an explicit **Log Out** button with an exit icon.
   - Clicking **Log Out** removes the session token from `localStorage`, resets the in-memory client session, and renders the login portal with a clean notification: *"You have been logged out securely."*

### Visual Identity & Layout

- **Layout Structure**: Split-column or centered container with subtle slate surface (`bg-slate-50`), crisp white card container with 1px border (`border-slate-200`), and generous padding.
- **Typography & Details**: Clean typographic hierarchy using `Plus Jakarta Sans` for titles and `JetBrains Mono` for masked demo credentials and routing numbers.
- **Zero-Slop Discipline**: No decorative pulsing dots, no code-comment headings, and clear human-readable validation feedback.

---

## 3. Key Product Decisions & Trade-Offs

- **Local Storage Token Persistence**:
  - *Chosen Approach*: Store the active session token in `localStorage.getItem('novabank_session_token')`.
  - *Why*: Ensures browser reloads, navigation between views, and multi-tab workflows maintain the user's logged-in state without re-prompting.
  - *Alternative Considered*: In-memory only session — rejected as refreshing the browser would constantly eject the user back to the login screen.
- **1-Click Demo Persona Auto-Fill**:
  - *Chosen Approach*: Prominent, clean buttons for each seeded persona on the login screen.
  - *Why*: Allows educators, evaluators, and testers to explore customer vs staff role differences effortlessly without having to manually memorize email addresses and passwords.
- **Audited Session Management**:
  - *Chosen Approach*: Server logs both `USER_LOGIN` and `USER_LOGOUT` events in the tamper-evident SHA-256 audit log.

---

## 4. Technical Architecture & Data Strategy

### System Component Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        App.tsx (Root State)                            │
│  - Reads token from localStorage ('novabank_session_token')            │
│  - If no token or invalid: Renders <LoginView />                       │
│  - If authenticated: Renders <Header /> + Main Views                   │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │                                  │
    ┌──────────────▼─────────────┐     ┌──────────────▼────────────────┐
    │       <LoginView />        │     │     <Header /> (Logged In)    │
    │  - Tab 1: Sign In          │     │  - Active Persona Display     │
    │  - Tab 2: Register Account │     │  - Fast Switcher (for tests)  │
    │  - Quick Persona Selector  │     │  - Explicit "Log Out" Button  │
    └──────────────┬─────────────┘     └──────────────┬────────────────┘
                   │                                  │
                   │ POST /api/auth/login             │ Invalidate Token
                   │ POST /api/auth/register          │ Clear localStorage
                   ▼                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        server.ts & store.ts                            │
│  - Salted PBKDF2 password verification                                 │
│  - Session token creation and mapping in sessions Map                  │
│  - Audit log recording of auth state transitions                       │
└────────────────────────────────────────────────────────────────────────┘
```

### Component & State Changes

1. **`src/api.ts`**:
   - Initialize token from `localStorage.getItem('novabank_session_token')`.
   - Update `setSessionToken(token)` to synchronize with `localStorage` (and remove on null).
   - Add `api.logout()` method to clear session locally and notify server.
2. **`src/components/LoginView.tsx`** (New Component):
   - Full-page dedicated authentication card with tabbed Sign In / Register forms.
   - Quick-select buttons for Elena Vance, Marcus Brody, Sarah Jenkins, and Alex Rivera.
   - Comprehensive error, loading, and field validation states.
3. **`src/components/Header.tsx`**:
   - Add dedicated **Log Out** button with confirmation and clean styling.
4. **`src/App.tsx`**:
   - Conditional rendering: If `!currentUser`, render `<LoginView />`.
   - On successful login or registration, store token, set current user, and render dashboard.
   - On logout, purge token and return to `<LoginView />`.
