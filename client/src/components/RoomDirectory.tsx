import { useState } from "react";
import { getPublicRooms, joinRoom } from "../matrix";

interface RoomDirectoryProps {
  onRoomJoined: (roomId: string) => void;
}

interface PublicRoom {
  roomId: string;
  name: string;
  topic: string;
  memberCount: number;
  alias: string | null;
}

export function RoomDirectory({ onRoomJoined }: RoomDirectoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rooms, setRooms] = useState<Array<PublicRoom>>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleOpen() {
    setIsOpen(true);
    setLoading(true);
    setError("");
    try {
      const publicRooms = await getPublicRooms();
      setRooms(publicRooms);
    } catch (thrownObject) {
      const error = thrownObject instanceof Error ? thrownObject : new Error(String(thrownObject));
      setError(error.message);
    }
    setLoading(false);
  }

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const publicRooms = await getPublicRooms(searchTerm || undefined);
      setRooms(publicRooms);
    } catch (thrownObject) {
      const error = thrownObject instanceof Error ? thrownObject : new Error(String(thrownObject));
      setError(error.message);
    }
    setLoading(false);
  }

  async function handleJoin(roomId: string) {
    setJoining(roomId);
    setError("");
    try {
      const joinedRoomId = await joinRoom(roomId);
      setIsOpen(false);
      onRoomJoined(joinedRoomId);
    } catch (thrownObject) {
      const error = thrownObject instanceof Error ? thrownObject : new Error(String(thrownObject));
      setError(error.message);
    }
    setJoining(null);
  }

  if (!isOpen) {
    return (
      <button className="room-directory-toggle" onClick={handleOpen}>
        Browse Rooms
      </button>
    );
  }

  return (
    <section className="room-directory">
      <header className="room-directory-header">
        <h3>Public Rooms</h3>
        <button
          className="room-directory-close"
          onClick={() => setIsOpen(false)}
        >
          ✕
        </button>
      </header>

      <form className="room-directory-search" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="Search rooms..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "..." : "Search"}
        </button>
      </form>

      {error && <p className="room-directory-error">{error}</p>}

      <ol className="room-directory-list">
        {rooms.map((room) => (
          <li key={room.roomId} className="room-directory-item">
            <section className="room-directory-info">
              <span className="room-directory-name">{room.name}</span>
              {room.topic && (
                <span className="room-directory-topic">{room.topic}</span>
              )}
              <span className="room-directory-members">
                {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
              </span>
            </section>
            <button
              className="room-directory-join"
              onClick={() => handleJoin(room.roomId)}
              disabled={joining === room.roomId}
            >
              {joining === room.roomId ? "Joining..." : "Join"}
            </button>
          </li>
        ))}
        {rooms.length === 0 && !loading && (
          <li className="room-directory-empty">No public rooms found.</li>
        )}
      </ol>
    </section>
  );
}
