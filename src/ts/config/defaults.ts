import { SCHEMA_VERSION } from "../constants";
import type { AbilityFilters, GlobalConfig, PlayerOverrideConfig } from "./types";

export const DEFAULT_WILDSHAPE_FILTERS: AbilityFilters = {
  whitelist: [
    "type:class",
    "type:background",
    "type:ancestry",
    "type:armor",
    "type:miscellaneous",
  ],
  blacklist: ["type:weapon"],
};

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  version: SCHEMA_VERSION,
  mappings: [],
  permissions: {
    playerOverrideEditors: [],
  },
  ui: {
    showDebugLogs: false,
  },
};

export const DEFAULT_PLAYER_OVERRIDE_CONFIG: PlayerOverrideConfig = {
  version: SCHEMA_VERSION,
  mappings: [],
};
