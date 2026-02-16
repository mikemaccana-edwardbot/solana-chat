use anchor_lang::prelude::*;

#[error_code]
pub enum RegistryError {
    #[msg("Homeserver URL cannot be empty")]
    EmptyHomeserver,

    #[msg("Homeserver URL exceeds 253 characters (max DNS name length)")]
    HomeserverTooLong,

    #[msg("Homeserver URL is not a valid hostname (must contain a dot, no spaces or protocol prefix)")]
    InvalidHomeserver,
}
