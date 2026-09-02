# SIDRA EXCHANGE

Production-grade Hybrid Cryptocurrency Exchange — P2P Marketplace trading model built on Ethereum Sepolia & Base Sepolia testnets.

## Architecture

```
sidra-exchange/
├── backend/          # NestJS REST API + WebSocket Gateway
│   ├── prisma/       # Prisma schema, migrations, seed
│   └── src/
│       ├── common/   # Guards, decorators, filters, interceptors, services
│       └── modules/  # Feature modules (auth, wallets, orders, admin, ...)
├── frontend/         # Next.js 14 App Router + Tailwind + Shadcn UI
│   └── src/
│       ├── app/      # Pages (landing, trade, wallet, admin, ...)
│       ├── components/  # Reusable components
│       └── lib/      # API client, auth context, socket client
├── shared/           # Shared TypeScript types & constants
└── supabase/         # Supabase SQL schema
```

## Tech Stack

| Layer        | Technology                                      |
|--------------|-------------------------------------------------|
| Database     | Supabase PostgreSQL + Prisma ORM                |
| Backend      | NestJS, TypeScript, JWT, Passport, Bcrypt       |
| Blockchain   | Ethers.js v6, Public RPC (Sepolia / Base Sepolia)|
| Real-time    | WebSocket (Socket.IO)                           |
| Email        | Nodemailer (SMTP)                               |
| Frontend     | Next.js 14, Tailwind CSS, Shadcn UI, TanStack Query, Zod |

## Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- Supabase project (PostgreSQL)
- SMTP credentials (e.g., Resend, SendGrid, Gmail App Password)
- Sepolia & Base Sepolia test ETH (public faucets)

## Environment Setup

### 1. Supabase Database

Run the SQL schema from `supabase/schema.sql` in your Supabase SQL editor.

Connection string format:
```
postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

### 2. Backend (`backend/.env`)

```env
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
ENCRYPTION_KEY=32-byte-hex-key
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASSWORD=re_...
SMTP_FROM=SIDRA Exchange <no-reply@sidra.exchange>
FRONTEND_URL=http://localhost:3000

# Blockchain — TESTNET (Sepolia / Base Sepolia)
# This deployment is pinned to testnet. The backend enforces this at runtime
# (any ChainConfig row or env var pointing at mainnet chainIds 1 / 8453 is
# refused with a loud error). To explore a non Sepolia/Base-Sepolia network,
# add a corresponding row to ChainConfig with a testnet chainId.
NETWORK_TYPE=testnet
ETHEREUM_RPC_URL=https://ethereum-sepolia.publicnode.com
BASE_RPC_URL=https://base-sepolia.publicnode.com
ETHEREUM_CHAIN_ID=11155111        # Sepolia
BASE_CHAIN_ID=84532               # Base Sepolia
ETHEREUM_CONFIRMATIONS=3
BASE_CONFIRMATIONS=3
ETHEREUM_POLLING_INTERVAL_MS=30000
BASE_POLLING_INTERVAL_MS=30000
ETHEREUM_EXPLORER_URL=https://sepolia.etherscan.io
BASE_EXPLORER_URL=https://sepolia.basescan.org
```

Generate a 32-byte encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

## Running Locally

```bash
# Install all workspace dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Push schema to Supabase
npm run prisma:migrate

# Seed initial data (chains, tokens, pairs, fees, admin user)
npm run prisma:seed

