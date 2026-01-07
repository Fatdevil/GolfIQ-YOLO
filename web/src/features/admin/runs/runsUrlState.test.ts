import { describe, expect, it } from "vitest";

import { buildRunsQuery, DEFAULT_RUNS_URL_STATE, parseRunsQuery, type RunsUrlState } from "./runsUrlState";

describe("runsUrlState", () => {
  it("parses default values when search string is empty", () => {
    const parsed = parseRunsQuery("");
    expect(parsed).toEqual(DEFAULT_RUNS_URL_STATE);
  });

  it("parses provided query parameters", () => {
    const parsed = parseRunsQuery("?q=test&status=failed&sort=duration&dir=asc&runId=run-1");
    expect(parsed).toEqual({
      q: "test",
      status: "failed",
      sort: "duration",
      dir: "asc",
      runId: "run-1",
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
    };
    const query = buildRunsQuery(state);
    const params = new URLSearchParams(query.replace(/^\?/, ""));
    expect(params.get("q")).toBe("foo");
    expect(params.get("status")).toBe("failed");
    expect(params.get("sort")).toBe("duration");
    expect(params.get("dir")).toBe("asc");
    expect(params.get("runId")).toBe("run-1");
  });

  it("omits default values when building", () => {
    const query = buildRunsQuery(DEFAULT_RUNS_URL_STATE);
    expect(query).toBe("");
  });
});
