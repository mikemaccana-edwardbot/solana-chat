use anchor_lang::prelude::*;

use crate::state::Delegation;
use crate::errors::RegistryError;

/// Register or update a homeserver delegation.
///
/// The owner signs once to designate their homeserver. Calling again with a
/// different homeserver overwrites the previous delegation.
pub fn handle_register(context: Context<RegisterAccountConstraints>, homeserver: String) -> Result<()> {
    require!(!homeserver.is_empty(), RegistryError::EmptyHomeserver);
    require!(homeserver.len() <= 253, RegistryError::HomeserverTooLong);
    require!(is_valid_hostname(&homeserver), RegistryError::InvalidHomeserver);

    let delegation = &mut context.accounts.delegation;
    delegation.owner = context.accounts.owner.key();
    delegation.homeserver = homeserver;
    delegation.updated_at = Clock::get()?.unix_timestamp;
    delegation.bump = context.bumps.delegation;

    Ok(())
}

#[derive(Accounts)]
pub struct RegisterAccountConstraints<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = Delegation::DISCRIMINATOR.len() + Delegation::INIT_SPACE,
        seeds = [b"delegation", owner.key().as_ref()],
        bump
    )]
    pub delegation: Account<'info, Delegation>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Basic hostname validation: must contain at least one dot, no spaces,
/// no protocol prefix, and only valid hostname characters.
fn is_valid_hostname(hostname: &str) -> bool {
    if !hostname.contains('.') {
        return false;
    }
    if hostname.contains(' ') || hostname.contains("://") {
        return false;
    }
    hostname
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '.' || character == '-' || character == ':')
}
