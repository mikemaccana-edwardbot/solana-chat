//! Solana wallet authentication for Matrix.
//!
//! Users log in by signing a challenge message with their Solana wallet's ed25519 key.
//! The Matrix localpart is the hex-encoded 32-byte public key (always 64 lowercase hex chars).
//! The display name is set to the base58 address so users see the familiar Solana format.

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::{services, Error, Result};

/// How long a nonce is valid after creation.
const NONCE_TTL: Duration = Duration::from_secs(300); // 5 minutes

/// Maximum number of stored nonces before we prune expired ones.
const MAX_NONCES: usize = 10_000;

/// In-memory nonce store. Each nonce can only be used once.
/// In production you'd want this in the database, but for MVP this is fine.
static NONCES: std::sync::LazyLock<Mutex<HashMap<String, Instant>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Request body for the nonce challenge endpoint.
#[derive(Debug, Deserialize)]
pub struct NonceRequest {
    /// The Solana public key (base58-encoded) requesting a challenge.
    pub address: String,
}

/// Response body for the nonce challenge endpoint.
#[derive(Debug, Serialize)]
pub struct NonceResponse {
    pub nonce: String,
    pub message: String,
    pub expires_in_seconds: u64,
}

/// Login request fields for `m.login.solana.signature`.
#[derive(Debug, Deserialize)]
pub struct SolanaLoginRequest {
    /// Base58-encoded Solana public key (32 bytes).
    pub address: String,
    /// Base58-encoded ed25519 signature (64 bytes).
    pub signature: String,
    /// The nonce that was signed.
    pub nonce: String,
}

/// Generate a nonce challenge for a Solana address.
/// The client must sign the returned `message` field with their wallet.
pub fn generate_nonce(address: &str) -> Result<NonceResponse> {
    // Validate that the address is valid base58-encoded ed25519 pubkey
    let pubkey_bytes = bs58::decode(address)
        .into_vec()
        .map_err(|_| Error::BadRequest(ruma::api::client::error::ErrorKind::InvalidParam, "Invalid base58 address."))?;

    if pubkey_bytes.len() != 32 {
        return Err(Error::BadRequest(
            ruma::api::client::error::ErrorKind::InvalidParam,
            "Solana address must decode to exactly 32 bytes.",
        ));
    }

    let nonce = generate_random_nonce();
    let server_name = services().globals.server_name();
    let message = format_sign_message(server_name.as_str(), &nonce);

    // Store nonce with timestamp
    let mut nonces = NONCES.lock().expect("nonce lock poisoned");

    // Prune expired nonces if we're getting too many
    if nonces.len() > MAX_NONCES {
        let now = Instant::now();
        nonces.retain(|_, created| now.duration_since(*created) < NONCE_TTL);
    }

    nonces.insert(nonce.clone(), Instant::now());

    Ok(NonceResponse {
        nonce,
        message,
        expires_in_seconds: NONCE_TTL.as_secs(),
    })
}

/// Verify a Solana wallet signature and return the user's hex-encoded public key
/// (for use as Matrix localpart) and base58 address (for display name).
pub fn verify_solana_login(request: &SolanaLoginRequest) -> Result<(String, String)> {
    let error_kind = ruma::api::client::error::ErrorKind::forbidden();

    // Decode the public key from base58
    let pubkey_bytes = bs58::decode(&request.address)
        .into_vec()
        .map_err(|_| Error::BadRequest(error_kind.clone(), "Invalid base58 address."))?;

    if pubkey_bytes.len() != 32 {
        return Err(Error::BadRequest(
            error_kind.clone(),
            "Solana address must decode to exactly 32 bytes.",
        ));
    }

    let pubkey_array: [u8; 32] = pubkey_bytes
        .try_into()
        .map_err(|_| Error::BadRequest(error_kind.clone(), "Invalid public key length."))?;

    let verifying_key = VerifyingKey::from_bytes(&pubkey_array)
        .map_err(|_| Error::BadRequest(error_kind.clone(), "Invalid ed25519 public key."))?;

    // Decode the signature from base58
    let sig_bytes = bs58::decode(&request.signature)
        .into_vec()
        .map_err(|_| Error::BadRequest(error_kind.clone(), "Invalid base58 signature."))?;

    if sig_bytes.len() != 64 {
        return Err(Error::BadRequest(
            error_kind.clone(),
            "Signature must be exactly 64 bytes.",
        ));
    }

    let sig_array: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| Error::BadRequest(error_kind.clone(), "Invalid signature length."))?;

    let signature = Signature::from_bytes(&sig_array);

    // Verify the nonce exists and hasn't expired, then consume it (one-time use)
    let server_name = services().globals.server_name();
    let message = format_sign_message(server_name.as_str(), &request.nonce);

    {
        let mut nonces = NONCES.lock().expect("nonce lock poisoned");
        let created = nonces.remove(&request.nonce).ok_or_else(|| {
            Error::BadRequest(error_kind.clone(), "Nonce not found or already used.")
        })?;

        if Instant::now().duration_since(created) > NONCE_TTL {
            return Err(Error::BadRequest(error_kind.clone(), "Nonce has expired."));
        }
    }

    // Verify the signature over the challenge message
    verifying_key
        .verify(message.as_bytes(), &signature)
        .map_err(|_| Error::BadRequest(error_kind, "Signature verification failed."))?;

    // Hex-encode the public key for the Matrix localpart (always lowercase, always 64 chars)
    let hex_localpart = hex::encode(pubkey_array);
    let base58_address = request.address.clone();

    info!(
        "Solana auth verified: {} (localpart: {})",
        base58_address, hex_localpart
    );

    Ok((hex_localpart, base58_address))
}

/// Format the challenge message that the wallet must sign.
/// This is human-readable so users can verify what they're signing in their wallet popup.
fn format_sign_message(server_name: &str, nonce: &str) -> String {
    format!(
        "Sign in to {server_name}\n\nNonce: {nonce}\n\nThis signature will not trigger a blockchain transaction or cost any fees."
    )
}

/// Generate a cryptographically random nonce string.
fn generate_random_nonce() -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    let bytes: [u8; 32] = rng.random();
    hex::encode(bytes)
}
