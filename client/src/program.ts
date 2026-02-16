import {
  address,
  type Address,
  type Instruction,
  type TransactionModifyingSigner,
} from "@solana/kit";
import { connect, getPDAAndBump } from "solana-kite";
import { borshEncodeString, borshDecodeString } from "./encoding";

/// The homeserver-registry program ID.
const PROGRAM_ID: Address = address("27JU28YBf5RJmEHAn9BwnWFyfPMLkUdSafKgz9xQB9zn");

/// The system program address.
const SYSTEM_PROGRAM: Address = address("11111111111111111111111111111111");

/// Anchor instruction discriminator for `register` (from IDL).
const REGISTER_DISCRIMINATOR = new Uint8Array([211, 124, 67, 15, 211, 194, 178, 240]);

/// Encode the `register` instruction data: Anchor discriminator + borsh string.
function encodeRegisterData(homeserver: string): Uint8Array {
  const borshString = borshEncodeString(homeserver);
  const data = new Uint8Array(REGISTER_DISCRIMINATOR.length + borshString.length);
  data.set(REGISTER_DISCRIMINATOR, 0);
  data.set(borshString, REGISTER_DISCRIMINATOR.length);
  return data;
}

/// Register a homeserver delegation onchain.
/// Uses Kite's getPDAAndBump for PDA derivation and
/// sendTransactionFromInstructionsWithWalletApp for the full send flow.
export async function registerHomeserverOnchain(
  transactionSigner: TransactionModifyingSigner,
  homeserver: string,
  rpcUrl: string = "https://api.devnet.solana.com"
): Promise<string> {
  const ownerAddress = transactionSigner.address;

  const { pda: delegationPda } = await getPDAAndBump(
    PROGRAM_ID,
    ["delegation", ownerAddress]
  );

  const instruction: Instruction = {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: delegationPda, role: 1 },   // writable, not signer
      { address: ownerAddress, role: 3 },     // writable + signer
      { address: SYSTEM_PROGRAM, role: 0 },   // readonly, not signer
    ],
    data: encodeRegisterData(homeserver),
  };

  const connection = connect(rpcUrl);
  const signature = await connection.sendTransactionFromInstructionsWithWalletApp({
    feePayer: transactionSigner,
    instructions: [instruction],
  });

  return String(signature);
}

/// Look up a wallet's homeserver delegation onchain.
/// Returns the homeserver URL, or null if no delegation exists.
export async function lookupHomeserver(
  walletAddress: string,
  rpcUrl: string = "https://api.devnet.solana.com"
): Promise<string | null> {
  const ownerAddress = address(walletAddress);

  const { pda: delegationPda } = await getPDAAndBump(
    PROGRAM_ID,
    ["delegation", ownerAddress]
  );

  const connection = connect(rpcUrl);
  const accountInfo = await connection.rpc.getAccountInfo(delegationPda, {
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
