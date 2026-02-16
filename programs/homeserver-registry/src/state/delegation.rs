use anchor_lang::prelude::*;

/// Stores a wallet's homeserver delegation.
///
/// PDA seeds: ["delegation", owner.key()]
/// Anyone can look up a wallet's homeserver by deriving this PDA.
#[derive(InitSpace)]
#[account]
pub struct Delegation {
    /// The wallet that owns this delegation.
    pub owner: Pubkey,

    /// The homeserver URL (e.g. "chat.example.com").
    #[max_len(253)]
    pub homeserver: String,

    /// Unix timestamp when the delegation was created or last updated.
    pub updated_at: i64,

    /// PDA bump seed for re-derivation.
    pub bump: u8,
}
