const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/// Encode raw bytes to a base58 string.
export function bytesToBase58(bytes: Uint8Array): string {
  let num = BigInt(0);
  for (const byte of bytes) {
    num = num * 256n + BigInt(byte);
  }
  let encoded = "";
  while (num > 0n) {
    const remainder = num % 58n;
    num = num / 58n;
    encoded = BASE58_ALPHABET[Number(remainder)] + encoded;
  }
  // Preserve leading zero bytes as '1'
  for (const byte of bytes) {
    if (byte === 0) {
      encoded = "1" + encoded;
    } else {
      break;
    }
  }
  return encoded;
}

/// Decode a base58 string to raw bytes (fixed 32-byte output for Solana pubkeys).
export function base58ToBytes(base58: string): Uint8Array {
  let num = BigInt(0);
  for (const character of base58) {
    const index = BASE58_ALPHABET.indexOf(character);
    if (index === -1) throw new Error(`Invalid base58 character: ${character}`);
    num = num * 58n + BigInt(index);
  }
  const bytes = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(num & 0xffn);
    num = num >> 8n;
  }
  return bytes;
}

/// Encode raw bytes to a lowercase hex string.
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/// Decode a hex string to raw bytes.
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/// Convert a base58 Solana address to a hex-encoded Matrix localpart.
/// This is lossless — hex(raw_pubkey_bytes) gives exactly 64 lowercase
/// chars, which is a valid Matrix localpart.
export function base58ToHexLocalpart(base58Address: string): string {
  return bytesToHex(base58ToBytes(base58Address));
}

/// Convert a hex-encoded Matrix localpart back to a base58 Solana address.
export function hexLocalpartToBase58(hexLocalpart: string): string {
  return bytesToBase58(hexToBytes(hexLocalpart));
}

/// Encode a string in Borsh format (4-byte LE length prefix + UTF-8 bytes).
export function borshEncodeString(value: string): Uint8Array {
  const stringBytes = new TextEncoder().encode(value);
  const result = new Uint8Array(4 + stringBytes.length);
  new DataView(result.buffer).setUint32(0, stringBytes.length, true);
  result.set(stringBytes, 4);
  return result;
}

/// Decode a Borsh-encoded string from a buffer at a given offset.
/// Returns the string and the number of bytes consumed.
export function borshDecodeString(data: Uint8Array, offset: number): [string, number] {
  const length = new DataView(data.buffer).getUint32(offset, true);
  const stringBytes = data.subarray(offset + 4, offset + 4 + length);
  return [new TextDecoder().decode(stringBytes), 4 + length];
}

/// Build the Matrix user ID from a Solana wallet address and homeserver domain.
export function walletToMatrixUserId(base58Address: string, homeserverDomain: string): string {
  return `@${base58ToHexLocalpart(base58Address)}:${homeserverDomain}`;
}
