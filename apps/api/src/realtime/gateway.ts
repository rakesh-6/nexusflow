import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { env } from "../config/env.ts";
import { onAccessChange, onEvent, type DomainEvent } from "../lib/events.ts";
import { logger } from "../lib/logger.ts";
import { prisma } from "../lib/prisma.ts";
import { findTenant } from "../middleware/tenant.ts";
import { findActiveSession, SESSION_COOKIE } from "../modules/auth/session.service.ts";
import { loadWorkspace } from "../modules/organizations/workspaces.service.ts";
import { loadProject } from "../modules/projects/access.ts";
import { loadTask } from "../modules/tasks/taskAccess.ts";

// Live updates (PRD §11.8, §18.9). Browsers connect with their normal login
// cookie, join rooms (an organization, a workspace, a project, a task) after
// the same access checks as the HTTP API, and receive the events services
// announce on the event bus. Presence and "typing…" signals only travel here.

export interface RealtimeOptions {
  /** How long someone counts as online after their last ping (PRD: 60 s). */
  presenceTtlMs?: number;
  /** How often offline people are swept out of the presence lists. */
  sweepMs?: number;
  /** How often each connection's login session is checked again. */
  sessionCheckMs?: number;
}

const MAX_SOCKETS_PER_USER = 10;
const ROOM_TYPES = ["org", "workspace", "project", "task"] as const;
type RoomType = (typeof ROOM_TYPES)[number];

interface JoinedRoom {
  type: RoomType;
  id: string;
  orgId: string;
}

interface Connection {
  userId: string;
  name: string;
  token: string;
  rooms: Map<string, JoinedRoom>;
  lastTyping: Map<string, number>;
}

const roomSchema = z.object({ type: z.enum(ROOM_TYPES), id: z.uuid() });
const workspacePing = z.object({ workspaceId: z.uuid() });
const taskSignal = z.object({ taskId: z.uuid() });
const roomKey = (type: RoomType, id: string) => `${type}:${id}`;

type JoinResult = { ok: true } | { ok: false; code: "FORBIDDEN" | "VALIDATION_ERROR" };

/** The value of one cookie in a raw "a=1; b=2" Cookie header. */
function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * The organization a room belongs to, if this person may join it (the same
 * checks as the HTTP API), else null.
 */
async function roomAccess(userId: string, type: RoomType, id: string): Promise<string | null> {
  const tenantOf = (organizationId: string) => findTenant({ id: organizationId }, userId);
  try {
    switch (type) {
      case "org":
        return (await tenantOf(id)) ? id : null;
      case "workspace": {
        const workspace = await prisma.workspace.findFirst({
          where: { id, deletedAt: null },
          select: { organizationId: true, slug: true },
        });
        const tenant = workspace && (await tenantOf(workspace.organizationId));
        if (!workspace || !tenant) return null;
        await loadWorkspace(tenant, workspace.slug, userId);
        return workspace.organizationId;
      }
      case "project": {
        const project = await prisma.project.findFirst({
          where: { id, deletedAt: null },
          select: { organizationId: true },
        });
        const tenant = project && (await tenantOf(project.organizationId));
        if (!project || !tenant) return null;
        await loadProject(tenant, id, userId);
        return project.organizationId;
      }
      case "task": {
        const task = await prisma.task.findFirst({
          where: { id, deletedAt: null },
          select: { organizationId: true },
        });
        const tenant = task && (await tenantOf(task.organizationId));
        if (!task || !tenant) return null;
        await loadTask(tenant, id, userId);
        return task.organizationId;
      }
    }
  } catch {
    // Not found, not a member, no access: all mean "you may not join".
    return null;
  }
}

/** The rooms an event goes to: its project (and task), else its workspace, else its organization. */
function roomsFor(event: DomainEvent): string[] {
  // A person's own notifications go to their tabs only (PRD §11.8.2).
  if (event.userId) return [`user:${event.userId}`];
  const rooms: string[] = [];
  if (event.projectId) rooms.push(roomKey("project", event.projectId));
  const taskId = (event.data as { taskId?: unknown } | null)?.taskId;
  if (typeof taskId === "string") rooms.push(roomKey("task", taskId));
  if (rooms.length === 0 && event.workspaceId) rooms.push(roomKey("workspace", event.workspaceId));
  if (rooms.length === 0) rooms.push(roomKey("org", event.orgId));
  return rooms;
}

