import { MODULE_ID, SCHEMA_VERSION, SETTINGS_KEYS } from "../constants";
import { logInfo, logWarning } from "../core/logger";
import { migrateGlobalConfigToCurrentSchema } from "./migrations";
import { DEFAULT_GLOBAL_CONFIG } from "./defaults";
import { normalizeGlobalConfig } from "./normalize";
import type { GlobalConfig } from "./types";
import { isGlobalConfig } from "./validation";

function cloneDefaultGlobalConfig(): GlobalConfig {
  return foundry.utils.deepClone(DEFAULT_GLOBAL_CONFIG);
}

export function registerGlobalSettings(): void {
  (game as Game).settings.register(MODULE_ID, SETTINGS_KEYS.GLOBAL_CONFIG, {
    name: "WILDSHAPE.settings.globalConfig.name",
    hint: "WILDSHAPE.settings.globalConfig.hint",
    scope: "world",
    config: false,
    type: Object,
    default: cloneDefaultGlobalConfig(),
    onChange: (rawConfig: unknown): void => {
      if (isGlobalConfig(rawConfig)) {
        return;
      }

      logWarning("wildshape.settings.invalidGlobalConfig.onChange", {
        payload: rawConfig,
      });
    },
  });
}

export function getGlobalConfig(): GlobalConfig {
  const rawConfig = (game as Game).settings.get(MODULE_ID, SETTINGS_KEYS.GLOBAL_CONFIG);
  const migration = migrateGlobalConfigToCurrentSchema(rawConfig);
  if (migration.config) {
    if (migration.migrated) {
      const canPersistMigration = (game as Game).user?.isGM === true;
      if (canPersistMigration) {
        void (game as Game).settings
          .set(
            MODULE_ID,
            SETTINGS_KEYS.GLOBAL_CONFIG,
            normalizeGlobalConfig(migration.config)
          )
          .catch((error: unknown) => {
            logWarning("wildshape.settings.migration.persistFailed", {
              scope: "globalConfig",
              fromVersion: migration.fromVersion,
              toVersion: SCHEMA_VERSION,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }

      logInfo("wildshape.settings.migration.applied", {
        scope: "globalConfig",
        fromVersion: migration.fromVersion,
        toVersion: SCHEMA_VERSION,
        persisted: canPersistMigration,
      });
    }

    return normalizeGlobalConfig(migration.config);
  }

  logWarning("wildshape.settings.invalidGlobalConfig.read", {
    payload: rawConfig,
  });
  return cloneDefaultGlobalConfig();
}

export async function setGlobalConfig(value: unknown): Promise<void> {
  if (!(game as Game).user?.isGM) {
    throw new Error("Only GMs can update global wildshape config.");
  }

  if (!isGlobalConfig(value)) {
    throw new Error("Invalid global wildshape config payload.");
  }

  await (game as Game).settings.set(
    MODULE_ID,
    SETTINGS_KEYS.GLOBAL_CONFIG,
    normalizeGlobalConfig(value)
  );
}
