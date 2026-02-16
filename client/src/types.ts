/// The stages of the login flow.
export type AppStage =
  | "connect-wallet"
  | "pick-homeserver"
  | "registering"
  | "logging-in"
  | "chat";

/// A connected Solana wallet exposing the methods we need.
export interface SolanaWallet {
  publicKey: Uint8Array;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  signAndSendTransaction(transaction: Uint8Array): Promise<string>;
}

/// Challenge response from the homeserver's nonce endpoint.
export interface NonceResponse {
  nonce: string;
  message: string;
  expires_in_seconds: number;
}

/// A Matrix room with the fields we display.
export interface ChatRoom {
  roomId: string;
  name: string;
  lastMessage?: string;
}

/// A single chat message.
export interface ChatMessage {
  eventId: string;
  sender: string;
  body: string;
  timestamp: number;
}