export function attachRealtime(httpServer: HttpServer, options: RealtimeOptions = {}) {
  const presenceTtlMs = options.presenceTtlMs ?? 60_000;
  const allowedOrigins = new Set([...env.WEB_ORIGINS, new URL(env.APP_URL).origin]);

  const io = new Server(httpServer, {
    path: "/socket.io",
    serveClient: false,
    cors: { origin: [...allowedOrigins], credentials: true },
    // A browser on another website must not open a connection with our cookie.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      const own = req.headers.host
        ? [`http://${req.headers.host}`, `https://${req.headers.host}`]
        : [];
      callback(null, !origin || allowedOrigins.has(origin) || own.includes(origin));
    },
  });

  const connections = new Map<string, { socket: Socket; info: Connection }>();
  const perUser = new Map<string, number>();
  /** workspaceId -> userId -> last ping time */
  const presence = new Map<string, Map<string, number>>();

  const info = (socket: Socket) => socket.data as Connection;

  // --- Sign-in check for every new connection (AC-RT-01) --------------------
  io.use(async (socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    const active = token ? await findActiveSession(token).catch(() => null) : null;
    if (!token || !active || !active.user.emailVerifiedAt)
      return next(new Error("UNAUTHENTICATED"));
    if ((perUser.get(active.user.id) ?? 0) >= MAX_SOCKETS_PER_USER) {
      return next(new Error("TOO_MANY_CONNECTIONS"));
    }
    const data: Connection = {
      userId: active.user.id,
      name: active.user.name,
      token,
      rooms: new Map(),
      lastTyping: new Map(),
    };
    socket.data = data;
    next();
  });

  // --- Who is looking at a task, presence -------------------------------------
  function announceViewers(taskId: string) {
    const key = roomKey("task", taskId);
    const userIds = new Set<string>();
    for (const { info: connection } of connections.values()) {
      if (connection.rooms.has(key)) userIds.add(connection.userId);
    }
    io.to(key).emit("task:viewers", { taskId, userIds: [...userIds] });
  }

  function announcePresence(workspaceId: string, to?: Socket) {
    const payload = { workspaceId, online: [...(presence.get(workspaceId)?.keys() ?? [])] };
    if (to) to.emit("presence:update", payload);
    else io.to(roomKey("workspace", workspaceId)).emit("presence:update", payload);
  }

  /** Marks someone as online in a workspace now; tells the others if they just arrived. */
  function markPresent(workspaceId: string, userId: string) {
    const users = presence.get(workspaceId) ?? new Map<string, number>();
    const wasOnline = users.has(userId);
    users.set(userId, Date.now());
    presence.set(workspaceId, users);
    if (!wasOnline) announcePresence(workspaceId);
  }

  /** Someone closed their last tab of a workspace: they are offline at once. */
  function markGoneIfLast(workspaceId: string, userId: string) {
    const key = roomKey("workspace", workspaceId);
    for (const { info: other } of connections.values()) {
      if (other.userId === userId && other.rooms.has(key)) return;
    }
    if (presence.get(workspaceId)?.delete(userId)) announcePresence(workspaceId);
  }

  function leave(socket: Socket, key: string, notify: boolean) {
    const room = info(socket).rooms.get(key);
    if (!room) return;
    info(socket).rooms.delete(key);
    void socket.leave(key);
    if (notify) socket.emit("access:revoked", { type: room.type, id: room.id });
    if (room.type === "task") announceViewers(room.id);
    if (room.type === "workspace") markGoneIfLast(room.id, info(socket).userId);
  }

  io.on("connection", (socket) => {
    const connection = info(socket);
    connections.set(socket.id, { socket, info: connection });
    perUser.set(connection.userId, (perUser.get(connection.userId) ?? 0) + 1);
    void socket.join(`user:${connection.userId}`);
    socket.emit("session:ready", { userId: connection.userId });

    socket.on("room:join", async (payload: unknown, ack?: (result: JoinResult) => void) => {
      const reply = typeof ack === "function" ? ack : () => {};
      const parsed = roomSchema.safeParse(payload);
      if (!parsed.success) return reply({ ok: false, code: "VALIDATION_ERROR" });
      const { type, id } = parsed.data;
      const orgId = await roomAccess(connection.userId, type, id);
      // The connection may have closed while the check ran.
      if (!orgId || !connections.has(socket.id)) return reply({ ok: false, code: "FORBIDDEN" });
      const key = roomKey(type, id);
      connection.rooms.set(key, { type, id, orgId });
      await socket.join(key);
      reply({ ok: true });
      if (type === "task") announceViewers(id);
      if (type === "workspace") {
        // Opening a workspace counts as being online in it.
        markPresent(id, connection.userId);
        announcePresence(id, socket);
      }
    });

    socket.on("room:leave", (payload: unknown) => {
      const parsed = roomSchema.safeParse(payload);
      if (parsed.success) leave(socket, roomKey(parsed.data.type, parsed.data.id), false);
    });

    socket.on("presence:ping", (payload: unknown) => {
      const parsed = workspacePing.safeParse(payload);
      if (!parsed.success) return;
      const { workspaceId } = parsed.data;
      if (!connection.rooms.has(roomKey("workspace", workspaceId))) return;
      markPresent(workspaceId, connection.userId);
    });

    // "Typing…" goes to everyone else looking at the task, at most once a second.
    for (const [signal, typing] of [
      ["typing:start", true],
      ["typing:stop", false],
    ] as const) {
      socket.on(signal, (payload: unknown) => {
        const parsed = taskSignal.safeParse(payload);
        if (!parsed.success) return;
        const key = roomKey("task", parsed.data.taskId);
        if (!connection.rooms.has(key)) return;
        if (typing) {
          const last = connection.lastTyping.get(key) ?? 0;
          if (Date.now() - last < 1000) return;
          connection.lastTyping.set(key, Date.now());
        } else {
          connection.lastTyping.delete(key);
        }
        socket.to(key).emit("typing", {
          taskId: parsed.data.taskId,
          userId: connection.userId,
          name: connection.name,
          typing,
        });
      });
    }

    socket.on("disconnect", () => {
      connections.delete(socket.id);
      const left = (perUser.get(connection.userId) ?? 1) - 1;
      if (left > 0) perUser.set(connection.userId, left);
      else perUser.delete(connection.userId);
      for (const room of connection.rooms.values()) {
        if (room.type === "task") announceViewers(room.id);
        if (room.type === "workspace") markGoneIfLast(room.id, connection.userId);
      }
    });
  });

  // --- Events from the services -------------------------------------------------
  const stopEvents = onEvent((event) => {
    // Notification requests become inbox entries in Phase 7; they are not sent as they are.
    if (event.name === "notification:requested") return;
    io.to(roomsFor(event)).emit(event.name, event);
  });

  // --- Access changes: leave rooms people may no longer see (AC-RT-04) --------
  const pendingChecks = new Map<string, NodeJS.Timeout>();
  async function recheck(orgId: string) {
    const results = new Map<string, Promise<string | null>>();
    for (const { socket, info: connection } of connections.values()) {
      for (const [key, room] of connection.rooms) {
        if (room.orgId !== orgId) continue;
        const cacheKey = `${connection.userId}|${key}`;
        if (!results.has(cacheKey)) {
          results.set(cacheKey, roomAccess(connection.userId, room.type, room.id));
        }
        if (!(await results.get(cacheKey))) leave(socket, key, true);
      }
    }
  }
  const stopAccess = onAccessChange((orgId) => {
    // Several changes in a row are checked once.
    if (pendingChecks.has(orgId)) return;
    pendingChecks.set(
      orgId,
      setTimeout(() => {
        pendingChecks.delete(orgId);
        recheck(orgId).catch((error: unknown) => logger.error({ error }, "Room re-check failed"));
      }, 150),
    );
  });

  // --- Timers: presence clean-up, signed-out sessions ---------------------------
  const sweep = setInterval(() => {
    const cutoff = Date.now() - presenceTtlMs;
    for (const [workspaceId, users] of presence) {
      let changed = false;
      for (const [userId, lastSeen] of users) {
        if (lastSeen < cutoff) {
          users.delete(userId);
          changed = true;
        }
      }
      if (users.size === 0) presence.delete(workspaceId);
      if (changed) announcePresence(workspaceId);
    }
  }, options.sweepMs ?? 15_000);
  sweep.unref();

  const sessionCheck = setInterval(() => {
    for (const { socket, info: connection } of connections.values()) {
      findActiveSession(connection.token)
        .then((active) => {
          if (!active) {
            socket.emit("session:ended");
            socket.disconnect(true);
          }
        })
        .catch(() => {});
    }
  }, options.sessionCheckMs ?? 60_000);
  sessionCheck.unref();

  return {
    io,
    /** Disconnects everyone and stops the timers (the HTTP server keeps running). */
    close() {
      stopEvents();
      stopAccess();
      clearInterval(sweep);
      clearInterval(sessionCheck);
      for (const timer of pendingChecks.values()) clearTimeout(timer);
      io.disconnectSockets(true);
    },
  };
}
