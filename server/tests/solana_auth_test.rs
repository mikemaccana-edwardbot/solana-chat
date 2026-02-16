//! Unit tests for Solana wallet authentication.
//!
//! These test the cryptographic primitives directly (ed25519 signature verification,
//! hex encoding, base58 decoding) without needing a running Conduit server.
//!
//! Note: ed25519-dalek 2.x uses rand_core 0.6, but Conduit uses rand 0.9 (rand_core 0.9).
//! We generate keys from raw bytes instead of using SigningKey::generate(&mut OsRng)
//! to avoid the rand version conflict.

use ed25519_dalek::{Signer, SigningKey, Verifier, VerifyingKey, Signature};

/// Create a deterministic signing key from a seed byte.
/// This avoids the rand version conflict between ed25519-dalek (rand_core 0.6)
/// and Conduit's rand 0.9.
fn test_signing_key(seed: u8) -> SigningKey {
    let mut secret = [0u8; 32];
    secret[0] = seed;
    // Use sha2 to derive a proper key from the seed
    use sha2::{Sha256, Digest};
    let hash = Sha256::digest([seed]);
    secret.copy_from_slice(&hash);
    SigningKey::from_bytes(&secret)
}

#[test]
fn pubkey_to_hex_localpart_is_64_lowercase_chars() {
    let signing_key = test_signing_key(1);
    let verifying_key = signing_key.verifying_key();
    let hex_localpart = hex::encode(verifying_key.as_bytes());

    assert_eq!(hex_localpart.len(), 64);
    assert!(hex_localpart.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
}

#[test]
fn hex_localpart_is_valid_matrix_localpart() {
    let signing_key = test_signing_key(2);
    let verifying_key = signing_key.verifying_key();
    let hex_localpart = hex::encode(verifying_key.as_bytes());

    // Matrix localpart allowed chars: a-z, 0-9, ., _, =, -, /
    // Hex only uses 0-9 and a-f, which is a subset
    let valid_matrix_chars = |c: char| c.is_ascii_lowercase() || c.is_ascii_digit() || "._=-/".contains(c);
    assert!(hex_localpart.chars().all(valid_matrix_chars));
}

#[test]
fn hex_localpart_roundtrips_to_base58_address() {
    let signing_key = test_signing_key(3);
    let verifying_key = signing_key.verifying_key();
    let pubkey_bytes = verifying_key.as_bytes();

    // Hex encode (what we store as Matrix localpart)
    let hex_localpart = hex::encode(pubkey_bytes);

    // Recover the original bytes from hex
    let recovered_bytes = hex::decode(&hex_localpart).expect("hex decode should work");
    assert_eq!(recovered_bytes.as_slice(), pubkey_bytes.as_slice());

    // Convert to base58 (what users see as display name)
    let base58_address = bs58::encode(pubkey_bytes).into_string();
    let decoded_from_base58 = bs58::decode(&base58_address).into_vec().expect("base58 decode should work");
    assert_eq!(decoded_from_base58.as_slice(), pubkey_bytes.as_slice());

    // Both paths recover the same key
    assert_eq!(recovered_bytes, decoded_from_base58);
}

#[test]
fn solana_address_is_valid_base58_32_bytes() {
    let signing_key = test_signing_key(4);
    let verifying_key = signing_key.verifying_key();
    let base58_address = bs58::encode(verifying_key.as_bytes()).into_string();

    // Solana addresses are typically 32-44 base58 characters
    assert!(base58_address.len() >= 32 && base58_address.len() <= 44,
        "base58 address length {} is outside expected range 32-44", base58_address.len());

    // Decodes back to exactly 32 bytes
    let decoded = bs58::decode(&base58_address).into_vec().expect("should decode");
    assert_eq!(decoded.len(), 32);
}

#[test]
fn sign_and_verify_challenge_message() {
    let signing_key = test_signing_key(5);
    let verifying_key = signing_key.verifying_key();

    let server_name = "chat.example.com";
    let nonce = "abc123def456";
    let message = format!(
        "Sign in to {server_name}\n\nNonce: {nonce}\n\nThis signature will not trigger a blockchain transaction or cost any fees."
    );

    // Sign the message (this is what the wallet does)
    let signature = signing_key.sign(message.as_bytes());

    // Verify the signature (this is what the server does)
    assert!(verifying_key.verify(message.as_bytes(), &signature).is_ok());
}

#[test]
fn wrong_key_fails_verification() {
    let signing_key = test_signing_key(6);
    let wrong_key = test_signing_key(7);

    let message = "Sign in to chat.example.com\n\nNonce: test123\n\nThis signature will not trigger a blockchain transaction or cost any fees.";
    let signature = signing_key.sign(message.as_bytes());

    // Verification with wrong key must fail
    let wrong_verifying_key = wrong_key.verifying_key();
    assert!(wrong_verifying_key.verify(message.as_bytes(), &signature).is_err());
}

#[test]
fn tampered_message_fails_verification() {
    let signing_key = test_signing_key(8);
    let verifying_key = signing_key.verifying_key();

    let message = "Sign in to chat.example.com\n\nNonce: test123\n\nThis signature will not trigger a blockchain transaction or cost any fees.";
    let signature = signing_key.sign(message.as_bytes());

    // Tamper with the message
    let tampered = "Sign in to evil.example.com\n\nNonce: test123\n\nThis signature will not trigger a blockchain transaction or cost any fees.";
    assert!(verifying_key.verify(tampered.as_bytes(), &signature).is_err());
}

#[test]
fn different_nonce_fails_verification() {
    let signing_key = test_signing_key(9);
    let verifying_key = signing_key.verifying_key();

    let message = "Sign in to chat.example.com\n\nNonce: original_nonce\n\nThis signature will not trigger a blockchain transaction or cost any fees.";
    let signature = signing_key.sign(message.as_bytes());

    // Replay attack: verify against a different nonce
    let replayed = "Sign in to chat.example.com\n\nNonce: different_nonce\n\nThis signature will not trigger a blockchain transaction or cost any fees.";
    assert!(verifying_key.verify(replayed.as_bytes(), &signature).is_err());
}

#[test]
fn base58_signature_roundtrip() {
    let signing_key = test_signing_key(10);
    let message = b"test message";
    let signature = signing_key.sign(message);

    // Encode signature as base58 (what the client sends)
    let sig_base58 = bs58::encode(signature.to_bytes()).into_string();

    // Decode back (what the server does)
    let sig_bytes = bs58::decode(&sig_base58).into_vec().expect("should decode");
    assert_eq!(sig_bytes.len(), 64);

    let recovered_sig = Signature::from_bytes(
        &sig_bytes.try_into().expect("should be 64 bytes")
    );
    assert_eq!(recovered_sig, signature);
}

#[test]
fn invalid_base58_address_rejected() {
    // "0" is not in the base58 alphabet
    let result = bs58::decode("0InvalidAddress").into_vec();
    assert!(result.is_err());
}

#[test]
fn wrong_length_pubkey_rejected() {
    // Valid base58 but only 16 bytes, not 32
    let short_bytes = [42u8; 16];
    let short_address = bs58::encode(&short_bytes).into_string();
    let decoded = bs58::decode(&short_address).into_vec().expect("valid base58");
    assert_ne!(decoded.len(), 32, "should not be 32 bytes");

    // Trying to construct a VerifyingKey from wrong-length bytes should fail
    let result: std::result::Result<[u8; 32], _> = decoded.try_into();
    assert!(result.is_err());
}

#[test]
fn no_two_addresses_produce_same_hex_localpart() {
    // Generate many keypairs and ensure no hex collisions.
    // This is mathematically guaranteed for ed25519 (different keys = different bytes),
    // but worth verifying the encoding is bijective.
    let mut seen = std::collections::HashSet::new();
    for i in 0..100u8 {
        let signing_key = test_signing_key(i);
        let hex_localpart = hex::encode(signing_key.verifying_key().as_bytes());
        assert!(seen.insert(hex_localpart), "hex localpart collision detected");
    }
}

#[test]
fn full_auth_flow_simulation() {
    // Simulates the complete auth flow without a running server:
    // 1. Generate a keypair (represents the user's wallet)
    // 2. Server generates a nonce
    // 3. Client signs the challenge message
    // 4. Server verifies and derives the Matrix user ID

    // Step 1: User's wallet keypair
    let signing_key = test_signing_key(42);
    let verifying_key = signing_key.verifying_key();
    let base58_address = bs58::encode(verifying_key.as_bytes()).into_string();

    // Step 2: Server generates nonce and challenge message
    let server_name = "solchat.example.com";
    let nonce = hex::encode([0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89]);
    let challenge = format!(
        "Sign in to {server_name}\n\nNonce: {nonce}\n\nThis signature will not trigger a blockchain transaction or cost any fees."
    );

    // Step 3: Client signs the challenge
    let signature = signing_key.sign(challenge.as_bytes());
    let sig_base58 = bs58::encode(signature.to_bytes()).into_string();

    // Step 4: Server receives login request and verifies
    // Decode address
    let pubkey_bytes: [u8; 32] = bs58::decode(&base58_address)
        .into_vec()
        .expect("valid base58")
        .try_into()
        .expect("32 bytes");

    let server_verifying_key = VerifyingKey::from_bytes(&pubkey_bytes)
        .expect("valid ed25519 key");

    // Decode signature
    let server_sig_bytes: [u8; 64] = bs58::decode(&sig_base58)
        .into_vec()
        .expect("valid base58")
        .try_into()
        .expect("64 bytes");

    let server_signature = Signature::from_bytes(&server_sig_bytes);

    // Reconstruct the challenge message on the server side
    let server_challenge = format!(
        "Sign in to {server_name}\n\nNonce: {nonce}\n\nThis signature will not trigger a blockchain transaction or cost any fees."
    );

    // Verify
    assert!(server_verifying_key.verify(server_challenge.as_bytes(), &server_signature).is_ok());

    // Derive Matrix localpart
    let hex_localpart = hex::encode(pubkey_bytes);
    let expected_user_id = format!("@{hex_localpart}:{server_name}");

    assert_eq!(hex_localpart.len(), 64);
    assert!(expected_user_id.starts_with('@'));
    assert!(expected_user_id.contains(':'));

    // Display name would be the base58 address
    assert_eq!(base58_address, bs58::encode(pubkey_bytes).into_string());
}
