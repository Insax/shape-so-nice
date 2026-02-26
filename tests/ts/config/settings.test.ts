import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODULE_ID, SCHEMA_VERSION, SETTINGS_KEYS } from "@/ts/constants";
import { DEFAULT_GLOBAL_CONFIG } from "@/ts/config/defaults";
import { getGlobalConfig, registerGlobalSettings, setGlobalConfig } from "@/ts/config/settings";
import type { GlobalConfig } from "@/ts/config/types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildRawConfig(): GlobalConfig {
  return {
    version: SCHEMA_VERSION,
    mappings: [
      {
        id: " map_1 ",
        trigger: { mode: "itemName", value: " Wildshape " },
        formRefs: [
          { mode: "name", value: " Wolf Form " },
          { mode: "name", value: "wolf form" },
        ],
        defaultFilters: {
          whitelist: [" Bite ", "Bite", "  "],
          blacklist: [" Dash ", "Dash"],
        },
      },
    ],
    permissions: {
      playerOverrideEditors: [" user-a ", "user-a", "  "],
    },
    ui: { showDebugLogs: true, useChatFallback: true },
  };
}

describe("settings service", () => {
  const register = vi.fn();
  const get = vi.fn();
  const set = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    register.mockReset();
    get.mockReset();
    set.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    (globalThis as Record<string, unknown>).foundry = {
      utils: {
        deepClone: clone,
      },
    };

    (globalThis as Record<string, unknown>).game = {
      user: { isGM: true },
      settings: {
        register,
        get,
        set,
      },
    };
  });

  it("registers world global config setting with schema default", () => {
    registerGlobalSettings();

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(
      MODULE_ID,
      SETTINGS_KEYS.GLOBAL_CONFIG,
      expect.objectContaining({
        scope: "world",
        config: false,
        type: Object,
      })
    );
  });

  it("warns on invalid onChange payload", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    registerGlobalSettings();
    const call = register.mock.calls[0];
    const options = call[2] as { onChange: (value: unknown) => void };
    options.onChange({ invalid: true });
    options.onChange(DEFAULT_GLOBAL_CONFIG);

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns normalized global config", () => {
    get.mockReturnValueOnce(buildRawConfig());

    const normalized = getGlobalConfig();

    expect(normalized.mappings).toHaveLength(1);
    expect(normalized.mappings[0]).toEqual({
      id: "map_1",
      trigger: { mode: "itemName", value: "Wildshape" },
      formRefs: [{ mode: "name", value: "wolf form" }],
      defaultFilters: {
        whitelist: ["Bite"],
        blacklist: ["Dash"],
      },
    });
    expect(normalized.permissions.playerOverrideEditors).toEqual(["user-a"]);
  });

  it("falls back to defaults when stored setting is invalid", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    get.mockReturnValueOnce({ invalid: true });

    const result = getGlobalConfig();

    expect(result).toEqual(DEFAULT_GLOBAL_CONFIG);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("migrates legacy global config and persists when current user is GM", async () => {
    get.mockReturnValueOnce({
      mappings: [],
      permissions: { playerOverrideEditors: ["user-a"] },
      ui: { showDebugLogs: true },
    });
    set.mockResolvedValue(undefined);

    const result = getGlobalConfig();

    expect(result).toEqual({
      version: SCHEMA_VERSION,
      mappings: [],
      permissions: { playerOverrideEditors: ["user-a"] },
      ui: { showDebugLogs: true, useChatFallback: true },
    });
    expect(set).toHaveBeenCalledWith(MODULE_ID, SETTINGS_KEYS.GLOBAL_CONFIG, {
      version: SCHEMA_VERSION,
      mappings: [],
      permissions: { playerOverrideEditors: ["user-a"] },
      ui: { showDebugLogs: true, useChatFallback: true },
    });
  });

  it("migrates legacy global config without persisting when current user is not GM", () => {
    const testGame = (globalThis as Record<string, unknown>).game as {
      user: { isGM: boolean };
    };
    testGame.user.isGM = false;
    get.mockReturnValueOnce({
      mappings: [],
      permissions: { playerOverrideEditors: ["user-a"] },
      ui: { showDebugLogs: true },
    });

    const result = getGlobalConfig();

    expect(result).toEqual({
      version: SCHEMA_VERSION,
      mappings: [],
      permissions: { playerOverrideEditors: ["user-a"] },
      ui: { showDebugLogs: true, useChatFallback: true },
    });
    expect(set).not.toHaveBeenCalled();
  });

  it("logs a warning when migrated global config persistence fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    get.mockReturnValueOnce({
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    set.mockRejectedValueOnce(new Error("persist failed"));

    getGlobalConfig();
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalled();
  });

  it("blocks global config updates from non-GM users", async () => {
    const testGame = (globalThis as Record<string, unknown>).game as {
      user: { isGM: boolean };
    };
    testGame.user.isGM = false;

    await expect(setGlobalConfig(DEFAULT_GLOBAL_CONFIG)).rejects.toThrow(
      "Only GMs can update global wildshape config."
    );
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads on set", async () => {
    await expect(setGlobalConfig({ invalid: true })).rejects.toThrow(
      "Invalid global wildshape config payload."
    );
    expect(set).not.toHaveBeenCalled();
  });

  it("writes normalized payload when set succeeds", async () => {
    set.mockResolvedValue(undefined);
    await setGlobalConfig(buildRawConfig());

    expect(set).toHaveBeenCalledTimes(1);
    const call = set.mock.calls[0];
    expect(call[0]).toBe(MODULE_ID);
    expect(call[1]).toBe(SETTINGS_KEYS.GLOBAL_CONFIG);
    expect(call[2]).toEqual({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [{ mode: "name", value: "wolf form" }],
          defaultFilters: {
            whitelist: ["Bite"],
            blacklist: ["Dash"],
          },
        },
      ],
      permissions: { playerOverrideEditors: ["user-a"] },
      ui: { showDebugLogs: true, useChatFallback: true },
    });
  });
});
