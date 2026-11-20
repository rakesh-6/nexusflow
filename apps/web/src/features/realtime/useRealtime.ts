import type { CommentSummary, ReactionSummary } from "@nexusflow/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { WorkspaceContext } from "../../hooks/useWorkspace";
import { joinRoom, realtimeSocket, type RoomType } from "../../lib/realtime";

// Live updates in the web app (PRD §11.8.5): server events refresh or patch the
// cached data, so other people's changes appear without reloading.

interface LiveEvent {
  orgId: string;
  workspaceId?: string;
  projectId?: string;
  actorId: string;
  occurredAt: string;
  data?: Record<string, unknown>;
}

/** Joins a room while the component is on screen. */
export function useRoom(type: RoomType, id: string | undefined) {
  useEffect(() => {
    if (!id) return undefined;
    return joinRoom(type, id);
  }, [type, id]);
}

// --- Who is online, per workspace -------------------------------------------------

const EMPTY: string[] = [];
const online = new Map<string, string[]>();
const presenceListeners = new Set<() => void>();

function setOnline(workspaceId: string, userIds: string[]) {
  online.set(workspaceId, userIds);
  for (const listener of presenceListeners) listener();
}

/** The people who have this workspace open right now (their user ids). */
export function useOnline(workspaceId: string): string[] {
  return useSyncExternalStore(
    (listener) => {
      presenceListeners.add(listener);
      return () => presenceListeners.delete(listener);
    },
    () => online.get(workspaceId) ?? EMPTY,
    () => EMPTY,
  );
}

function withReactions(
  comments: CommentSummary[],
  commentId: string,
  reactions: ReactionSummary[],
): CommentSummary[] {
  return comments.map((comment) =>
    comment.id === commentId
      ? { ...comment, reactions }
      : { ...comment, replies: withReactions(comment.replies, commentId, reactions) },
  );
}

/**
 * Keeps the open workspace live: joins its organization and workspace rooms,
 * says "I am here" every 30 seconds, and refreshes cached data when events
 * arrive. Used once, by the app shell.
 */
export function useRealtimeSync(context: WorkspaceContext | null) {
  const queryClient = useQueryClient();
  const orgSlug = context?.organization.slug;
  const workspaceId = context?.workspace.id;
  useRoom("org", context?.organization.id);
  useRoom("workspace", workspaceId);

  useEffect(() => {
    if (!workspaceId) return undefined;
    const socket = realtimeSocket();
    const timer = window.setInterval(() => socket.emit("presence:ping", { workspaceId }), 30_000);
    return () => window.clearInterval(timer);
  }, [workspaceId]);

  useEffect(() => {
    if (!orgSlug) return undefined;
    const socket = realtimeSocket();
    // Several events in a burst (a bulk change) refresh each list once.
    const pending = new Map<string, readonly unknown[]>();
    let timer: number | undefined;
    const refresh = (...keys: (readonly unknown[])[]) => {
      for (const key of keys) pending.set(JSON.stringify(key), key);
      timer ??= window.setTimeout(() => {
        timer = undefined;
        for (const key of pending.values()) void queryClient.invalidateQueries({ queryKey: key });
        pending.clear();
      }, 250);
    };

    const onAny = (name: string, event: LiveEvent | undefined) => {
      if (!event || typeof event !== "object") return;
      const taskId = typeof event.data?.["taskId"] === "string" ? event.data["taskId"] : null;
      if (name === "billing:updated") {
        // Razorpay confirmed a payment or a plan change: new plan, new limits.
        refresh(["org", orgSlug]);
        return;
      }
      if (name === "notification:new") {
        // A new notification for you: refresh the badge and the inbox.
        refresh(["notifications"]);
        return;
      }
      if (name.startsWith("task:") && name !== "task:viewers" && event.projectId) {
        refresh(
          ["org", orgSlug, "project", event.projectId, "tasks"],
          ["org", orgSlug, "task"],
          ["org", orgSlug, "task-activity"],
          ["org", orgSlug, "my-tasks"],
          ["org", orgSlug, "projects"],
        );
      } else if (name.startsWith("comment:") && taskId) {
        refresh(["org", orgSlug, "task-comments", taskId]);
        if (event.projectId) refresh(["org", orgSlug, "project", event.projectId, "tasks"]);
      } else if (name === "reaction:updated" && taskId) {
        const commentId = event.data?.["commentId"];
        const reactions = event.data?.["reactions"];
        if (typeof commentId === "string" && Array.isArray(reactions)) {
          queryClient.setQueryData<CommentSummary[]>(
            ["org", orgSlug, "task-comments", taskId],
            (comments) =>
              comments && withReactions(comments, commentId, reactions as ReactionSummary[]),
          );
        }
      }
    };
    const onPresence = (payload: { workspaceId: string; online: string[] }) =>
      setOnline(payload.workspaceId, payload.online);
    // Access taken away (removed from a project or the organization): reload what is shown.
    const onRevoked = () => void queryClient.invalidateQueries({ queryKey: ["org", orgSlug] });
    // After the connection comes back, events may have been missed: reload the organization.
    let connectedBefore = socket.connected;
    const onConnect = () => {
      if (connectedBefore) void queryClient.invalidateQueries({ queryKey: ["org", orgSlug] });
      connectedBefore = true;
    };

    socket.onAny(onAny);
    socket.on("presence:update", onPresence);
    socket.on("access:revoked", onRevoked);
    socket.on("connect", onConnect);
    return () => {
      socket.offAny(onAny);
      socket.off("presence:update", onPresence);
      socket.off("access:revoked", onRevoked);
      socket.off("connect", onConnect);
      if (timer) window.clearTimeout(timer);
    };
  }, [orgSlug, queryClient]);
}

// --- One task: who else is looking, who is typing ------------------------------------

export interface Typist {
  userId: string;
  name: string;
  until: number;
}

export function useTaskPresence(taskId: string) {
  useRoom("task", taskId);
  const [viewers, setViewers] = useState<string[]>([]);
  const [typing, setTyping] = useState<Typist[]>([]);

  useEffect(() => {
    const socket = realtimeSocket();
    const onViewers = (payload: { taskId: string; userIds: string[] }) => {
      if (payload.taskId === taskId) setViewers(payload.userIds);
    };
    const onTyping = (payload: {
      taskId: string;
      userId: string;
      name: string;
      typing: boolean;
    }) => {
      if (payload.taskId !== taskId) return;
      setTyping((list) => {
        const others = list.filter((typist) => typist.userId !== payload.userId);
        return payload.typing
          ? [...others, { userId: payload.userId, name: payload.name, until: Date.now() + 4000 }]
          : others;
      });
    };
    socket.on("task:viewers", onViewers);
    socket.on("typing", onTyping);
    // "Typing…" fades out if no new signal arrives for a few seconds.
    const timer = window.setInterval(
      () =>
        setTyping((list) => {
          const kept = list.filter((typist) => typist.until > Date.now());
          return kept.length === list.length ? list : kept;
        }),
      1000,
    );
    return () => {
      socket.off("task:viewers", onViewers);
      socket.off("typing", onTyping);
      window.clearInterval(timer);
    };
  }, [taskId]);

  return { viewers, typing };
}

let lastTypingSignal = 0;

/** Tells others in the task you are typing (at most every 1.5 seconds), or that you stopped. */
export function sendTyping(taskId: string, typing: boolean) {
  if (typing && Date.now() - lastTypingSignal < 1500) return;
  lastTypingSignal = typing ? Date.now() : 0;
  realtimeSocket().emit(typing ? "typing:start" : "typing:stop", { taskId });
}
