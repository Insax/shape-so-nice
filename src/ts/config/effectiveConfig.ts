import { mergeEffectiveConfig } from "./merge";
import { getPlayerOverrideConfig } from "./playerOverride";
import { getGlobalConfig } from "./settings";
import type { EffectiveConfig } from "./types";

export function getEffectiveConfig(targetUser?: User): EffectiveConfig {
  return mergeEffectiveConfig(getGlobalConfig(), getPlayerOverrideConfig(targetUser));
}
