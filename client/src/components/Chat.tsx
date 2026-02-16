import { useState, useEffect, useRef } from "react";
import type { ChatRoom, ChatMessage } from "../types";
import {
  getJoinedRooms,
  getRoomMessages,
  sendMessage,
  onNewMessage,
  getDisplayName,
} from "../matrix";
import { FindUser } from "./FindUser";
import { CreateGroup } from "./CreateGroup";
import { RoomDirectory } from "./RoomDirectory";
import { hexLocalpartToBase58 } from "../encoding";

interface ChatProps {
  homeserverUrl: string;
}

/// Extract the domain from a homeserver URL (e.g. "https://chat.example.com" → "chat.example.com")
function homeserverDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function Chat({ homeserverUrl }: ChatProps) {
  const [rooms, setRooms] = useState<Array<ChatRoom>>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<ChatMessage>>([]);
  const [draft, setDraft] = useState("");
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load rooms on mount
  useEffect(() => {
    const joinedRooms = getJoinedRooms();
    setRooms(joinedRooms);
    if (joinedRooms.length > 0) {
      setActiveRoomId(joinedRooms[0].roomId);
    }
  }, []);

  // Load messages when active room changes
  useEffect(() => {
    if (!activeRoomId) return;
    const roomMessages = getRoomMessages(activeRoomId);
    setMessages(roomMessages);

    // Resolve display names for senders
    const uniqueSenders = [...new Set(roomMessages.map((message) => message.sender))];
    uniqueSenders.forEach(async (sender) => {
      if (!displayNames[sender]) {
        const name = await getDisplayName(sender);
        setDisplayNames((previous) => ({ ...previous, [sender]: name }));
      }
    });
  }, [activeRoomId]);

  // Listen for new messages
  useEffect(() => {
    onNewMessage((roomId, message) => {
      if (roomId === activeRoomId) {
        setMessages((previous) => [...previous, message]);
      }
      // Update room list with latest message
      setRooms((previousRooms) =>
        previousRooms.map((room) =>
          room.roomId === roomId ? { ...room, lastMessage: message.body } : room
        )
      );
    });
  }, [activeRoomId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!activeRoomId || !draft.trim()) return;

    await sendMessage(activeRoomId, draft.trim());
    setDraft("");
  }

  return (
    <section className="chat">
      <nav className="room-list">
        <FindUser
          homeserverDomain={homeserverDomain(homeserverUrl)}
          onRoomCreated={(roomId) => {
            setRooms(getJoinedRooms());
            setActiveRoomId(roomId);
          }}
        />
        <CreateGroup
          homeserverDomain={homeserverDomain(homeserverUrl)}
          onRoomCreated={(roomId) => {
            setRooms(getJoinedRooms());
            setActiveRoomId(roomId);
          }}
        />
        <h3>Rooms</h3>
        {rooms.map((room) => (
          <button
            key={room.roomId}
            className={`room-item ${room.roomId === activeRoomId ? "active" : ""}`}
            onClick={() => setActiveRoomId(room.roomId)}
          >
            <span className="room-name">{room.name}</span>
            {room.lastMessage && (
              <span className="room-preview">{room.lastMessage}</span>
            )}
          </button>
        ))}
        <RoomDirectory
          onRoomJoined={(roomId) => {
            setRooms(getJoinedRooms());
            setActiveRoomId(roomId);
          }}
        />
      </nav>

      <article className="message-area">
        {activeRoomId ? (
          <>
            <ol className="message-list">
              {messages.map((message) => (
                <li key={message.eventId} className="message">
                  <span
                    className="message-sender"
                    title={displayNames[message.sender] || message.sender}
                  >
                    {formatSender(message.sender, displayNames[message.sender])}
                  </span>
                  <span className="message-body">{message.body}</span>
                  <time className="message-time">
                    {formatTime(message.timestamp)}
                  </time>
                </li>
              ))}
              <div ref={messagesEndRef} />
            </ol>

            <form className="message-input" onSubmit={handleSend}>
              <input
                type="text"
                placeholder="Type a message..."
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                autoFocus
              />
              <button type="submit" disabled={!draft.trim()}>
                Send
              </button>
            </form>
          </>
        ) : (
          <p className="no-room-selected">Select a room to start chatting</p>
        )}
      </article>
    </section>
  );
}

/// Format a sender for display. If we have a display name (base58 address set by
/// the server), truncate it. If not, try to extract the hex localpart from the
/// Matrix user ID and convert it back to a truncated base58 address.
function formatSender(userId: string, displayName: string | undefined): string {
  if (displayName && displayName !== userId) {
    return truncateAddress(displayName);
  }
  // Try to extract Solana hex localpart from @solana_hexhexhex:server
  const match = userId.match(/^@(solana_[0-9a-f]{64}):/);
  if (match) {
    const base58 = hexLocalpartToBase58(match[1]);
    return truncateAddress(base58);
  }
  return userId;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
