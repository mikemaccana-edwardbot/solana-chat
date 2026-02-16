import { useState } from "react";
import { createGroupChat } from "../matrix";

interface CreateGroupProps {
  homeserverDomain: string;
  onRoomCreated: (roomId: string) => void;
}

/// Create a group chat by entering a name and wallet addresses of members.
export function CreateGroup({ homeserverDomain, onRoomCreated }: CreateGroupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [membersInput, setMembersInput] = useState("");
  const [status, setStatus] = useState<"idle" | "creating" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!groupName.trim()) return;

    setStatus("creating");
    setErrorMessage("");

    try {
      // Parse wallet addresses, convert to Matrix user IDs
      const walletAddresses = membersInput
        .split(/[,\n]/)
        .map((address) => address.trim())
        .filter(Boolean);

      const userIds = walletAddresses.map((address) => {
        const hexLocalpart = base58ToHex(address);
        return `@${hexLocalpart}:${homeserverDomain}`;
      });

      const roomId = await createGroupChat(groupName.trim(), userIds);

      setGroupName("");
      setMembersInput("");
      setIsOpen(false);
      setStatus("idle");
      onRoomCreated(roomId);
    } catch (thrownObject) {
      const error = thrownObject instanceof Error ? thrownObject : new Error(String(thrownObject));
      setStatus("error");
      setErrorMessage(error.message);
    }
  }

  if (!isOpen) {
    return (
      <button className="create-group-toggle" onClick={() => setIsOpen(true)}>
        + New Group
      </button>
    );
  }

  return (
    <form className="create-group" onSubmit={handleCreate}>
      <input
        type="text"
        className="create-group-name"
        placeholder="Group name"
        value={groupName}
        onChange={(event) => setGroupName(event.target.value)}
        autoFocus
      />
      <textarea
        className="create-group-members"
        placeholder="Wallet addresses (one per line or comma-separated)"
        value={membersInput}
        onChange={(event) => setMembersInput(event.target.value)}
        rows={3}
      />
      <section className="create-group-actions">
        <button
          type="submit"
          className="create-group-submit"
          disabled={!groupName.trim() || status === "creating"}
        >
          {status === "creating" ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          className="create-group-cancel"
          onClick={() => {
            setIsOpen(false);
            setStatus("idle");
            setErrorMessage("");
          }}
        >
          Cancel
        </button>
      </section>
      {status === "error" && (
        <p className="create-group-error">{errorMessage}</p>
      )}
    </form>
  );
}

/// Decode a base58 Solana address to hex for Matrix localpart.
function base58ToHex(base58Address: string): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt(0);
  for (const character of base58Address) {
    const index = ALPHABET.indexOf(character);
    if (index === -1) throw new Error(`Invalid base58 character: ${character}`);
    num = num * 58n + BigInt(index);
  }
  const bytes = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(num & 0xffn);
    num = num >> 8n;
  }
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
