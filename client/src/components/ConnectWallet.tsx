interface ConnectWalletProps {
  onConnect: () => void;
}

export function ConnectWallet({ onConnect }: ConnectWalletProps) {
  return (
    <section className="connect-wallet">
      <h2>Welcome to Solana Chat</h2>
      <p>Connect your Solana wallet to start chatting. Your wallet address is your identity.</p>
      <button className="connect-button" onClick={onConnect}>
        Connect Wallet
      </button>
    </section>
  );
}
