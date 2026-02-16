import { useState, useEffect } from "react";
import { lookupHomeserver } from "../program";

interface PickHomeserverProps {
  walletAddress: string;
  onSelect: (url: string) => void;
}

const DEFAULT_HOMESERVERS = [
  { name: "Solana Chat (default)", url: "https://chat.solana.example" },
];

export function PickHomeserver({ walletAddress, onSelect }: PickHomeserverProps) {
  const [customUrl, setCustomUrl] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [existingHomeserver, setExistingHomeserver] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing onchain delegation when component mounts
  useEffect(() => {
    async function checkExisting() {
      try {
        const homeserver = await lookupHomeserver(walletAddress);
        setExistingHomeserver(homeserver);
      } catch {
        // No delegation found or RPC error — that's fine
      }
      setLoading(false);
    }
    checkExisting();
  }, [walletAddress]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (useCustom && customUrl.trim()) {
      onSelect(customUrl.trim());
    } else if (existingHomeserver && !useCustom) {
      onSelect(existingHomeserver);
    } else if (DEFAULT_HOMESERVERS.length > 0) {
      onSelect(DEFAULT_HOMESERVERS[0].url);
    }
  }

  if (loading) {
    return (
      <section className="pick-homeserver">
        <p className="status-message">Checking for existing registration...</p>
      </section>
    );
  }

  return (
    <section className="pick-homeserver">
      <h2>Choose a homeserver</h2>
      <p>Your homeserver stores and relays your messages. You can switch at any time.</p>

      <form onSubmit={handleSubmit}>
        {existingHomeserver && (
          <label className="homeserver-option">
            <input
              type="radio"
              name="homeserver"
              checked={!useCustom}
              onChange={() => setUseCustom(false)}
            />
            <span>Current registration</span>
            <span className="homeserver-url">{existingHomeserver}</span>
          </label>
        )}

        {!existingHomeserver && DEFAULT_HOMESERVERS.map((server) => (
          <label key={server.url} className="homeserver-option">
            <input
              type="radio"
              name="homeserver"
              checked={!useCustom}
              onChange={() => setUseCustom(false)}
            />
            <span>{server.name}</span>
            <span className="homeserver-url">{server.url}</span>
          </label>
        ))}

        <label className="homeserver-option">
          <input
            type="radio"
            name="homeserver"
            checked={useCustom}
            onChange={() => setUseCustom(true)}
          />
          <span>{existingHomeserver ? "Switch homeserver" : "Custom homeserver"}</span>
        </label>

        {useCustom && (
          <input
            type="url"
            className="custom-url-input"
            placeholder="https://your-homeserver.com"
            value={customUrl}
            onChange={(event) => setCustomUrl(event.target.value)}
            autoFocus
          />
        )}

        <button type="submit" className="continue-button">
          {existingHomeserver && !useCustom ? "Sign in" : "Continue"}
        </button>
      </form>
    </section>
  );
}
