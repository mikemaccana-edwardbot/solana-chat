import { useSelectedWalletAccount } from "@solana/react";
import type { UiWalletAccount } from "@wallet-standard/ui";

interface ConnectWalletProps {
  onConnected: (account: UiWalletAccount) => void;
}

export function ConnectWallet({ onConnected }: ConnectWalletProps) {
  const [selectedAccount, setSelectedAccount, wallets] = useSelectedWalletAccount();

  // If account is already selected, notify parent
  if (selectedAccount) {
    onConnected(selectedAccount);
    return null;
  }

  if (wallets.length === 0) {
    return (
      <section className="connect-wallet">
        <h2>Welcome to Solana Chat</h2>
        <p>No Solana wallet found. Install Phantom, Solflare, or another Solana wallet to continue.</p>
      </section>
    );
  }

  return (
    <section className="connect-wallet">
      <h2>Welcome to Solana Chat</h2>
      <p>Connect your Solana wallet to start chatting. Your wallet address is your identity.</p>
      {wallets.map((wallet) => (
        <button
          key={wallet.name}
          className="connect-button"
          onClick={() => {
            const account = wallet.accounts[0];
            if (account) {
              setSelectedAccount(account);
            }
          }}
        >
          Connect {wallet.name}
        </button>
      ))}
    </section>
  );
}
