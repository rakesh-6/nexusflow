import { io, type Socket } from "socket.io-client";

// One live connection per browser tab (PRD §11.8). Pages ask for the rooms they
// show (an organization, a workspace, a project, a task); a room is joined
// while at least one component wants it, and every room is joined again
// automatically after the connection drops and comes back.

export type RoomType = "org" | "workspace" | "project" | "task";

let socket: Socket | null = null;
const wanted = new Map<string, number>();

function sendJoin(key: string) {
  const [type, id] = key.split(":");
  socket?.emit("room:join", { type, id });
}

/** The tab's connection, opened the first time something needs it. */
export function realtimeSocket(): Socket {
  if (socket) return socket;
  socket = io({
    path: "/socket.io",
    withCredentials: true,
    transports: ["websocket", "polling"],
  });
  socket.on("connect", () => {
    for (const key of wanted.keys()) sendJoin(key);
  });
  return socket;
}

/** Joins a room; the returned function leaves it again. */
export function joinRoom(type: RoomType, id: string): () => void {
  const key = `${type}:${id}`;
  const current = realtimeSocket();
  const count = wanted.get(key) ?? 0;
  wanted.set(key, count + 1);
  if (count === 0 && current.connected) sendJoin(key);
  return () => {
    const left = (wanted.get(key) ?? 1) - 1;
    if (left > 0) {
      wanted.set(key, left);
      return;
    }
    wanted.delete(key);
    current.emit("room:leave", { type, id });
  };
}

/** Closes the connection, e.g. after signing out. */
export function closeRealtime() {
  socket?.disconnect();
  socket = null;
  wanted.clear();
}
