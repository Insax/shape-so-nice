import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODULE_ID, SCHEMA_VERSION } from "@/ts/constants";
import {
  canCurrentUserEditPlayerOverride,
  getPlayerOverrideConfig,
  setPlayerOverrideConfig,
} from "@/ts/config/playerOverride";

const { getGlobalConfigMock } = vi.hoisted(() => ({
  getGlobalConfigMock: vi.fn(),
}));

vi.mock("@/ts/config/settings", () => ({
  getGlobalConfig: getGlobalConfigMock,
}));

type TestUser = User & {
  id: string;
  isGM: boolean;
  getFlag: ReturnType<typeof vi.fn>;
  setFlag: ReturnType<typeof vi.fn>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createUser(id: string | null, isGM: boolean): TestUser {
  return {
    id,
    isGM,
    getFlag: vi.fn(),
    setFlag: vi.fn(),
  } as unknown as TestUser;
}

describe("player override service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    getGlobalConfigMock.mockReset();
    getGlobalConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [],
      permissions: { playerOverrideEditors: ["player-1"] },
      ui: { showDebugLogs: false },
    });

    (globalThis as Record<string, unknown>).foundry = {
      utils: {
        deepClone: clone,
      },
    };
    (globalThis as Record<string, unknown>).game = {
      user: createUser("player-1", false),
    };
  });

  it("returns default override when no target user is available", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    (globalThis as Record<string, unknown>).game = {
      user: null,
    };

    const override = getPlayerOverrideConfig();

    expect(override).toEqual({ version: SCHEMA_VERSION, mappings: [] });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns default override when flag is unset", () => {
    const currentUser = (globalThis as Record<string, unknown>).game as { user: TestUser };
    currentUser.user.getFlag.mockReturnValue(undefined);

    expect(getPlayerOverrideConfig()).toEqual({ version: SCHEMA_VERSION, mappings: [] });
  });

  it("warns and falls back when stored flag data is invalid", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const currentUser = (globalThis as Record<string, unknown>).game as { user: TestUser };
    currentUser.user.getFlag.mockReturnValue({ invalid: true });

    expect(getPlayerOverrideConfig()).toEqual({ version: SCHEMA_VERSION, mappings: [] });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns normalized override config when data is valid", () => {
    const currentUser = (globalThis as Record<string, unknown>).game as { user: TestUser };
    currentUser.user.getFlag.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: " map_1 ",
          formRefsAdd: [{ mode: "name", value: " Panther Form " }],
          formRefsRemove: [{ mode: "name", value: " Bear Form " }],
          filtersOverride: {
            whitelist: [" Bite ", "Bite"],
            blacklist: [" Dash "],
          },
        },
      ],
    });

    expect(getPlayerOverrideConfig()).toEqual({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          formRefsAdd: [{ mode: "name", value: "Panther Form" }],
          formRefsRemove: [{ mode: "name", value: "Bear Form" }],
          filtersOverride: { whitelist: ["Bite"], blacklist: ["Dash"] },
        },
      ],
    });
  });

  it("migrates legacy player override payload and persists when allowed", async () => {
    const currentUser = (globalThis as Record<string, unknown>).game as { user: TestUser };
    currentUser.user.getFlag.mockReturnValue({
      mappings: [
        {
          id: "map_legacy",
          formRefsAdd: [{ mode: "name", value: " Wolf Form " }],
          formRefsRemove: [],
        },
      ],
    });
    currentUser.user.setFlag.mockResolvedValue(undefined);

    const result = getPlayerOverrideConfig();

    expect(result).toEqual({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_legacy",
          formRefsAdd: [{ mode: "name", value: "Wolf Form" }],
          formRefsRemove: [],
        },
      ],
    });
    expect(currentUser.user.setFlag).toHaveBeenCalledWith(MODULE_ID, "playerOverride", {
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_legacy",
          formRefsAdd: [{ mode: "name", value: "Wolf Form" }],
          formRefsRemove: [],
        },
      ],
    });
  });

  it("migrates legacy player override payload without persisting when user cannot edit", () => {
    const currentUser = createUser("player-2", false);
    currentUser.getFlag.mockReturnValue({
      mappings: [
        {
          id: "map_legacy",
          formRefsAdd: [{ mode: "name", value: "Wolf Form" }],
          formRefsRemove: [],
        },
      ],
    });
    (globalThis as Record<string, unknown>).game = { user: currentUser };
    getGlobalConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });

    const result = getPlayerOverrideConfig();

    expect(result).toEqual({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_legacy",
          formRefsAdd: [{ mode: "name", value: "Wolf Form" }],
          formRefsRemove: [],
        },
      ],
    });
    expect(currentUser.setFlag).not.toHaveBeenCalled();
  });

  it("logs a warning when migrated player override persistence fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const currentUser = (globalThis as Record<string, unknown>).game as { user: TestUser };
    currentUser.user.getFlag.mockReturnValue({
      mappings: [
        {
          id: "map_legacy",
          formRefsAdd: [{ mode: "name", value: "Wolf Form" }],
          formRefsRemove: [],
        },
      ],
    });
    currentUser.user.setFlag.mockRejectedValue(new Error("persist failed"));

    getPlayerOverrideConfig();
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalled();
  });

  it("falls back to legacy raw flag scope when module scope flag is missing", () => {
    const currentUser = (globalThis as Record<string, unknown>).game as { user: TestUser };
    currentUser.user.getFlag.mockReturnValue(undefined);
    (currentUser.user as unknown as { flags: Record<string, unknown> }).flags = {
      wildshape: {
        playerOverride: {
          version: SCHEMA_VERSION,
          mappings: [
            {
              id: "map_legacy",
              formRefsAdd: [{ mode: "name", value: " Wolf Form " }],
              formRefsRemove: [],
            },
          ],
        },
      },
    };

    expect(getPlayerOverrideConfig()).toEqual({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_legacy",
          formRefsAdd: [{ mode: "name", value: "Wolf Form" }],
          formRefsRemove: [],
        },
      ],
    });
  });

  it("ignores malformed legacy scoped flags", () => {
    const currentUser = (globalThis as Record<string, unknown>).game as { user: TestUser };
    currentUser.user.getFlag.mockReturnValue(undefined);
    (currentUser.user as unknown as { flags: Record<string, unknown> }).flags = {
      wildshape: "bad-legacy-scope",
    };

    expect(getPlayerOverrideConfig()).toEqual({ version: SCHEMA_VERSION, mappings: [] });
  });

  it("returns default when legacy scope exists but override key is missing", () => {
    const currentUser = (globalThis as Record<string, unknown>).game as { user: TestUser };
    currentUser.user.getFlag.mockReturnValue(undefined);
    (currentUser.user as unknown as { flags: Record<string, unknown> }).flags = {
      wildshape: {},
    };

    expect(getPlayerOverrideConfig()).toEqual({ version: SCHEMA_VERSION, mappings: [] });
  });

  it("enforces permission model for editing", () => {
    (globalThis as Record<string, unknown>).game = { user: null };
    expect(canCurrentUserEditPlayerOverride(createUser("player-2", false))).toBe(false);

    const nullIdUser = createUser(null, false);
    (globalThis as Record<string, unknown>).game = { user: nullIdUser };
    expect(canCurrentUserEditPlayerOverride(createUser("player-2", false))).toBe(false);

    const gmUser = createUser("gm-1", true);
    const targetUser = createUser("player-2", false);
    (globalThis as Record<string, unknown>).game = { user: gmUser };
    expect(canCurrentUserEditPlayerOverride(targetUser)).toBe(true);

    const nonGmUser = createUser("player-1", false);
    (globalThis as Record<string, unknown>).game = { user: nonGmUser };
    expect(canCurrentUserEditPlayerOverride(targetUser)).toBe(false);
    expect(canCurrentUserEditPlayerOverride(nonGmUser)).toBe(true);

    getGlobalConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    expect(canCurrentUserEditPlayerOverride(nonGmUser)).toBe(false);
  });

  it("throws when target user is unavailable for set", async () => {
    (globalThis as Record<string, unknown>).game = { user: null };
    await expect(setPlayerOverrideConfig({ version: SCHEMA_VERSION, mappings: [] })).rejects.toThrow(
      "No target user available for player override update."
    );
  });

  it("throws on unauthorized edits and invalid payloads", async () => {
    const currentUser = createUser("player-1", false);
    const otherUser = createUser("player-2", false);
    (globalThis as Record<string, unknown>).game = { user: currentUser };

    await expect(
      setPlayerOverrideConfig({ version: SCHEMA_VERSION, mappings: [] }, otherUser)
    ).rejects.toThrow("Current user is not allowed to edit this player override.");
    await expect(setPlayerOverrideConfig({ invalid: true })).rejects.toThrow(
      "Invalid player override config payload."
    );
  });

  it("writes normalized payload via user flag update", async () => {
    const currentUser = createUser("player-1", false);
    currentUser.setFlag.mockResolvedValue(undefined);
    (globalThis as Record<string, unknown>).game = { user: currentUser };

    await setPlayerOverrideConfig({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: " map_1 ",
          formRefsAdd: [{ mode: "name", value: " Panther Form " }],
          formRefsRemove: [{ mode: "name", value: " Bear Form " }],
          filtersOverride: { whitelist: [" Bite "], blacklist: [" Dash "] },
        },
      ],
    });

    expect(currentUser.setFlag).toHaveBeenCalledWith(MODULE_ID, "playerOverride", {
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          formRefsAdd: [{ mode: "name", value: "Panther Form" }],
          formRefsRemove: [{ mode: "name", value: "Bear Form" }],
          filtersOverride: { whitelist: ["Bite"], blacklist: ["Dash"] },
        },
      ],
    });
  });
});
