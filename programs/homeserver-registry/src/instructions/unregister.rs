use anchor_lang::prelude::*;

use crate::state::Delegation;

/// Remove a homeserver delegation and reclaim the rent.
///
/// Only the original owner can close their delegation account.
pub fn handle_unregister(_context: Context<UnregisterAccountConstraints>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct UnregisterAccountConstraints<'info> {
    #[account(
        mut,
        close = owner,
        seeds = [b"delegation", owner.key().as_ref()],
        bump = delegation.bump,
        has_one = owner,
    )]
    pub delegation: Account<'info, Delegation>,

    #[account(mut)]
    pub owner: Signer<'info>,
}
