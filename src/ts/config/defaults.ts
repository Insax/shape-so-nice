import { SCHEMA_VERSION } from "../constants";
import type { AbilityFilters, GlobalConfig, PlayerOverrideConfig } from "./types";

export const DEFAULT_WILDSHAPE_FILTERS: AbilityFilters = {
  whitelist: [
    "type:class",
    "type:background",
    "type:ancestry",
    "objectType:armor",
    "objectType:misc",
  ],
  blacklist: ["objectType:weapon"],
};

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  version: SCHEMA_VERSION,
  mappings: [],
  permissions: {
    playerOverrideEditors: [],
  },
  ui: {
    showDebugLogs: false,
    useChatFallback: true,
  },
};

export const DEFAULT_PLAYER_OVERRIDE_CONFIG: PlayerOverrideConfig = {
  version: SCHEMA_VERSION,
  mappings: [],
};
