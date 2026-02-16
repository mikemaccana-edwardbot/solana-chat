import { useState, useMemo } from "react";
import { useWalletAccountTransactionSigner } from "@solana/react";
import { useWalletAccountMessageSigner } from "@solana/react";
import type { UiWalletAccount } from "@wallet-standard/ui";
import type { AppStage } from "./types";
import { ConnectWallet } from "./components/ConnectWallet";
import { PickHomeserver } from "./components/PickHomeserver";
import { StatusScreen } from "./components/StatusScreen";
import { Chat } from "./components/Chat";
import { loginToHomeserver, registerHomeserverOnchain } from "./homeserver";
import { initMatrixClient, startSync } from "./matrix";

export function App() {
  const [stage, setStage] = useState<AppStage>("connect-wallet");
  const [walletAccount, setWalletAccount] = useState<UiWalletAccount | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [homeserverUrl, setHomeserverUrl] = useState("");

  const walletAddress = walletAccount?.address ?? "";

  function handleWalletConnected(account: UiWalletAccount) {
    setWalletAccount(account);
    setStage("pick-homeserver");
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Solana Chat</h1>
        {walletAddress && (
          <span className="wallet-address" title={walletAddress}>
            {truncateAddress(walletAddress)}
          </span>
        )}
      </header>

      {error && (
        <section className="error-banner" role="alert">
          <p>{error}</p>
          <button onClick={() => setError("")}>Dismiss</button>
        </section>
      )}

      {stage === "connect-wallet" && (
        <ConnectWallet onConnected={handleWalletConnected} />
      )}

      {stage === "pick-homeserver" && walletAccount && (
        <HomeserverFlow
          walletAccount={walletAccount}
          walletAddress={walletAddress}
          onStageChange={setStage}
          onStatusChange={setStatusMessage}
          onError={setError}
          onHomeserverUrl={setHomeserverUrl}
        />
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

/// Handles the homeserver selection, onchain registration, and login.
/// Separated into its own component so @solana/react hooks have
/// a stable walletAccount reference.
function HomeserverFlow({
  walletAccount,
  walletAddress,
  onStageChange,
  onStatusChange,
  onError,
  onHomeserverUrl,
}: {
  walletAccount: UiWalletAccount;
  walletAddress: string;
  onStageChange: (stage: AppStage) => void;
  onStatusChange: (message: string) => void;
  onError: (error: string) => void;
  onHomeserverUrl: (url: string) => void;
}) {
  const transactionSigner = useWalletAccountTransactionSigner(walletAccount, "solana:devnet");
  const messageSigner = useWalletAccountMessageSigner(walletAccount);

  async function handleHomeserverSelected(url: string) {
    onHomeserverUrl(url);

    try {
      onError("");

      // Step 1: Register homeserver onchain
      onStageChange("registering");
      onStatusChange("Registering homeserver onchain...");
      await registerHomeserverOnchain(transactionSigner, url);

      // Step 2: Log in to the homeserver
      onStageChange("logging-in");
      onStatusChange("Signing in to homeserver...");
      const { accessToken, userId } = await loginToHomeserver(url, walletAddress, messageSigner);

      // Step 3: Initialize Matrix client and sync
      onStatusChange("Syncing...");
      initMatrixClient(url, accessToken, userId);
      await startSync();

      onStageChange("chat");
    } catch (thrownObject) {
      const error = thrownObject instanceof Error ? thrownObject : new Error(String(thrownObject));
      onError(error.message);
      onStageChange("pick-homeserver");
    }
  }

  return <PickHomeserver onSelect={handleHomeserverSelected} />;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
