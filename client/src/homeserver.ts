import type { SolanaWallet, NonceResponse } from "./types";
import { publicKeyToBase58 } from "./wallet";
import { registerHomeserverOnchain as registerOnchain } from "./program";

/// Request a nonce challenge from the homeserver.
async function fetchNonce(homeserverUrl: string, address: string): Promise<NonceResponse> {
  const response = await fetch(`${homeserverUrl}/_solana/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!response.ok) {
    throw new Error(`Failed to get nonce: ${response.statusText}`);
  }
  return response.json();
}

/// Base58-encode raw bytes. Used for the signature.
function bytesToBase58(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt(0);
  for (const byte of bytes) {
    num = num * 256n + BigInt(byte);
  }
  let encoded = "";
  while (num > 0n) {
    const remainder = num % 58n;
    num = num / 58n;
    encoded = ALPHABET[Number(remainder)] + encoded;
  }
  for (const byte of bytes) {
    if (byte === 0) {
      encoded = "1" + encoded;
    } else {
      break;
    }
  }
  return encoded;
}

/// Log in to the homeserver using Solana wallet signature.
/// Returns the Matrix access token and user ID.
export async function loginToHomeserver(
  homeserverUrl: string,
  wallet: SolanaWallet
): Promise<{ accessToken: string; userId: string; deviceId: string }> {
  const base58Address = publicKeyToBase58(wallet.publicKey);

  // Step 1: Get a nonce challenge from the server
  const { nonce, message } = await fetchNonce(homeserverUrl, base58Address);

  // Step 2: Sign the challenge message with the wallet
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = await wallet.signMessage(messageBytes);
  const signatureBase58 = bytesToBase58(signatureBytes);

  // Step 3: Send the signed challenge to the Matrix login endpoint
  const loginResponse = await fetch(`${homeserverUrl}/_matrix/client/v3/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "m.login.solana.signature",
      address: base58Address,
      signature: signatureBase58,
      nonce,
    }),
  });

  if (!loginResponse.ok) {
    const error = await loginResponse.json().catch(() => ({}));
    throw new Error(
      `Login failed: ${(error as Record<string, string>).error || loginResponse.statusText}`
    );
  }

  const data = await loginResponse.json();
  return {
    accessToken: data.access_token,
    userId: data.user_id,
    deviceId: data.device_id,
  };
}

/// Register a homeserver delegation onchain.
/// Calls the homeserver-registry Anchor program to create or update
/// the wallet's delegation PDA.
export async function registerHomeserverOnchain(
  wallet: SolanaWallet,
  homeserver: string
): Promise<string> {
  return registerOnchain(wallet, homeserver);
}
