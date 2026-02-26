import { SCHEMA_VERSION } from "../constants";
import { isRecord } from "../utils/typeGuards";
import { DEFAULT_GLOBAL_CONFIG, DEFAULT_PLAYER_OVERRIDE_CONFIG } from "./defaults";
import type { GlobalConfig, PlayerOverrideConfig } from "./types";
import { isGlobalConfig, isPlayerOverrideConfig } from "./validation";

interface MigrationResult<T> {
  config: T | null;
  migrated: boolean;
  fromVersion: number | null;
}

function resolveVersion(rawConfig: unknown): number | null {
  if (!isRecord(rawConfig)) {
    return null;
  }

  const version = rawConfig["version"];
  return typeof version === "number" ? version : null;
}

export function migrateGlobalConfigToCurrentSchema(rawConfig: unknown): MigrationResult<GlobalConfig> {
  if (isGlobalConfig(rawConfig)) {
    return { config: rawConfig, migrated: false, fromVersion: SCHEMA_VERSION };
  }

  if (!isRecord(rawConfig)) {
    return { config: null, migrated: false, fromVersion: null };
  }

  const sourceVersion = resolveVersion(rawConfig);
  if (sourceVersion !== null && sourceVersion !== 0) {
    return { config: null, migrated: false, fromVersion: sourceVersion };
  }
  if (
    sourceVersion === null &&
    !("mappings" in rawConfig) &&
    !("permissions" in rawConfig) &&
    !("ui" in rawConfig)
  ) {
    return { config: null, migrated: false, fromVersion: null };
  }

  const ui = isRecord(rawConfig["ui"]) ? rawConfig["ui"] : {};
  const permissions = isRecord(rawConfig["permissions"]) ? rawConfig["permissions"] : {};
  const candidate: GlobalConfig = {
    version: SCHEMA_VERSION,
    mappings: Array.isArray(rawConfig["mappings"]) ? (rawConfig["mappings"] as GlobalConfig["mappings"]) : [],
    permissions: {
      playerOverrideEditors: Array.isArray(permissions["playerOverrideEditors"])
        ? (permissions["playerOverrideEditors"] as string[])
        : [...DEFAULT_GLOBAL_CONFIG.permissions.playerOverrideEditors],
    },
    ui: {
      showDebugLogs:
        typeof ui["showDebugLogs"] === "boolean"
          ? ui["showDebugLogs"]
          : DEFAULT_GLOBAL_CONFIG.ui.showDebugLogs,
      useChatFallback:
        typeof ui["useChatFallback"] === "boolean"
          ? ui["useChatFallback"]
          : DEFAULT_GLOBAL_CONFIG.ui.useChatFallback,
    },
  };

  if (!isGlobalConfig(candidate)) {
    return { config: null, migrated: false, fromVersion: sourceVersion };
  }

  return {
    config: candidate,
    migrated: true,
    fromVersion: sourceVersion,
  };
}

export function migratePlayerOverrideConfigToCurrentSchema(
  rawConfig: unknown
): MigrationResult<PlayerOverrideConfig> {
  if (isPlayerOverrideConfig(rawConfig)) {
    return { config: rawConfig, migrated: false, fromVersion: SCHEMA_VERSION };
  }

  if (!isRecord(rawConfig)) {
    return { config: null, migrated: false, fromVersion: null };
  }

  const sourceVersion = resolveVersion(rawConfig);
  if (sourceVersion !== null && sourceVersion !== 0) {
    return { config: null, migrated: false, fromVersion: sourceVersion };
  }
  if (sourceVersion === null && !("mappings" in rawConfig)) {
    return { config: null, migrated: false, fromVersion: null };
  }

  const candidate: PlayerOverrideConfig = {
    version: SCHEMA_VERSION,
    mappings: Array.isArray(rawConfig["mappings"])
      ? (rawConfig["mappings"] as PlayerOverrideConfig["mappings"])
      : [...DEFAULT_PLAYER_OVERRIDE_CONFIG.mappings],
  };

  if (!isPlayerOverrideConfig(candidate)) {
    return { config: null, migrated: false, fromVersion: sourceVersion };
  }

  return {
    config: candidate,
    migrated: true,
    fromVersion: sourceVersion,
  };
}
