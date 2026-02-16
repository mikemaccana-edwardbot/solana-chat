import { useState } from "react";
import { walletToMatrixUserId } from "../encoding";
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
      const walletAddresses = membersInput
        .split(/[,\n]/)
        .map((address) => address.trim())
        .filter(Boolean);

      const userIds = walletAddresses.map((address) =>
        walletToMatrixUserId(address, homeserverDomain)
      );

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
