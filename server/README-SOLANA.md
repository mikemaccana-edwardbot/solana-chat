# Solana Matrix Chat

A Conduit (Matrix homeserver) fork that lets anyone with a Solana wallet join Matrix chat. No passwords, no email — just connect your wallet and start chatting.

## How It Works

1. **Connect Wallet**: User opens the web client and connects their Solana wallet (Phantom, Solflare, Backpack, etc.)
2. **Sign Challenge**: Server generates a nonce challenge; the wallet signs it with ed25519
3. **Verify & Login**: Server verifies the signature, creates a Matrix account, and issues an access token
4. **Chat**: User is logged into Matrix and can use any Matrix client

### Identity Mapping

| Layer | Format | Example |
|-------|--------|---------|
| Matrix localpart | Hex-encoded 32-byte pubkey (64 chars) | `@a1b2c3...ef:server` |
| Display name | Base58 Solana address | `7xKXp6Kj1rfRBMdqFnGvm4ttKJm3nFz` |
| Future: display name | .sol or .bonk domain name | `mike.sol` |

Hex encoding is used for the Matrix localpart because the Matrix spec only allows lowercase `a-z`, `0-9`, and a few symbols — base58 uses uppercase letters which are forbidden. The hex-encoded public key is lossless (can reconstruct the address) and always valid.

## Auth Flow

```
Client                          Server
  |                                |
  |  POST /nonce {address}         |
  |------------------------------->|
  |  {nonce, message}              |
  |<-------------------------------|
  |                                |
  |  wallet.signMessage(message)   |
  |                                |
  |  POST /login                   |
  |  {type: "m.login.solana.signature",
  |   address, signature, nonce}   |
  |------------------------------->|
  |  verify ed25519 sig            |
  |  create/find user              |
  |  {access_token, user_id}       |
  |<-------------------------------|
```

### Endpoints

- `POST /_matrix/client/unstable/org.solana.auth/nonce` — Get a challenge nonce
  - Request: `{"address": "<base58 pubkey>"}`
  - Response: `{"nonce": "...", "message": "...", "expires_in_seconds": 300}`

- `POST /_matrix/client/v3/login` — Standard Matrix login, extended with:
  - `{"type": "m.login.solana.signature", "address": "...", "signature": "...", "nonce": "..."}`

## Configuration

Add to your `conduit.toml`:

```toml
# Enable Solana wallet authentication
allow_solana_auth = true

# Auto-join new users to a lobby room (optional)
solana_auto_join_room = "lobby"
```

## Building

```bash
# SQLite backend (lighter, good for MVP)
cargo build --release --no-default-features --features="conduit_bin,backend_sqlite"

# RocksDB backend (better performance)
cargo build --release
```

## Running

```bash
# Create config
cp conduit-example.toml conduit.toml
# Edit conduit.toml — set server_name, enable allow_solana_auth

# Run
./target/release/conduit
```

## Web Client

The `web-client/` directory contains a minimal login page. Serve it from any static file host (nginx, Vercel, etc.) or configure Conduit to serve it.

The web client:
- Detects Solana wallets (Phantom, Solflare, Backpack)
- Requests a nonce challenge from the server
- Has the wallet sign the challenge
- Submits the signature to the Matrix login endpoint
- Provides the access token for use in Element or other Matrix clients

## Roadmap

- [x] Solana wallet ed25519 auth
- [x] Hex pubkey → Matrix localpart mapping
- [x] Base58 display names
- [x] Minimal web login client
- [ ] SNS (.sol) and ANS (.bonk) name resolution for display names
- [ ] Token-gated rooms (require specific token/NFT to join)
- [ ] Auto-create lobby room on first boot
- [ ] Element Web integration (embedded, not redirect)
- [ ] Federation with other Solana Matrix servers

## Stack

- **Conduit** (Rust) — Lightweight Matrix homeserver
- **ed25519-dalek** — Signature verification (same curve as Solana wallets)
- **@solana/kit** — Client-side wallet interaction (planned, currently using raw wallet adapter)
- **Matrix protocol** — Federated, encrypted messaging
