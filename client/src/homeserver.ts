import type { MessageModifyingSigner, TransactionModifyingSigner } from "@solana/kit";
import type { NonceResponse } from "./types";
import { connect } from "solana-kite";
import { registerHomeserverOnchain as registerOnchain } from "./program";

/// Request a nonce challenge from the homeserver.
async function fetchNonce(homeserverUrl: string, walletAddress: string): Promise<NonceResponse> {
  const response = await fetch(`${homeserverUrl}/_solana/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: walletAddress }),
  });
  if (!response.ok) {
    throw new Error(`Failed to get nonce: ${response.statusText}`);
  }
  return response.json();
}

/// Log in to the homeserver using Solana wallet signature.
/// Uses Kite's signMessageFromWalletApp via the Connection object to get the
/// wallet to sign the nonce challenge off-chain.
/// Returns the Matrix access token and user ID.
export async function loginToHomeserver(
  homeserverUrl: string,
  walletAddress: string,
  messageSigner: MessageModifyingSigner,
  rpcUrl: string = "https://api.devnet.solana.com"
): Promise<{ accessToken: string; userId: string; deviceId: string }> {
  // Step 1: Get a nonce challenge from the server
  const { nonce, message } = await fetchNonce(homeserverUrl, walletAddress);

  // Step 2: Sign the challenge message using the wallet via Kite
  const connection = connect(rpcUrl);
  const signatureBase58 = await connection.signMessageFromWalletApp(message, messageSigner);

  // Step 3: Send the signed challenge to the Matrix login endpoint
  const loginResponse = await fetch(`${homeserverUrl}/_matrix/client/v3/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "m.login.solana.signature",
      address: walletAddress,
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

/// Register a homeserver delegation onchain using Kite + Kit TransactionModifyingSigner.
export async function registerHomeserverOnchain(
  transactionSigner: TransactionModifyingSigner,
  homeserver: string,
  rpcUrl: string = "https://api.devnet.solana.com"
): Promise<string> {
  return registerOnchain(transactionSigner, homeserver, rpcUrl);
}
