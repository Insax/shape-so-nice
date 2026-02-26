import { id } from "../module.json";

export const MODULE_ID = id;
export const SCHEMA_VERSION = 1;

export const SETTINGS_KEYS = {
  GLOBAL_CONFIG: "globalConfig",
  GLOBAL_CONFIG_MENU: "globalConfigMenu",
  PLAYER_OVERRIDE_MENU: "playerOverrideMenu",
} as const;

export const FLAG_SCOPE = MODULE_ID;
export const LEGACY_FLAG_SCOPE = "wildshape" as const;

export const FLAG_KEYS = {
  PLAYER_OVERRIDE: "playerOverride",
  STATE: "state",
} as const;

export const MODULE_HOOKS = {
  ON_LEAVE_FORM: `${MODULE_ID}.onLeaveForm`,
  ON_ENTER_FORM: `${MODULE_ID}.onEnterForm`,
} as const;
