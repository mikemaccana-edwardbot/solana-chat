# Homeserver Registry

[![Test](https://github.com/mikemaccana/homeserver-registry/actions/workflows/test.yml/badge.svg)](https://github.com/mikemaccana/homeserver-registry/actions/workflows/test.yml)

An onchain directory that maps Solana wallet addresses to Matrix homeserver URLs. Think DNS for chat — given any wallet address, look up where to reach them.

## Why

Decentralised chat needs a way to find people without relying on a single server. This program stores homeserver delegations onchain so that:

- Anyone can look up a wallet's homeserver with a single RPC call
- Users can switch homeservers by updating their delegation
- No single server controls the directory
- Identity (wallet) is decoupled from infrastructure (homeserver)

## How It Works

Each wallet gets a PDA (`["delegation", wallet_address]`) that stores their homeserver URL. The owner signs once to register, and can update or remove it at any time.

### Instructions

- **register(homeserver)** — Create or update a homeserver delegation. The homeserver must be a valid hostname (contains a dot, no protocol prefix, no spaces). Calling again overwrites the previous value.
- **unregister()** — Remove the delegation and reclaim rent. Only the owner can close their account.

### Lookup

Derive the PDA from any wallet address and read the `homeserver` field:

```typescript
const [delegationAddress] = PublicKey.findProgramAddressSync(
  [Buffer.from("delegation"), walletAddress.toBuffer()],
  programId
);
const delegation = await program.account.delegation.fetch(delegationAddress);
console.log(delegation.homeserver); // "chat.example.com"
```

### State

```
Delegation {
    owner: Pubkey,        // The wallet that owns this delegation
    homeserver: String,   // e.g. "chat.example.com" (max 253 chars)
    updated_at: i64,      // Unix timestamp of last update
    bump: u8,             // PDA bump seed
}
```

## Testing

```
npm test
```

## Setup

Requires Anchor 0.32.1, Solana CLI 3.1.8, Node.js, and npm.
