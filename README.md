# Solana Chat

[![Test](https://github.com/mikemaccana/solana-chat/actions/workflows/test.yml/badge.svg)](https://github.com/mikemaccana/solana-chat/actions/workflows/test.yml)

Decentralised chat where your Solana wallet is your identity. No phone numbers, no email signups, no single server controlling the network.

## Why

Telegram is the default for crypto communities, but it requires a phone number, runs on centralised servers, and has no native concept of wallet identity. Solana Chat replaces that:

- **Your wallet is your identity** — connect your Solana wallet, and that's your account. No passwords, no phone numbers, no KYC.
- **Your homeserver is your choice** — a global onchain registry maps wallets to homeservers. You pick where your messages are stored. Switch anytime by signing a new delegation.
- **Federation, not centralisation** — built on the Matrix protocol. Messages flow between homeservers. No single point of failure, no single company to trust.
- **Portable identity** — your wallet address works across every homeserver. Move servers without losing your identity or breaking contacts.

## How It Works

1. **Connect wallet** — Phantom, Solflare, Backpack, or any Wallet Standard compatible wallet
2. **Pick a homeserver** — choose a default or enter a custom homeserver URL
3. **Register onchain** — one transaction delegates your wallet to your chosen homeserver via the onchain registry (costs a fraction of a cent in rent)
4. **Sign in** — wallet signs a nonce challenge, homeserver verifies the ed25519 signature, auto-creates your account, and issues a Matrix session token
5. **Chat** — DMs by wallet address, group chats, rooms. Standard Matrix protocol under the hood.

After the initial wallet signature, everything uses Matrix session tokens. No wallet prompts while chatting.

## Architecture

```
┌──────────┐     ┌───────────────────┐     ┌──────────────┐
│  Client   │────▶│  Matrix Homeserver │◀───▶│  Other       │
│  (React)  │     │  (Conduit + Solana │     │  Homeservers │
│           │     │   auth plugin)     │     │  (federated) │
└──────┬───┘     └───────────────────┘     └──────────────┘
       │
       │  register/lookup
       ▼
┌──────────────────┐
│  Solana Blockchain│
│  (Homeserver      │
│   Registry)       │
└──────────────────┘
```

### Homeserver Registry (`programs/homeserver-registry/`)

An Anchor program that maps Solana wallet addresses to homeserver URLs. Each wallet gets a PDA (Program Derived Address) storing its delegation. Anyone can look up where to reach a wallet with a single RPC call.

Two instructions:

- **`register(homeserver)`** — create or update your homeserver delegation. The homeserver must be a valid hostname (contains a dot, no protocol prefix, no spaces, max 253 characters).
- **`unregister()`** — remove your delegation and reclaim rent. Only the owner can close their account.

The PDA is derived from the wallet address: `["delegation", owner_pubkey]`. This means lookups don't require an index — derive the address, fetch the account.

```typescript
import { getPDAAndBump } from "solana-kite";

const { pda } = await getPDAAndBump(PROGRAM_ID, ["delegation", walletAddress]);
const delegation = await connection.rpc.getAccountInfo(pda).send();
```

### Server (`server/`)

Fork of [Conduit](https://conduit.rs), a fast Matrix homeserver written in Rust. Adds Solana wallet authentication via a custom login type.

**Auth flow:**

1. Client requests a nonce challenge:
   ```
   POST /_matrix/client/unstable/org.solana.auth/nonce
   { "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" }
   ```
   Returns:
   ```json
   {
     "nonce": "a1b2c3...",
     "message": "Sign in to chat.example.com\n\nNonce: a1b2c3...\n\nThis signature will not trigger a blockchain transaction or cost any fees.",
     "expires_in_seconds": 300
   }
   ```

2. Client signs the `message` field with the wallet (off-chain, no transaction).

3. Client sends the signature to the standard Matrix login endpoint:
   ```
   POST /_matrix/client/v3/login
   {
     "type": "m.login.solana.signature",
     "address": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
     "signature": "base58-encoded-signature",
     "nonce": "a1b2c3..."
   }
   ```
   Returns a standard Matrix login response with `access_token`, `user_id`, and `device_id`.

**Nonce security:**
- Nonces expire after 5 minutes
- Each nonce can only be used once (consumed on use)
- In-memory store with automatic pruning at 10,000 entries
- Server returns 404 if `allow_solana_auth` is disabled in config

**Config options** (in Conduit config):
- `allow_solana_auth` — enable/disable Solana wallet authentication (default: false)
- `solana_auto_join_room` — reserved for future auto-join on registration

### Client (`client/`)

Vite + React web app with plain CSS. No Tailwind, no utility classes — semantic HTML with proper class names, flex/grid layout.

**Stack:**
- `@solana/react` — wallet connection via Wallet Standard (works with Phantom, Solflare, Backpack, etc.)
- `@solana/kit` — Solana transaction building and address handling
- `solana-kite` — PDA derivation (`getPDAAndBump`), transaction sending (`sendTransactionFromInstructionsWithWalletApp`), message signing (`signMessageFromWalletApp`)
- `matrix-js-sdk` — Matrix client for sync, rooms, messages, real-time updates

**Features:**
- Connect any Wallet Standard compatible wallet
- Pick a homeserver (default or custom URL)
- Register homeserver delegation onchain
- Sign in with wallet signature (off-chain, no transaction fees)
- Find users by wallet address and start DMs
- Create group chats with wallet addresses
- Real-time messaging via Matrix sync
- Dark theme, mobile responsive

## Identity Scheme

Matrix localparts must be lowercase. Base58 has uppercase letters, and lowercasing creates collisions (e.g. `1` and `l` are different in base58 but both lowercase). Instead, the raw 32-byte public key is hex-encoded:

- Always exactly 64 characters
- Always lowercase
- Lossless — hex decodes back to the exact public key
- Valid Matrix localpart characters (a-f, 0-9)

The base58 address is stored as the Matrix display name so users see the familiar Solana format.

| Layer | Value |
|-------|-------|
| Matrix user ID | `@a1b2c3d4e5f6...64hex:server` |
| Display name | `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU` |
| Onchain PDA seeds | `["delegation", raw_pubkey_bytes]` |

## Running

### Prerequisites

- Node.js 22+
- Rust (stable)
- Solana CLI 3.1.8+
- Anchor CLI 0.32.1+

### Homeserver Registry

```bash
anchor build
anchor test
```

### Client

```bash
cd client
npm install
npm run dev    # dev server on localhost:5173
npm test       # unit tests
npm run build  # production build to client/dist/
```

### Server

```bash
cd server
cargo build
```

Configure `allow_solana_auth = true` in your Conduit config. See the [Conduit documentation](https://docs.conduit.rs/) for full server setup (database, domain, TLS, federation).

## Testing

| Component | Tests | Coverage |
|-----------|-------|----------|
| **Anchor program** | 10 | Registration, updates, validation (empty/invalid/protocol prefix), access control, unregistration, re-registration, port numbers, PDA lookup |
| **Client** | 18 | Base58 encode/decode/roundtrip, hex encode/decode, base58↔hex localpart conversion, collision resistance, borsh string encode/decode, Matrix user ID format |
| **Server** | 13 | Nonce generation, hex localpart validity, hex↔base58 roundtrip, ed25519 sign/verify, wrong key rejection, tampered message rejection, nonce replay rejection, base58 signature roundtrip, invalid address rejection, wrong-length pubkey rejection, collision resistance, full auth flow simulation |

Run all tests:

```bash
# Anchor program
anchor test

# Client
cd client && npm test

# Server
cd server && cargo test
```

## Roadmap

- [ ] Deploy registry to devnet
- [ ] End-to-end test: wallet → onchain delegation → Conduit login → chat
- [ ] .sol and .bonk name resolution for display names
- [ ] Public room directory
- [ ] Mobile app (after web client is proven)
- [ ] Voice/video calls
- [ ] Moderation tools for group chats
- [ ] Sealed sender for metadata privacy

## License

MIT
