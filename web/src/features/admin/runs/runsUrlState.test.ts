import { describe, expect, it } from "vitest";

import {
  buildRunsQuery,
  DEFAULT_RUNS_URL_STATE,
  parseRunsQuery,
  updateRunsUrlState,
  type RunsUrlState,
} from "./runsUrlState";

describe("runsUrlState", () => {
  it("parses default values when search string is empty", () => {
    const parsed = parseRunsQuery("");
    expect(parsed).toEqual(DEFAULT_RUNS_URL_STATE);
  });

  it("parses provided query parameters", () => {
    const parsed = parseRunsQuery("?q=test&status=failed&sort=duration&dir=asc&runId=run-1&cursor=next&limit=50");
    expect(parsed).toEqual({
      q: "test",
      status: "failed",
      sort: "duration",
      dir: "asc",
      runId: "run-1",
      cursor: "next",
      limit: 50,
    });
  });

  it("falls back to defaults for invalid sort, direction, or status", () => {
    const parsed = parseRunsQuery("?sort=unknown&dir=sideways&status=bogus");
    expect(parsed.sort).toBe(DEFAULT_RUNS_URL_STATE.sort);
    expect(parsed.dir).toBe(DEFAULT_RUNS_URL_STATE.dir);
    expect(parsed.status).toBe(DEFAULT_RUNS_URL_STATE.status);
  });

  it("builds a compact query string from state", () => {
    const state: RunsUrlState = {
      q: "foo",
      status: "failed",
      sort: "duration",
      dir: "asc",
      runId: "run-1",
      cursor: "cursor-1",
      limit: 50,
    };
    const query = buildRunsQuery(state);
    const params = new URLSearchParams(query.replace(/^\?/, ""));
    expect(params.get("q")).toBe("foo");
    expect(params.get("status")).toBe("failed");
    expect(params.get("sort")).toBe("duration");
    expect(params.get("dir")).toBe("asc");
    expect(params.get("runId")).toBe("run-1");
    expect(params.get("cursor")).toBe("cursor-1");
    expect(params.get("limit")).toBe("50");
  });

  it("omits default values when building", () => {
    const query = buildRunsQuery(DEFAULT_RUNS_URL_STATE);
    expect(query).toBe("");
  });

  it("resets cursor when search or sort inputs change", () => {
    const initial: RunsUrlState = {
      ...DEFAULT_RUNS_URL_STATE,
      cursor: "cursor-1",
    };

    const next = updateRunsUrlState(initial, { q: "new" });
    expect(next.cursor).toBeNull();

    const nextSort = updateRunsUrlState(initial, { sort: "duration" });
    expect(nextSort.cursor).toBeNull();
  });
});
