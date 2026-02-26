import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@/ts/constants";
import type { GlobalConfig, PlayerOverrideConfig } from "@/ts/config/types";
import { isGlobalConfig, isPlayerOverrideConfig } from "@/ts/config/validation";

function validConfig(): GlobalConfig {
  return {
    version: SCHEMA_VERSION,
    mappings: [
      {
        id: "map-1",
        trigger: { mode: "itemName", value: "Wildshape" },
        formRefs: [
          { mode: "uuid", value: "wolf-id" },
          { mode: "name", value: "Bear Form" },
        ],
        defaultFilters: {
          whitelist: ["Claw"],
          blacklist: ["Dash"],
        },
      },
    ],
    permissions: {
      playerOverrideEditors: ["user-1"],
    },
    ui: {
      showDebugLogs: true,
    },
  };
}

describe("isGlobalConfig", () => {
  it("accepts valid config payloads", () => {
    expect(isGlobalConfig(validConfig())).toBe(true);
    expect(
      isGlobalConfig({
        ...validConfig(),
      })
    ).toBe(true);
  });

  it("rejects unsupported schema version", () => {
    expect(
      isGlobalConfig({
        ...validConfig(),
        version: SCHEMA_VERSION + 1,
      })
    ).toBe(false);
  });

  it("rejects invalid trigger shape", () => {
    const candidate = validConfig();
    candidate.mappings[0].trigger = { mode: "itemName", value: "" };

    // Empty values are allowed by validator and handled during normalization.
    expect(isGlobalConfig(candidate)).toBe(true);

    expect(
      isGlobalConfig({
        ...validConfig(),
        mappings: [
          {
            ...validConfig().mappings[0],
            trigger: { mode: "itemId", value: "abc" },
          },
        ],
      })
    ).toBe(false);
  });

  it("rejects invalid form references", () => {
    expect(
      isGlobalConfig({
        ...validConfig(),
      })
    ).toBe(true);

    expect(
      isGlobalConfig({
        ...validConfig(),
        mappings: [
          {
            ...validConfig().mappings[0],
            formRefs: [{ mode: "uuid", value: " " }],
          },
        ],
      })
    ).toBe(false);

    expect(
      isGlobalConfig({
        ...validConfig(),
        mappings: [
          {
            ...validConfig().mappings[0],
            formRefs: [{ mode: "name", value: "" }],
          },
        ],
      })
    ).toBe(false);
  });

  it("rejects malformed mapping structures", () => {
    expect(
      isGlobalConfig({
        ...validConfig(),
        mappings: [null] as unknown as GlobalConfig["mappings"],
      })
    ).toBe(false);

    expect(
      isGlobalConfig({
        ...validConfig(),
        mappings: [
          {
            ...validConfig().mappings[0],
            trigger: null,
          },
        ] as unknown as GlobalConfig["mappings"],
      })
    ).toBe(false);

    expect(
      isGlobalConfig({
        ...validConfig(),
        mappings: [
          {
            ...validConfig().mappings[0],
            formRefs: [null],
          },
        ] as unknown as GlobalConfig["mappings"],
      })
    ).toBe(false);

    expect(
      isGlobalConfig({
        ...validConfig(),
        mappings: [
          {
            ...validConfig().mappings[0],
            defaultFilters: null,
          },
        ] as unknown as GlobalConfig["mappings"],
      })
    ).toBe(false);
  });

  it("rejects non-string list values in filters and permissions", () => {
    expect(
      isGlobalConfig({
        ...validConfig(),
        mappings: [
          {
            ...validConfig().mappings[0],
            defaultFilters: { whitelist: ["Bite"], blacklist: [7] as unknown as string[] },
          },
        ],
      })
    ).toBe(false);

    expect(
      isGlobalConfig({
        ...validConfig(),
        mappings: [
          {
            ...validConfig().mappings[0],
            formAbilityUuids: ["Actor.a.Item.b", 7] as unknown as string[],
          },
        ],
      })
    ).toBe(false);

    expect(
      isGlobalConfig({
        ...validConfig(),
        permissions: { playerOverrideEditors: ["user-1", 2] as unknown as string[] },
      })
    ).toBe(false);
  });

  it("rejects invalid ui config", () => {
    expect(
      isGlobalConfig({
        ...validConfig(),
        ui: { showDebugLogs: "yes" } as unknown as GlobalConfig["ui"],
      })
    ).toBe(false);
  });

  it("rejects non-object values", () => {
    expect(isGlobalConfig(null)).toBe(false);
    expect(isGlobalConfig("config")).toBe(false);
  });
});

function validPlayerOverride(): PlayerOverrideConfig {
  return {
    version: SCHEMA_VERSION,
    mappings: [
      {
        id: "map_1",
        formRefsAdd: [{ mode: "name", value: "Panther Form" }],
        formRefsRemove: [{ mode: "name", value: "Bear Form" }],
        filtersOverride: {
          whitelist: ["Bite"],
          blacklist: ["Dash"],
        },
      },
    ],
  };
}

describe("isPlayerOverrideConfig", () => {
  it("accepts valid player override payloads", () => {
    expect(isPlayerOverrideConfig(validPlayerOverride())).toBe(true);
    expect(
      isPlayerOverrideConfig({
        version: SCHEMA_VERSION,
        mappings: [
          {
            id: "map_2",
            formRefsAdd: [],
            formRefsRemove: [],
          },
        ],
      })
    ).toBe(true);
  });

  it("rejects malformed player override payloads", () => {
    expect(isPlayerOverrideConfig(null)).toBe(false);
    expect(
      isPlayerOverrideConfig({
        ...validPlayerOverride(),
        version: SCHEMA_VERSION + 1,
      })
    ).toBe(false);
    expect(
      isPlayerOverrideConfig({
        ...validPlayerOverride(),
        mappings: [null],
      } as unknown as PlayerOverrideConfig)
    ).toBe(false);
    expect(
      isPlayerOverrideConfig({
        ...validPlayerOverride(),
        mappings: [
          {
            ...validPlayerOverride().mappings[0],
            id: " ",
          },
        ],
      })
    ).toBe(false);
    expect(
      isPlayerOverrideConfig({
        ...validPlayerOverride(),
        mappings: [
          {
            ...validPlayerOverride().mappings[0],
            formRefsAdd: [null],
            formRefsRemove: [],
          },
        ] as unknown as PlayerOverrideConfig["mappings"],
      })
    ).toBe(false);
    expect(
      isPlayerOverrideConfig({
        ...validPlayerOverride(),
        mappings: [
          {
            ...validPlayerOverride().mappings[0],
            formRefsRemove: [null],
          },
        ] as unknown as PlayerOverrideConfig["mappings"],
      })
    ).toBe(false);
    expect(
      isPlayerOverrideConfig({
        ...validPlayerOverride(),
        mappings: [
          {
            ...validPlayerOverride().mappings[0],
            filtersOverride: { whitelist: ["ok"], blacklist: [5] },
          },
        ] as unknown as PlayerOverrideConfig["mappings"],
      })
    ).toBe(false);
  });
});
