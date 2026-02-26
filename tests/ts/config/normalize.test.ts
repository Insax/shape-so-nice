import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@/ts/constants";
import {
  formRefKey,
  normalizeFilters,
  normalizeFormRef,
  normalizeFormRefList,
  normalizeGlobalConfig,
  normalizePlayerOverrideConfig,
  normalizeString,
  normalizeStringList,
} from "@/ts/config/normalize";

describe("normalize helpers", () => {
  it("normalizes strings and string lists", () => {
    expect(normalizeString("  Wildshape  ")).toBe("Wildshape");
    expect(normalizeStringList([" A ", "A", " ", "B"])).toEqual(["A", "B"]);
  });

  it("normalizes form refs and dedupes by normalized key", () => {
    expect(normalizeFormRef({ mode: "name", value: " Wolf Form " })).toEqual({
      mode: "name",
      value: "Wolf Form",
    });
    expect(
      normalizeFormRefList([
        { mode: "name", value: " Wolf Form " },
        { mode: "name", value: "wolf form" },
        { mode: "uuid", value: "  abc " },
      ])
    ).toEqual([
      { mode: "name", value: "wolf form" },
      { mode: "uuid", value: "abc" },
    ]);
    expect(formRefKey({ mode: "name", value: "Wolf Form" })).toBe("name:wolf form");
  });

  it("normalizes filter lists", () => {
    expect(
      normalizeFilters({
        whitelist: [" Bite ", "Bite", " "],
        blacklist: [" Dash ", "Dash"],
      })
    ).toEqual({
      whitelist: ["Bite"],
      blacklist: ["Dash"],
    });
  });

  it("normalizes global config and removes invalid mappings", () => {
    expect(
      normalizeGlobalConfig({
        version: SCHEMA_VERSION,
        mappings: [
          {
            id: " map_1 ",
            trigger: { mode: "itemName", value: " Wildshape " },
            formRefs: [{ mode: "name", value: " Wolf Form " }],
            defaultFilters: { whitelist: [" Bite "], blacklist: [] },
            formAbilityUuids: [" Actor.wolf-id.Item.bite-id ", "Actor.wolf-id.Item.bite-id"],
          },
          {
            id: " ",
            trigger: { mode: "itemName", value: " Wildshape " },
            formRefs: [{ mode: "name", value: "Wolf Form" }],
            defaultFilters: { whitelist: [], blacklist: [] },
          },
        ],
        permissions: { playerOverrideEditors: [" user-1 ", "user-1", " "] },
        ui: { showDebugLogs: true },
      })
    ).toEqual({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: { whitelist: ["Bite"], blacklist: ["type:weapon"] },
          formAbilityUuids: ["Actor.wolf-id.Item.bite-id"],
        },
      ],
      permissions: { playerOverrideEditors: ["user-1"] },
      ui: { showDebugLogs: true },
    });
  });

  it("normalizes player override config mappings and optional filters", () => {
    expect(
      normalizePlayerOverrideConfig({
        version: SCHEMA_VERSION,
        mappings: [
          {
            id: " map_1 ",
            formRefsAdd: [{ mode: "name", value: " Panther Form " }],
            formRefsRemove: [{ mode: "name", value: " Bear Form " }],
            filtersOverride: { whitelist: [" Bite "], blacklist: [" Dash "] },
          },
          {
            id: " ",
            formRefsAdd: [],
            formRefsRemove: [],
          },
        ],
      })
    ).toEqual({
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

    expect(
      normalizePlayerOverrideConfig({
        version: SCHEMA_VERSION,
        mappings: [{ id: "map_2", formRefsAdd: [], formRefsRemove: [] }],
      })
    ).toEqual({
      version: SCHEMA_VERSION,
      mappings: [{ id: "map_2", formRefsAdd: [], formRefsRemove: [] }],
    });
  });
});
