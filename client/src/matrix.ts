import * as sdk from "matrix-js-sdk";
import type { ChatRoom, ChatMessage } from "./types";

let client: sdk.MatrixClient | null = null;

/// Initialize the Matrix client with an access token from Solana auth.
export function initMatrixClient(
  homeserverUrl: string,
  accessToken: string,
  userId: string
): sdk.MatrixClient {
  client = sdk.createClient({
    baseUrl: homeserverUrl,
    accessToken,
    userId,
  });
  return client;
}

/// Start syncing with the homeserver. Call after initMatrixClient.
export async function startSync(): Promise<void> {
  if (!client) throw new Error("Matrix client not initialized");
  await client.startClient({ initialSyncLimit: 20 });

  // Wait for the first sync to complete
  return new Promise((resolve) => {
    client!.once(sdk.ClientEvent.Sync, (state) => {
      if (state === "PREPARED") {
        resolve();
      }
    });
  });
}

/// Get the list of joined rooms.
export function getJoinedRooms(): Array<ChatRoom> {
  if (!client) return [];

  return client.getRooms()
    .filter((room) => room.getMyMembership() === "join")
    .map((room) => {
      const timeline = room.getLiveTimeline().getEvents();
      const lastEvent = timeline[timeline.length - 1];
      const lastMessage =
        lastEvent?.getType() === "m.room.message"
          ? (lastEvent.getContent().body as string)
          : undefined;

      return {
        roomId: room.roomId,
        name: room.name || room.roomId,
        lastMessage,
      };
    });
}

/// Get messages for a room.
export function getRoomMessages(roomId: string): Array<ChatMessage> {
  if (!client) return [];

  const room = client.getRoom(roomId);
  if (!room) return [];

  return room
    .getLiveTimeline()
    .getEvents()
    .filter((event) => event.getType() === "m.room.message")
    .map((event) => ({
      eventId: event.getId() || "",
      sender: event.getSender() || "",
      body: (event.getContent().body as string) || "",
      timestamp: event.getTs(),
    }));
}

/// Send a text message to a room.
export async function sendMessage(roomId: string, body: string): Promise<void> {
  if (!client) throw new Error("Matrix client not initialized");
  await client.sendTextMessage(roomId, body);
}

/// Join a room by ID or alias.
export async function joinRoom(roomIdOrAlias: string): Promise<string> {
  if (!client) throw new Error("Matrix client not initialized");
  const result = await client.joinRoom(roomIdOrAlias);
  return result.roomId;
}

/// Listen for new messages in real time.
export function onNewMessage(
  callback: (roomId: string, message: ChatMessage) => void
): void {
  if (!client) return;

  client.on(sdk.RoomEvent.Timeline, (event, room) => {
    if (event.getType() !== "m.room.message") return;
    if (!room) return;

    callback(room.roomId, {
      eventId: event.getId() || "",
      sender: event.getSender() || "",
      body: (event.getContent().body as string) || "",
      timestamp: event.getTs(),
    });
  });
}

/// Get a user's display name (base58 address or .sol name).
export async function getDisplayName(userId: string): Promise<string> {
  if (!client) return userId;
  try {
    const profile = await client.getProfileInfo(userId, "displayname");
    return (profile.displayname as string) || userId;
  } catch {
    return userId;
  }
}

/// Stop the client and clean up.
export function stopClient(): void {
  if (client) {
    client.stopClient();
    client = null;
  }
}
