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
  getCompiledTransactionMessageEncoder,
  pipe,
  type Address,
  type Instruction,
} from "@solana/kit";
import type { SolanaWallet } from "./types";
import { base58ToBytes, borshEncodeString, borshDecodeString } from "./encoding";

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
    base58ToBytes(ownerAddress),
  ];
  const [pda, bump] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds });
  return [pda, bump];
}

/// Encode the `register` instruction data: Anchor discriminator + borsh string.
function encodeRegisterData(homeserver: string): Uint8Array {
  const borshString = borshEncodeString(homeserver);
  const data = new Uint8Array(REGISTER_DISCRIMINATOR.length + borshString.length);
  data.set(REGISTER_DISCRIMINATOR, 0);
  data.set(borshString, REGISTER_DISCRIMINATOR.length);
  return data;
}

/// Register a homeserver delegation onchain.
/// Builds the transaction message, serializes it, and hands it to the wallet
/// to sign and send in one step.
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

  // Serialize the compiled transaction to wire format.
  // The wallet will add its signature and submit to the network.
  const messageBytes = new Uint8Array(compiledTransaction.messageBytes);
  const signatureKeys = Object.keys(compiledTransaction.signatures);
  const signatureCount = signatureKeys.length;
  // Wire format: compact-u16(sig count) + empty 64-byte sig slots + message bytes
  const serialized = new Uint8Array(1 + signatureCount * 64 + messageBytes.length);
  serialized[0] = signatureCount;
  // Leave signature slots zeroed — the wallet fills them
  serialized.set(messageBytes, 1 + signatureCount * 64);

  const txSignature = await wallet.signAndSendTransaction(serialized);
  return txSignature;
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
  // 8 bytes Anchor discriminator + 32 bytes owner pubkey + borsh string (homeserver)
  const raw = accountInfo.value.data;
  const data = Uint8Array.from(atob(raw[0] as string), (character) => character.charCodeAt(0));
  const DISCRIMINATOR_LENGTH = 8;
  const PUBKEY_LENGTH = 32;
  const [homeserver] = borshDecodeString(data, DISCRIMINATOR_LENGTH + PUBKEY_LENGTH);

  return homeserver;
}
