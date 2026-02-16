import { useState } from "react";
import type { AppStage, SolanaWallet } from "./types";
import { ConnectWallet } from "./components/ConnectWallet";
import { PickHomeserver } from "./components/PickHomeserver";
import { StatusScreen } from "./components/StatusScreen";
import { Chat } from "./components/Chat";
import { connectWallet, publicKeyToBase58 } from "./wallet";
import { loginToHomeserver, registerHomeserverOnchain } from "./homeserver";
import { initMatrixClient, startSync } from "./matrix";

export function App() {
  const [stage, setStage] = useState<AppStage>("connect-wallet");
  const [wallet, setWallet] = useState<SolanaWallet | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [homeserverUrl, setHomeserverUrl] = useState("");

  async function handleConnect() {
    try {
      setError("");
      const connectedWallet = await connectWallet();
      setWallet(connectedWallet);
      setStage("pick-homeserver");
    } catch (thrownObject) {
      const error = thrownObject instanceof Error ? thrownObject : new Error(String(thrownObject));
      setError(error.message);
    }
  }

  async function handleHomeserverSelected(url: string) {
    if (!wallet) return;
    setHomeserverUrl(url);

    try {
      setError("");

      // Step 1: Register homeserver onchain
      setStage("registering");
      setStatusMessage("Registering homeserver onchain...");
      await registerHomeserverOnchain(wallet, url);

      // Step 2: Log in to the homeserver
      setStage("logging-in");
      setStatusMessage("Signing in to homeserver...");
      const { accessToken, userId } = await loginToHomeserver(url, wallet);

      // Step 3: Initialize Matrix client and sync
      setStatusMessage("Syncing...");
      initMatrixClient(url, accessToken, userId);
      await startSync();

      setStage("chat");
    } catch (thrownObject) {
      const error = thrownObject instanceof Error ? thrownObject : new Error(String(thrownObject));
      setError(error.message);
      setStage("pick-homeserver");
    }
  }

  const address = wallet ? publicKeyToBase58(wallet.publicKey) : "";

  return (
    <main className="app">
      <header className="app-header">
        <h1>Solana Chat</h1>
        {address && <span className="wallet-address" title={address}>{truncateAddress(address)}</span>}
      </header>

      {error && (
        <section className="error-banner" role="alert">
          <p>{error}</p>
          <button onClick={() => setError("")}>Dismiss</button>
        </section>
      )}

      {stage === "connect-wallet" && (
        <ConnectWallet onConnect={handleConnect} />
      )}

      {stage === "pick-homeserver" && (
        <PickHomeserver onSelect={handleHomeserverSelected} />
      )}

      {(stage === "registering" || stage === "logging-in") && (
        <StatusScreen message={statusMessage} />
      )}

      {stage === "chat" && (
        <Chat homeserverUrl={homeserverUrl} />
      )}
    </main>
  );
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
