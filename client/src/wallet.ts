import { bytesToBase58, bytesToHex } from "./encoding";

/// Get the base58 address from a public key's raw bytes.
export function publicKeyToBase58(publicKey: Uint8Array): string {
  return bytesToBase58(publicKey);
}

/// Get the hex-encoded public key (used as Matrix localpart).
export function publicKeyToHex(publicKey: Uint8Array): string {
  return bytesToHex(publicKey);
}
