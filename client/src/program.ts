import {
  address,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  getProgramDerivedAddress,
  getAddressFromPublicKey,
  createSolanaRpcFromTransport,
  createDefaultRpcTransport,
  pipe,
  type Address,
  type Instruction,
} from "@solana/kit";
import type { SolanaWallet } from "./types";

/// The homeserver-registry program ID.
const PROGRAM_ID: Address = address("27JU28YBf5RJmEHAn9BwnWFyfPMLkUdSafKgz9xQB9zn");

/// The system program address.
const SYSTEM_PROGRAM: Address = address("11111111111111111111111111111111");

/// Anchor instruction discriminator for `register` (from IDL).
const REGISTER_DISCRIMINATOR = new Uint8Array([211, 124, 67, 15, 211, 194, 178, 240]);

/// Derive the delegation PDA for a wallet address.
async function deriveDelegationPda(ownerAddress: Address): Promise<[Address, number]> {
  const seeds = [
    new TextEncoder().encode("delegation"),
    decodeBase58Address(ownerAddress),
  ];
  const [pda, bump] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds });
  return [pda, bump];
}

/// Encode the `register` instruction data: Anchor discriminator + borsh string.
function encodeRegisterData(homeserver: string): Uint8Array {
  const homeserverBytes = new TextEncoder().encode(homeserver);
  // Borsh string: 4-byte LE length prefix + UTF-8 bytes
  const data = new Uint8Array(REGISTER_DISCRIMINATOR.length + 4 + homeserverBytes.length);
  data.set(REGISTER_DISCRIMINATOR, 0);
  const lengthOffset = REGISTER_DISCRIMINATOR.length;
  new DataView(data.buffer).setUint32(lengthOffset, homeserverBytes.length, true);
  data.set(homeserverBytes, lengthOffset + 4);
  return data;
}

/// Decode a base58 address to raw 32 bytes.
function decodeBase58Address(base58: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt(0);
  for (const character of base58) {
    const index = ALPHABET.indexOf(character);
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

/// Serialize a compiled transaction to the Solana wire format.
/// Format: compact-u16 signature count + 64-byte signatures + message bytes.
function serializeTransaction(compiledTransaction: {
  messageBytes: ReadonlyUint8Array;
  signatures: ReadonlyArray<ReadonlyUint8Array | null>;
}): Uint8Array {
  const signatureCount = compiledTransaction.signatures.length;
  const totalLength = 1 + signatureCount * 64 + compiledTransaction.messageBytes.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  // Compact-u16: for small counts (<128), it's a single byte
  result[offset] = signatureCount;
  offset += 1;
  for (const signature of compiledTransaction.signatures) {
    if (signature) {
      result.set(signature, offset);
    }
    // Leave zeros for null signatures (to be filled by wallet)
    offset += 64;
  }
  result.set(compiledTransaction.messageBytes, offset);
  return result;
}

/// Register a homeserver delegation onchain.
/// Builds the transaction, has the wallet sign and send it, returns the signature.
export async function registerHomeserverOnchain(
  wallet: SolanaWallet,
  homeserver: string,
  rpcUrl: string = "https://api.devnet.solana.com"
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    wallet.publicKey.buffer as ArrayBuffer,
    { name: "Ed25519" },
    true,
    ["verify"]
  );
  const ownerAddress = await getAddressFromPublicKey(cryptoKey);
  const [delegationPda] = await deriveDelegationPda(ownerAddress);

  const instruction: Instruction = {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: delegationPda, role: 1 },   // writable, not signer
      { address: ownerAddress, role: 3 },     // writable + signer
      { address: SYSTEM_PROGRAM, role: 0 },   // readonly, not signer
    ],
    data: encodeRegisterData(homeserver),
  };

  const transport = createDefaultRpcTransport({ url: rpcUrl });
  const rpc = createSolanaRpcFromTransport(transport);
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (message) => setTransactionMessageFeePayer(ownerAddress, message),
    (message) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message),
    (message) => appendTransactionMessageInstruction(instruction, message),
  );

  const compiledTransaction = compileTransaction(transactionMessage);

  // Serialize the unsigned transaction for the wallet to sign
  const unsignedBytes = serializeTransaction({
    messageBytes: compiledTransaction.messageBytes,
    signatures: [null], // one signer (owner), placeholder for wallet to fill
  });

  // Use the wallet provider to sign and send
  const signedBytes = await wallet.signTransaction(unsignedBytes);

  // Send the signed transaction via RPC
  const base64Encoded = btoa(String.fromCharCode(...signedBytes));
  const txSignature = await rpc.sendTransaction(base64Encoded as never, {
    encoding: "base64" as never,
  }).send();

  return String(txSignature);
}

/// Look up a wallet's homeserver delegation onchain.
/// Returns the homeserver URL, or null if no delegation exists.
export async function lookupHomeserver(
  walletAddress: string,
  rpcUrl: string = "https://api.devnet.solana.com"
): Promise<string | null> {
  const ownerAddress = address(walletAddress);
  const [delegationPda] = await deriveDelegationPda(ownerAddress);

  const transport = createDefaultRpcTransport({ url: rpcUrl });
  const rpc = createSolanaRpcFromTransport(transport);

  const accountInfo = await rpc.getAccountInfo(delegationPda, {
    encoding: "base64" as never,
  }).send();

  if (!accountInfo.value) return null;

  // Decode account data:
  // 8 bytes Anchor discriminator + 32 bytes owner pubkey + 4 bytes string length + string
  const raw = accountInfo.value.data;
  const data = Uint8Array.from(atob(raw[0] as string), (character) => character.charCodeAt(0));
  const DISCRIMINATOR_LENGTH = 8;
  const PUBKEY_LENGTH = 32;
  const offset = DISCRIMINATOR_LENGTH + PUBKEY_LENGTH;
  const stringLength = new DataView(data.buffer).getUint32(offset, true);
  const decoder = new TextDecoder();
  const homeserver = decoder.decode(data.subarray(offset + 4, offset + 4 + stringLength));

  return homeserver;
}

/// ReadonlyUint8Array type for compatibility with Kit's branded types.
type ReadonlyUint8Array = {
  readonly length: number;
  readonly [index: number]: number;
  [Symbol.iterator](): IterableIterator<number>;
};
