import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as service from "shared/sync/service";

const ORIGINAL_ENV = process.env;

describe("cloud sync gating", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon";
    delete process.env.CLOUD_SYNC_ENABLED;
    delete process.env.EXPO_PUBLIC_CLOUD_SYNC;
    delete process.env.QA_CLOUD_SYNC;
    const globalScope = globalThis as Record<string, unknown>;
    delete globalScope.CLOUD_SYNC_ENABLED;
    delete globalScope.RC;
    service.__setCloudSyncEnabledForTests(null);
    service.__resetCloudSyncStateForTests();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    const globalScope = globalThis as Record<string, unknown>;
    delete globalScope.CLOUD_SYNC_ENABLED;
    delete globalScope.RC;
    service.__setCloudSyncEnabledForTests(null);
    service.__resetCloudSyncStateForTests();
  });

  it('enables with CLOUD_SYNC_ENABLED="1"', () => {
    process.env.CLOUD_SYNC_ENABLED = "1";
    expect(service.isEnabled()).toBe(true);
  });

  it('enables with EXPO_PUBLIC_CLOUD_SYNC="yes"', () => {
    delete process.env.CLOUD_SYNC_ENABLED;
    process.env.EXPO_PUBLIC_CLOUD_SYNC = "yes";
    expect(service.isEnabled()).toBe(true);
  });

  it("enables with RC only", () => {
    delete process.env.CLOUD_SYNC_ENABLED;
    delete process.env.EXPO_PUBLIC_CLOUD_SYNC;
    delete process.env.QA_CLOUD_SYNC;
    (globalThis as Record<string, unknown>).RC = { "cloud.sync.enabled": "true" };
    expect(service.isEnabled()).toBe(true);
  });

  it('enables with globalThis.CLOUD_SYNC_ENABLED="on"', () => {
    (globalThis as Record<string, unknown>).CLOUD_SYNC_ENABLED = "on";
    expect(service.isEnabled()).toBe(true);
  });

  it("disabled with falsy/env off + rc off + global off", () => {
    process.env.CLOUD_SYNC_ENABLED = "false";
    process.env.EXPO_PUBLIC_CLOUD_SYNC = "0";
    (globalThis as Record<string, unknown>).RC = {
      "cloud.sync.enabled": "no",
      "cloud.sync.beta": "off",
    };
    expect(service.isEnabled()).toBe(false);
  });

  it("requires credentials even if flags true", () => {
    process.env.CLOUD_SYNC_ENABLED = "true";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    expect(service.isEnabled()).toBe(false);
  });
});