# Start backend (port 3001) + frontend (port 3000)
npm run dev:backend
npm run dev:frontend
```

Open:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api/v1
- Swagger Docs: http://localhost:3001/api/docs
- Prisma Studio: http://localhost:5555

## Default Admin

The seed script creates an admin account:

```
email: admin@sidra.exchange
password: (printed in terminal during seed)
```

**Change this immediately after first login.**

## P2P Marketplace Trading Flow

1. **Seller** creates a sell order (asset, quantity, price)
2. Order appears in the Open Orders book
3. **Buyer** either:
   - Accepts the seller price (instant trade)
   - Creates a **counter offer** (new price)
4. **Seller** responds:
   - Accept (trade executes automatically)
   - Reject (order returns to Open)
   - Counter again (new round of negotiation)
5. On acceptance, the matching engine executes atomically:
   - Buyer's quote-token balance debited
   - Seller's base-token balance debited
   - Both parties credited with received assets
   - Trade history + notification + WebSocket update

## Supported Assets

| Chain    | ETH | USDT | USDC | SIDRA (future) |
|----------|-----|------|------|----------------|
| Ethereum | ✅  | ✅   | ✅   | configurable   |
| Base     | ✅  | ✅   | ✅   | configurable   |

Add new tokens at runtime via **Admin → Tokens** — no code changes required.

## Deposit / Withdrawal Details

### Deposits (auto-detected via blockchain polling)
- ETH minimum: `0.001`
- USDT / USDC minimum: `0.1`
- Every user has unique deposit addresses per chain
- Free public RPC polling (no paid APIs)
- Confirmations tracked; duplicates prevented

### Withdrawals
- ETH minimum: `0.001`
- USDT / USDC minimum: `10`
- Withdrawal fee: `1%` (configurable by admin)
- Email OTP required (6 digits, 5-min expiry, 5 attempt max, 60s resend)
- On-chain transaction broadcast via public RPC

## Security Features

- Bcrypt password hashing
- JWT access + refresh tokens in secure HTTP-only cookies
- Private keys encrypted (AES-256-GCM) before storage
- Helmet security headers
- Rate limiting on auth endpoints
- CSRF-safe cookie handling (SameSite + credentials)
- Input validation (class-validator / Zod)
- Role-based access control (USER / ADMIN / SUPER_ADMIN)
- Full audit logging (login, admin actions, withdrawals, etc.)
- All error responses sanitized (no stack traces leaked)

## Real-Time Updates (WebSocket)

Connected clients receive instant events:

```
balance:update        - wallet balance changed
order:update          - order status changed
trade:executed        - trade completed
counter:offer         - new counter offer
notification:new      - new notification
admin:dashboard       - admin stats refresh
```

## Deployment

### Vercel (Frontend)

1. Import the `frontend` directory
2. Framework preset: Next.js
3. Env vars: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`
4. Deploy

### Railway / Render (Backend)

1. Create new service, point to `backend` directory
2. Build: `npm install && npm run prisma:generate && npm run build`
3. Start: `node dist/main.js`
4. Add all backend env vars
5. Deploy

### Supabase

1. Create project
2. Run `supabase/schema.sql` in SQL editor
3. Copy connection string to `DATABASE_URL`

### Docker (Optional)

```bash
docker-compose up --build
```

## Scripts

| Script                 | Description                              |
|------------------------|------------------------------------------|
| `npm run dev:backend`  | Start NestJS dev server (port 3001)      |
| `npm run dev:frontend` | Start Next.js dev server (port 3000)     |
| `npm run build`        | Build backend + frontend                 |
| `npm run prisma:seed`  | Seed chains, tokens, pairs, fees, admin  |
| `npm run prisma:studio`| Open Prisma Studio                       |

## API Overview

All endpoints prefixed with `/api/v1`.

| Module       | Endpoints                                      |
|--------------|------------------------------------------------|
| Auth         | POST /auth/register, /auth/login, /auth/login/request-otp, /auth/login/verify-otp, /auth/refresh, /auth/logout, /auth/forgot-password, /auth/reset-password, POST /auth/verify-email |
| OTP          | POST /otp/send-email, POST /otp/verify         |
| Users        | GET /users/me, PATCH /users/me                 |
| Wallets      | GET /wallets, GET /wallets/balances             |
| Deposits     | GET /deposits/me, GET /deposits/addresses       |
| Withdrawals  | POST /withdrawals, POST /withdrawals/:id/confirm|
| Orders       | POST /orders, GET /orders/open, POST /orders/:id/accept, POST /orders/:id/counter, POST /orders/:id/respond-counter |
| Trades       | GET /trades/me, GET /trades/history             |
| Notifications| GET /notifications/me, PATCH /notifications/:id/read |
| Admin        | GET /admin/dashboard, /admin/users, /admin/analytics, /admin/blockchain, PATCH /admin/users/:id/status, POST /admin/wallets/:id/credit |
| Settings     | GET /settings/tokens, /settings/chains, /settings/trading-pairs, /settings/system |

Full interactive docs: http://localhost:3001/api/docs (Swagger)

## Testing

```bash
npm run test          # Backend unit tests
npm run lint          # Lint backend + frontend
```

## Project Status

Production-ready MVP for Ethereum Sepolia / Base Sepolia testnets with full P2P marketplace trading, deposits, withdrawals, admin panel, and real-time updates. SIDRA token can be added via Admin → Tokens configuration.#   L a u n c h M a r k e t - c r y p t o - e x c h a n g e  
 