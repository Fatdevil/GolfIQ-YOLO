import { useEffect, useState } from "react";

import type { EventRole } from "@web/api";

type EventSession = {
  memberId: string;
  role: EventRole;
};

const STORAGE_PREFIX = "events.session";

function storageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function storageKey(eventId: string): string {
  return `${STORAGE_PREFIX}.${eventId}`;
}

function coerceRole(role: unknown): EventRole {
  if (role === "admin" || role === "player" || role === "spectator") {
    return role;
  }
  return "spectator";
}

function parseSession(raw: string | null): EventSession | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<EventSession> | null;
    if (!parsed || typeof parsed.memberId !== "string" || parsed.memberId.length === 0) {
      return null;
    }
    return {
      memberId: parsed.memberId,
      role: coerceRole(parsed.role),
    };
  } catch (error) {
    console.warn("[events/session] failed to parse session", error);
    return null;
  }
}

function readSession(eventId: string): EventSession | null {
  if (!storageAvailable()) {
    return null;
  }
  const raw = window.localStorage.getItem(storageKey(eventId));
  return parseSession(raw);
}

function writeSession(eventId: string, session: EventSession): void {
  if (!storageAvailable()) {
    return;
  }
  window.localStorage.setItem(storageKey(eventId), JSON.stringify(session));
}

function generateMemberId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `spectator-${Math.random().toString(36).slice(2, 12)}`;
}

export function ensureSpectatorSession(eventId: string): EventSession {
  const existing = readSession(eventId);
  if (existing) {
    return existing;
  }
  const session: EventSession = { memberId: generateMemberId(), role: "spectator" };
  writeSession(eventId, session);
  return session;
}

export function setEventSession(eventId: string, session: EventSession): void {
  writeSession(eventId, session);
}

export function clearEventSession(eventId: string): void {
  if (!storageAvailable()) {
    return;
  }
  window.localStorage.removeItem(storageKey(eventId));
}

export function getEventMemberId(eventId: string): string | null {
  return readSession(eventId)?.memberId ?? null;
}

export function getEventRole(eventId: string): EventRole | null {
  return readSession(eventId)?.role ?? null;
}

export function useEventSession(eventId: string | undefined): EventSession | null {
  const [session, setSession] = useState<EventSession | null>(() =>
    eventId ? readSession(eventId) : null,
  );

  useEffect(() => {
    if (!eventId) {
      setSession(null);
      return;
    }
    setSession(readSession(eventId));
    if (!storageAvailable()) {
      return;
    }
    const handler = (event: StorageEvent) => {
      if (event.key === storageKey(eventId)) {
        setSession(readSession(eventId));
      }
    };
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("storage", handler);
    };
  }, [eventId]);

  return session;
}

export const session = {
  getEventMemberId,
  getEventRole,
  setEventSession,
  ensureSpectatorSession,
  clearEventSession,
  generateMemberId,
};

export type { EventSession };
