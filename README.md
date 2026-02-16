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

1. **Connect wallet** — Phantom, Solflare, Backpack, or any Solana wallet
2. **Pick a homeserver** — choose a default or enter your own
3. **Register onchain** — one transaction delegates your wallet to your chosen homeserver (costs a fraction of a cent in rent)
4. **Sign in** — wallet signs a nonce challenge, homeserver creates your account and issues a session token
5. **Chat** — DMs by wallet address, group chats, rooms. Standard Matrix under the hood.

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

- **Homeserver Registry** (`programs/homeserver-registry/`) — Anchor program that maps wallet addresses to homeserver URLs. Each wallet gets a PDA storing its delegation. Anyone can look up where to reach a wallet with a single RPC call.
- **Server** (`server/`) — Fork of [Conduit](https://conduit.rs), a fast Matrix homeserver written in Rust. Adds a custom `m.login.solana.signature` login type that verifies ed25519 wallet signatures and auto-creates accounts.
- **Client** (`client/`) — Vite + React web app. Connects wallets, registers homeserver delegations onchain, signs into homeservers, and provides chat UI. Plain CSS, no frameworks.

## Onchain Registry

Two instructions:

- **`register(homeserver)`** — create or update your homeserver delegation
- **`unregister()`** — remove your delegation and reclaim rent

Lookup is a single RPC call — derive the PDA from any wallet address and read the `homeserver` field:

```typescript
import { getProgramDerivedAddress } from "@solana/kit";

const [delegationAddress] = await getProgramDerivedAddress({
  programAddress: PROGRAM_ID,
  seeds: [Buffer.from("delegation"), walletPublicKey],
});
```

## Identity

Matrix requires lowercase localparts. Base58 has uppercase letters, and lowercasing creates collisions. Instead, the raw 32-byte public key is hex-encoded — exactly 64 lowercase characters, lossless, no collisions. The base58 address is stored as the Matrix display name.

| Layer | Value |
|-------|-------|
| Matrix localpart | `@a1b2c3...64hex:server` |
| Display name | `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU` |
| Onchain PDA | `["delegation", raw_pubkey_bytes]` |

## Running

### Prerequisites

- Node.js 22+
- Rust (stable)
- Solana CLI 3.1.8+
- Anchor CLI 0.32.1+

### Homeserver Registry (program tests)

```bash
cd .
anchor test
```

### Client

```bash
cd client
npm install
npm run dev    # dev server
npm test       # unit tests
npm run build  # production build
```

### Server (Conduit fork)

```bash
cd server
cargo build
```

See `server/DEPLOY.md` for configuration and deployment.

## Testing

- **Anchor program**: 10 tests — registration, updates, validation, access control, unregistration, re-registration, PDA lookup
- **Client**: 18 tests — base58/hex encoding, borsh serialisation, address conversion, Matrix user ID generation
- **Server**: 13 tests — nonce generation, signature verification, replay rejection, localpart derivation, auth flow simulation

## Roadmap

- [ ] Deploy registry to devnet
- [ ] End-to-end test: wallet → onchain delegation → Conduit login → chat
- [ ] .sol and .bonk name resolution for display names
- [ ] Mobile app (after web is proven)
- [ ] Voice/video calls
- [ ] Moderation tools for group chats
- [ ] Sealed sender for metadata privacy

## License

MIT
