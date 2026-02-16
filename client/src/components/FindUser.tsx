import { useState } from "react";
import { publicKeyToHex } from "../wallet";
import { startDirectMessage, getDisplayName } from "../matrix";

interface FindUserProps {
  homeserverDomain: string;
  onRoomCreated: (roomId: string) => void;
}

/// Look up a user by their Solana wallet address and start a DM.
/// The wallet address (base58) is decoded to raw bytes, then hex-encoded
/// to form the Matrix localpart. Matrix user ID is @<hex>:<server>.
export function FindUser({ homeserverDomain, onRoomCreated }: FindUserProps) {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<"idle" | "searching" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) return;

    setStatus("searching");
    setErrorMessage("");

    try {
      const hexLocalpart = base58ToHexLocalpart(trimmed);
      const userId = `@${hexLocalpart}:${homeserverDomain}`;

      // Verify the user exists by fetching their profile
      const displayName = await getDisplayName(userId);
      if (displayName === userId) {
        // getDisplayName returns the userId when profile doesn't exist —
        // the user may not have registered yet
        setStatus("error");
        setErrorMessage("No account found for this wallet address.");
        return;
      }

      // Create or find existing DM room
      const roomId = await startDirectMessage(userId);
      setAddress("");
      setStatus("idle");
      onRoomCreated(roomId);
    } catch (thrownObject) {
      const error = thrownObject instanceof Error ? thrownObject : new Error(String(thrownObject));
      setStatus("error");
      setErrorMessage(error.message);
    }
  }

  return (
    <form className="find-user" onSubmit={handleSearch}>
      <input
        type="text"
        className="find-user-input"
        placeholder="Wallet address..."
        value={address}
        onChange={(event) => setAddress(event.target.value)}
      />
      <button
        type="submit"
        className="find-user-button"
        disabled={!address.trim() || status === "searching"}
      >
        {status === "searching" ? "..." : "Chat"}
      </button>
      {status === "error" && (
        <p className="find-user-error">{errorMessage}</p>
      )}
    </form>
  );
}

/// Decode a base58 Solana address to raw bytes, then hex-encode for Matrix localpart.
function base58ToHexLocalpart(base58Address: string): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt(0);
  for (const character of base58Address) {
    const index = ALPHABET.indexOf(character);
    if (index === -1) throw new Error(`Invalid base58 character: ${character}`);
    num = num * 58n + BigInt(index);
  }

  // Convert to 32 bytes (Solana public keys are always 32 bytes)
  const bytes = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(num & 0xffn);
    num = num >> 8n;
  }

  return publicKeyToHex(bytes);
}
