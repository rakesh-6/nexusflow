import { EventEmitter } from "node:events";

// Real-time events (PRD §11.8.3, §18.9). Services announce a change after it is
// saved; in Phase 6 the Socket.io gateway listens here and forwards each event
// to the browsers in the matching rooms. Until then nobody listens.

export interface DomainEvent {
  name: string;
  orgId: string;
  workspaceId?: string;
  projectId?: string;
  /** Set for events meant for one person only (their notifications). */
  userId?: string;
  actorId: string;
  occurredAt: string;
  data: unknown;
}

const bus = new EventEmitter();

export function emitEvent(event: Omit<DomainEvent, "occurredAt">) {
  bus.emit("event", { ...event, occurredAt: new Date().toISOString() } satisfies DomainEvent);
}

/** Calls `listener` for every event; returns a function that stops listening. */
export function onEvent(listener: (event: DomainEvent) => void) {
  bus.on("event", listener);
  return () => void bus.off("event", listener);
}

/** Says that who-can-see-what may have changed inside an organization. */
export function announceAccessChange(orgId: string) {
  bus.emit("access", orgId);
}

export function onAccessChange(listener: (orgId: string) => void) {
  bus.on("access", listener);
  return () => void bus.off("access", listener);
}
