import { MODULE_ID, SETTINGS_KEYS } from "../constants";
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

      console.warn(`[${MODULE_ID}] Invalid global config detected after update.`, rawConfig);
    },
  });
}

export function getGlobalConfig(): GlobalConfig {
  const rawConfig = (game as Game).settings.get(MODULE_ID, SETTINGS_KEYS.GLOBAL_CONFIG);
  if (isGlobalConfig(rawConfig)) {
    return normalizeGlobalConfig(rawConfig);
  }

  console.warn(`[${MODULE_ID}] Falling back to default global config due to invalid setting.`, rawConfig);
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
