import { act, renderHook, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutoHoleSuggestion } from "../src/courses/useAutoHole";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

describe("useAutoHoleSuggestion", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const originalWindow = (globalThis as { window?: Window }).window;
  const originalDocument = (globalThis as { document?: Document }).document;
  const originalNavigator = (globalThis as { navigator?: Navigator }).navigator;

  beforeAll(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: dom.window as unknown as Window,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: dom.window.document,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: dom.window.navigator,
    });
  });

  afterAll(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    } else {
      delete (globalThis as { window?: Window }).window;
    }
    if (originalDocument) {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    } else {
      delete (globalThis as { document?: Document }).document;
    }
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      });
    } else {
      delete (globalThis as { navigator?: Navigator }).navigator;
    }
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("fetches suggestion when enabled", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        courseId: "demo-links",
        suggestedHole: 5,
        confidence: 0.9,
        reason: "closest_tee",
      }),
    });

    const { result } = renderHook(() =>
      useAutoHoleSuggestion({
        courseId: "demo-links",
        currentHole: 4,
        position: { lat: 10, lon: 20 },
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(result.current.suggestion).not.toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/auto-hole", expect.objectContaining({
      method: "POST",
    }));
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body).toEqual({
      courseId: "demo-links",
      lat: 10,
      lon: 20,
      currentHole: 4,
    });

    expect(result.current.suggestion).toEqual({
      suggestedHole: 5,
      confidence: 0.9,
      reason: "closest_tee",
    });

    act(() => {
      result.current.clear();
    });

    await waitFor(() => {
      expect(result.current.suggestion).toBeNull();
    });
  });

  it("ignores responses that match current hole", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        courseId: "demo-links",
        suggestedHole: 4,
        confidence: 0.7,
        reason: "closest_green",
      }),
    });

    const { result } = renderHook(() =>
      useAutoHoleSuggestion({
        courseId: "demo-links",
        currentHole: 4,
        position: { lat: 10, lon: 20 },
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(result.current.suggestion).toBeNull();
  });
});
