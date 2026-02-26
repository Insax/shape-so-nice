import { describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION } from "@/ts/constants";
import { DEFAULT_WILDSHAPE_FILTERS } from "@/ts/config/defaults";
import { getEffectiveConfig } from "@/ts/config/effectiveConfig";

const { getGlobalConfigMock, getPlayerOverrideConfigMock } = vi.hoisted(() => ({
  getGlobalConfigMock: vi.fn(),
  getPlayerOverrideConfigMock: vi.fn(),
}));

vi.mock("@/ts/config/settings", () => ({
  getGlobalConfig: getGlobalConfigMock,
}));

vi.mock("@/ts/config/playerOverride", () => ({
  getPlayerOverrideConfig: getPlayerOverrideConfigMock,
}));

describe("getEffectiveConfig", () => {
  it("merges global and player override config for the target user", () => {
    const targetUser = { id: "player-1" } as User;
    getGlobalConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [
            { mode: "name", value: "Wolf Form" },
            { mode: "name", value: "Bear Form" },
          ],
          defaultFilters: { whitelist: [], blacklist: ["Dash"] },
        },
      ],
      permissions: { playerOverrideEditors: ["player-1"] },
      ui: { showDebugLogs: false },
    });
    getPlayerOverrideConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          formRefsAdd: [{ mode: "name", value: "Panther Form" }],
          formRefsRemove: [{ mode: "name", value: "Bear Form" }],
          filtersOverride: { whitelist: ["Bite"], blacklist: [] },
        },
      ],
    });

    const effective = getEffectiveConfig(targetUser);

    expect(getPlayerOverrideConfigMock).toHaveBeenCalledWith(targetUser);
    expect(effective.mappings).toEqual([
      {
        id: "map_1",
        trigger: { mode: "itemName", value: "Wildshape" },
        formRefs: [
          { mode: "name", value: "Wolf Form" },
          { mode: "name", value: "Panther Form" },
        ],
        filters: {
          whitelist: ["Bite"],
          blacklist: [...DEFAULT_WILDSHAPE_FILTERS.blacklist],
        },
      },
    ]);
  });
});
