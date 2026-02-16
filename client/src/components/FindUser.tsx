import { useState } from "react";
import { base58ToHexLocalpart } from "../encoding";
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
