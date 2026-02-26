import { FLAG_KEYS, LEGACY_FLAG_SCOPE, MODULE_ID, SCHEMA_VERSION } from "../constants";
import { logInfo, logWarning } from "../core/logger";
import { isRecord } from "../utils/typeGuards";
import { DEFAULT_PLAYER_OVERRIDE_CONFIG } from "./defaults";
import { migratePlayerOverrideConfigToCurrentSchema } from "./migrations";
import { normalizePlayerOverrideConfig } from "./normalize";
import { getGlobalConfig } from "./settings";
import type { PlayerOverrideConfig } from "./types";
import { isPlayerOverrideConfig } from "./validation";

function cloneDefaultPlayerOverrideConfig(): PlayerOverrideConfig {
  return foundry.utils.deepClone(DEFAULT_PLAYER_OVERRIDE_CONFIG);
}

function getCurrentUser(): User | null {
  return (game as Game).user ?? null;
}

function resolveTargetUser(targetUser?: User): User | null {
  return targetUser ?? getCurrentUser();
}

function getLegacyPlayerOverrideFlag(user: User): unknown {
  const rawFlags = (user as unknown as { flags?: unknown }).flags;
  if (!isRecord(rawFlags)) {
    return null;
  }

  const legacyScopedFlags = rawFlags[LEGACY_FLAG_SCOPE];
  if (!isRecord(legacyScopedFlags)) {
    return null;
  }

  return legacyScopedFlags[FLAG_KEYS.PLAYER_OVERRIDE] ?? null;
}

export function canCurrentUserEditPlayerOverride(targetUser: User): boolean {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return false;
  }

  if (currentUser.isGM) {
    return true;
  }

  const currentUserId = currentUser.id;
  const targetUserId = targetUser.id;
  if (!currentUserId || !targetUserId) {
    return false;
  }

  if (currentUserId !== targetUserId) {
    return false;
  }

  const globalConfig = getGlobalConfig();
  return globalConfig.permissions.playerOverrideEditors.includes(currentUserId);
}

export function getPlayerOverrideConfig(targetUser?: User): PlayerOverrideConfig {
  const user = resolveTargetUser(targetUser);
  if (!user) {
    logWarning("wildshape.playerOverride.missingUser");
    return cloneDefaultPlayerOverrideConfig();
  }

  const rawConfig =
    user.getFlag(MODULE_ID, FLAG_KEYS.PLAYER_OVERRIDE) ??
    getLegacyPlayerOverrideFlag(user);
  if (rawConfig == null) {
    return cloneDefaultPlayerOverrideConfig();
  }

  const migration = migratePlayerOverrideConfigToCurrentSchema(rawConfig);
  if (!migration.config) {
    logWarning("wildshape.playerOverride.invalidPayload", {
      userId: user.id,
      payload: rawConfig,
    });
    return cloneDefaultPlayerOverrideConfig();
  }

  if (migration.migrated) {
    const canPersistMigration = canCurrentUserEditPlayerOverride(user);
    if (canPersistMigration) {
      void user
        .setFlag(
          MODULE_ID,
          FLAG_KEYS.PLAYER_OVERRIDE,
          normalizePlayerOverrideConfig(migration.config)
        )
        .catch((error: unknown) => {
          logWarning("wildshape.playerOverride.migration.persistFailed", {
            userId: user.id ?? null,
            fromVersion: migration.fromVersion,
            toVersion: SCHEMA_VERSION,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }

    logInfo("wildshape.playerOverride.migration.applied", {
      userId: user.id ?? null,
      fromVersion: migration.fromVersion,
      toVersion: SCHEMA_VERSION,
      persisted: canPersistMigration,
    });
  }

  return normalizePlayerOverrideConfig(migration.config);
}

export async function setPlayerOverrideConfig(
  value: unknown,
  targetUser?: User
): Promise<void> {
  const user = resolveTargetUser(targetUser);
  if (!user) {
    throw new Error("No target user available for player override update.");
  }

  if (!canCurrentUserEditPlayerOverride(user)) {
    throw new Error("Current user is not allowed to edit this player override.");
  }

  if (!isPlayerOverrideConfig(value)) {
    throw new Error("Invalid player override config payload.");
  }

  await user.setFlag(
    MODULE_ID,
    FLAG_KEYS.PLAYER_OVERRIDE,
    normalizePlayerOverrideConfig(value)
  );
}
