export type FormRefMode = "uuid" | "name";

export interface FormRef {
  mode: FormRefMode;
  value: string;
}

export interface AbilityFilters {
  whitelist: string[];
  blacklist: string[];
}

export interface MappingTrigger {
  mode: "itemName";
  value: string;
}

export interface WildshapeMapping {
  id: string;
  trigger: MappingTrigger;
  formRefs: FormRef[];
  defaultFilters: AbilityFilters;
  formAbilityUuids?: string[];
}

export interface PlayerOverrideMapping {
  id: string;
  formRefsAdd: FormRef[];
  formRefsRemove: FormRef[];
  filtersOverride?: AbilityFilters;
}

export interface PlayerOverrideConfig {
  version: number;
  mappings: PlayerOverrideMapping[];
}

export interface GlobalConfigPermissions {
  playerOverrideEditors: string[];
}

export interface GlobalConfigUi {
  showDebugLogs: boolean;
  useChatFallback?: boolean;
}

export interface GlobalConfig {
  version: number;
  mappings: WildshapeMapping[];
  permissions: GlobalConfigPermissions;
  ui: GlobalConfigUi;
}

export interface EffectiveMapping {
  id: string;
  trigger: MappingTrigger;
  formRefs: FormRef[];
  filters: AbilityFilters;
  formAbilityUuids?: string[];
}

export interface EffectiveConfig {
  version: number;
  mappings: EffectiveMapping[];
  permissions: GlobalConfigPermissions;
  ui: GlobalConfigUi;
}
