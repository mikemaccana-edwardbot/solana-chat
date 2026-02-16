import { useState } from "react";

interface PickHomeserverProps {
  onSelect: (url: string) => void;
}

const DEFAULT_HOMESERVERS = [
  { name: "Solana Chat (default)", url: "https://chat.solana.example" },
];

export function PickHomeserver({ onSelect }: PickHomeserverProps) {
  const [customUrl, setCustomUrl] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (useCustom && customUrl.trim()) {
      onSelect(customUrl.trim());
    } else if (DEFAULT_HOMESERVERS.length > 0) {
      onSelect(DEFAULT_HOMESERVERS[0].url);
    }
  }

  return (
    <section className="pick-homeserver">
      <h2>Choose a homeserver</h2>
      <p>Your homeserver stores and relays your messages. You can switch at any time.</p>

      <form onSubmit={handleSubmit}>
        {DEFAULT_HOMESERVERS.map((server) => (
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
          <span>Custom homeserver</span>
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
          Continue
        </button>
      </form>
    </section>
  );
}
