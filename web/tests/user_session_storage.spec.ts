import { beforeEach, describe, expect, it } from "vitest";

import {
  createNewUserSession,
  loadUserSession,
  type UserSession,
} from "@/user/sessionStorage";

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  } satisfies Storage;
};

describe("sessionStorage helpers", () => {
  beforeEach(() => {
    const localStorageMock = createLocalStorageMock();

    Object.defineProperty(globalThis, "window", {
      value: { ...(globalThis as object), localStorage: localStorageMock },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  });

  it("returns null when no session is stored", () => {
    expect(loadUserSession()).toBeNull();
  });

  it("creates and persists a new user session", () => {
    const session = createNewUserSession();

    expect(typeof session.userId).toBe("string");
    expect(typeof session.createdAt).toBe("string");

    const loaded = loadUserSession() as UserSession;
    expect(loaded.userId).toBe(session.userId);
    expect(loaded.createdAt).toBe(session.createdAt);
  });
});
