use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("27JU28YBf5RJmEHAn9BwnWFyfPMLkUdSafKgz9xQB9zn");

#[program]
pub mod homeserver_registry {
    use super::*;

    /// Register or update a homeserver delegation for the signing wallet.
    /// The PDA is derived from the wallet address, so each wallet gets one delegation.
    pub fn register(context: Context<RegisterAccountConstraints>, homeserver: String) -> Result<()> {
        instructions::register::handle_register(context, homeserver)
    }

    /// Remove a homeserver delegation and reclaim rent.
    pub fn unregister(context: Context<UnregisterAccountConstraints>) -> Result<()> {
        instructions::unregister::handle_unregister(context)
    }
}
