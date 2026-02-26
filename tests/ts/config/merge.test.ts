import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@/ts/constants";
import { DEFAULT_WILDSHAPE_FILTERS } from "@/ts/config/defaults";
import type { GlobalConfig, PlayerOverrideConfig } from "@/ts/config/types";
import { mergeEffectiveConfig } from "@/ts/config/merge";

function globalConfig(): GlobalConfig {
  return {
    version: SCHEMA_VERSION,
    mappings: [
      {
        id: "map_1",
        trigger: { mode: "itemName", value: "Wildshape" },
        formRefs: [
          { mode: "name", value: "Wolf Form" },
          { mode: "name", value: "Bear Form" },
        ],
        defaultFilters: {
          whitelist: ["Claw"],
          blacklist: ["Dash"],
        },
        formAbilityUuids: ["Actor.wolf-id.Item.bite-id"],
      },
      {
        id: "map_2",
        trigger: { mode: "itemName", value: "Elemental Shape" },
        formRefs: [{ mode: "name", value: "Air Elemental" }],
        defaultFilters: {
          whitelist: [],
          blacklist: [],
        },
      },
    ],
    permissions: { playerOverrideEditors: ["user-1"] },
    ui: { showDebugLogs: false },
  };
}

describe("mergeEffectiveConfig", () => {
  it("returns global mapping data when no override mapping exists", () => {
    const override: PlayerOverrideConfig = { version: SCHEMA_VERSION, mappings: [] };
    const merged = mergeEffectiveConfig(globalConfig(), override);

    expect(merged.mappings).toEqual([
      {
        id: "map_1",
        trigger: { mode: "itemName", value: "Wildshape" },
        formRefs: [
          { mode: "name", value: "Wolf Form" },
          { mode: "name", value: "Bear Form" },
        ],
        filters: { whitelist: ["Claw"], blacklist: ["Dash"] },
        formAbilityUuids: ["Actor.wolf-id.Item.bite-id"],
      },
      {
        id: "map_2",
        trigger: { mode: "itemName", value: "Elemental Shape" },
        formRefs: [{ mode: "name", value: "Air Elemental" }],
        filters: {
          whitelist: [...DEFAULT_WILDSHAPE_FILTERS.whitelist],
          blacklist: [...DEFAULT_WILDSHAPE_FILTERS.blacklist],
        },
      },
    ]);
  });

  it("applies remove/add refs and filter override by mapping id", () => {
    const merged = mergeEffectiveConfig(globalConfig(), {
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

    expect(merged.mappings[0]).toEqual({
      id: "map_1",
      trigger: { mode: "itemName", value: "Wildshape" },
      formRefs: [
        { mode: "name", value: "Wolf Form" },
        { mode: "name", value: "Panther Form" },
      ],
      filters: { whitelist: ["Bite"], blacklist: ["Dash"] },
      formAbilityUuids: ["Actor.wolf-id.Item.bite-id"],
    });
  });

  it("dedupes refs by normalized key and ignores unknown override ids", () => {
    const merged = mergeEffectiveConfig(globalConfig(), {
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          formRefsAdd: [
            { mode: "name", value: "wolf form" },
            { mode: "uuid", value: "custom-id" },
          ],
          formRefsRemove: [],
        },
        {
          id: "map_missing",
          formRefsAdd: [{ mode: "name", value: "Ghost Form" }],
          formRefsRemove: [],
        },
      ],
    });

    expect(merged.mappings[0].formRefs).toEqual([
      { mode: "name", value: "wolf form" },
      { mode: "name", value: "Bear Form" },
      { mode: "uuid", value: "custom-id" },
    ]);
    expect(merged.mappings[0].formAbilityUuids).toEqual(["Actor.wolf-id.Item.bite-id"]);
    expect(merged.mappings).toHaveLength(2);
  });
});
