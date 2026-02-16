import { StrictMode, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { SelectedWalletAccountContextProvider } from "@solana/react";
import { App } from "./App";
import "./styles.css";

const WALLET_STORAGE_KEY = "solana-chat:selected-wallet";

function Root() {
  const stateSync = {
    deleteSelectedWallet: useCallback(() => {
      localStorage.removeItem(WALLET_STORAGE_KEY);
    }, []),
    getSelectedWallet: useCallback(() => {
      return localStorage.getItem(WALLET_STORAGE_KEY);
    }, []),
    storeSelectedWallet: useCallback((accountKey: string) => {
      localStorage.setItem(WALLET_STORAGE_KEY, accountKey);
    }, []),
  };

  const filterWallets = useCallback(() => true, []);

  return (
    <SelectedWalletAccountContextProvider
      filterWallets={filterWallets}
      stateSync={stateSync}
    >
      <App />
    </SelectedWalletAccountContextProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
