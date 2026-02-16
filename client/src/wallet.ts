import type { SolanaWallet } from "./types";

/// Connect to a Solana wallet via the Wallet Standard.
/// Tries the injected provider (Phantom, Solflare, Backpack, etc.)
export async function connectWallet(): Promise<SolanaWallet> {
  const provider = getWalletProvider();
  if (!provider) {
    throw new Error(
      "No Solana wallet found. Install Phantom, Solflare, or another Solana wallet."
    );
  }

  const response = await provider.connect();
  const publicKey = response.publicKey.toBytes();

  return {
    publicKey,
    signMessage: async (message: Uint8Array) => {
      const { signature } = await provider.signMessage(message, "utf8");
      return new Uint8Array(signature);
    },
    signTransaction: async (transaction: Uint8Array) => {
      // Phantom/Solflare expect a transaction object with serialize/deserialize.
      // We pass the raw bytes and get back a signed transaction.
      const { signature } = await provider.request({
        method: "signTransaction",
        params: { message: Buffer.from(transaction).toString("base64") },
      });
      return new Uint8Array(Buffer.from(signature, "base64"));
    },
  };
}

/// Get the base58 address from a public key's raw bytes.
export function publicKeyToBase58(publicKey: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt(0);
  for (const byte of publicKey) {
    num = num * 256n + BigInt(byte);
  }
  let encoded = "";
  while (num > 0n) {
    const remainder = num % 58n;
    num = num / 58n;
    encoded = ALPHABET[Number(remainder)] + encoded;
  }
  // Preserve leading zeros
  for (const byte of publicKey) {
    if (byte === 0) {
      encoded = "1" + encoded;
    } else {
      break;
    }
  }
  return encoded;
}

/// Get the hex-encoded public key (used as Matrix localpart).
export function publicKeyToHex(publicKey: Uint8Array): string {
  return Array.from(publicKey)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getWalletProvider(): any {
  // Phantom
  if ("phantom" in window) {
    const phantom = (window as Record<string, unknown>).phantom as Record<string, unknown>;
    if (phantom?.solana) {
      return phantom.solana;
    }
  }
  // Generic solana provider
  if ("solana" in window) {
    return (window as Record<string, unknown>).solana;
  }
  return null;
}
