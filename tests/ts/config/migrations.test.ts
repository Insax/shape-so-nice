import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@/ts/constants";
import {
  migrateGlobalConfigToCurrentSchema,
  migratePlayerOverrideConfigToCurrentSchema,
} from "@/ts/config/migrations";

describe("config migrations", () => {
  it("returns existing valid global config without migration", () => {
    const raw = {
      version: SCHEMA_VERSION,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false, useChatFallback: true },
    };

    expect(migrateGlobalConfigToCurrentSchema(raw)).toEqual({
      config: raw,
      migrated: false,
      fromVersion: SCHEMA_VERSION,
    });
  });

  it("migrates legacy global config with missing version", () => {
    const result = migrateGlobalConfigToCurrentSchema({
      mappings: [],
      permissions: { playerOverrideEditors: ["user-1"] },
      ui: { showDebugLogs: true },
    });

    expect(result).toEqual({
      config: {
        version: SCHEMA_VERSION,
        mappings: [],
        permissions: { playerOverrideEditors: ["user-1"] },
        ui: { showDebugLogs: true, useChatFallback: true },
      },
      migrated: true,
      fromVersion: null,
    });
  });

  it("does not migrate unrelated global config payloads", () => {
    expect(migrateGlobalConfigToCurrentSchema(null)).toEqual({
      config: null,
      migrated: false,
      fromVersion: null,
    });
    expect(migrateGlobalConfigToCurrentSchema({ invalid: true })).toEqual({
      config: null,
      migrated: false,
      fromVersion: null,
    });
  });

  it("rejects unsupported future global config versions", () => {
    expect(
      migrateGlobalConfigToCurrentSchema({
        version: SCHEMA_VERSION + 1,
        mappings: [],
        permissions: { playerOverrideEditors: [] },
        ui: { showDebugLogs: false },
      })
    ).toEqual({
      config: null,
      migrated: false,
      fromVersion: SCHEMA_VERSION + 1,
    });
  });

  it("rejects malformed legacy global config candidates", () => {
    expect(
      migrateGlobalConfigToCurrentSchema({
        version: 0,
        mappings: [null],
      })
    ).toEqual({
      config: null,
      migrated: false,
      fromVersion: 0,
    });
  });

  it("returns existing valid player override config without migration", () => {
    const raw = {
      version: SCHEMA_VERSION,
      mappings: [],
    };

    expect(migratePlayerOverrideConfigToCurrentSchema(raw)).toEqual({
      config: raw,
      migrated: false,
      fromVersion: SCHEMA_VERSION,
    });
  });

  it("migrates legacy player override config with missing version", () => {
    expect(
      migratePlayerOverrideConfigToCurrentSchema({
        mappings: [],
      })
    ).toEqual({
      config: {
        version: SCHEMA_VERSION,
        mappings: [],
      },
      migrated: true,
      fromVersion: null,
    });
  });

  it("does not migrate unrelated player override payloads", () => {
    expect(migratePlayerOverrideConfigToCurrentSchema(null)).toEqual({
      config: null,
      migrated: false,
      fromVersion: null,
    });
    expect(migratePlayerOverrideConfigToCurrentSchema({ invalid: true })).toEqual({
      config: null,
      migrated: false,
      fromVersion: null,
    });
  });

  it("rejects unsupported future player override versions", () => {
    expect(
      migratePlayerOverrideConfigToCurrentSchema({
        version: SCHEMA_VERSION + 1,
        mappings: [],
      })
    ).toEqual({
      config: null,
      migrated: false,
      fromVersion: SCHEMA_VERSION + 1,
    });
  });

  it("rejects malformed legacy player override candidates", () => {
    expect(
      migratePlayerOverrideConfigToCurrentSchema({
        version: 0,
        mappings: [null],
      })
    ).toEqual({
      config: null,
      migrated: false,
      fromVersion: 0,
    });
  });
});
