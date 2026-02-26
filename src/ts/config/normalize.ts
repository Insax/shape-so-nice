import { DEFAULT_GLOBAL_CONFIG, DEFAULT_WILDSHAPE_FILTERS } from "./defaults";
import type {
  AbilityFilters,
  FormRef,
  GlobalConfig,
  PlayerOverrideConfig,
} from "./types";

export function normalizeString(value: string): string {
  return value.trim();
}

export function normalizeStringList(values: string[]): string[] {
  const dedupe = new Set<string>();
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized) {
      continue;
    }
    dedupe.add(normalized);
  }
  return [...dedupe];
}

export function normalizeFormRef(formRef: FormRef): FormRef {
  return {
    mode: formRef.mode,
    value: normalizeString(formRef.value),
  };
}

export function normalizeFormRefList(formRefs: FormRef[]): FormRef[] {
  const dedupeRefs = new Map<string, FormRef>();
  for (const formRef of formRefs) {
    const normalizedRef = normalizeFormRef(formRef);
    const key = formRefKey(normalizedRef);
    dedupeRefs.set(key, normalizedRef);
  }
  return [...dedupeRefs.values()];
}

export function normalizeFilters(filters: AbilityFilters): AbilityFilters {
  return {
    whitelist: normalizeStringList(filters.whitelist),
    blacklist: normalizeStringList(filters.blacklist),
  };
}

function normalizeFiltersWithDefaults(filters: AbilityFilters): AbilityFilters {
  const normalized = normalizeFilters(filters);
  return {
    whitelist:
      normalized.whitelist.length > 0
        ? normalized.whitelist
        : [...DEFAULT_WILDSHAPE_FILTERS.whitelist],
    blacklist:
      normalized.blacklist.length > 0
        ? normalized.blacklist
        : [...DEFAULT_WILDSHAPE_FILTERS.blacklist],
  };
}

export function normalizeGlobalConfig(config: GlobalConfig): GlobalConfig {
  return {
    version: config.version,
    mappings: config.mappings
      .map((mapping) => {
        const formAbilityUuids = normalizeStringList(mapping.formAbilityUuids ?? []);
        return {
          id: normalizeString(mapping.id),
          trigger: {
            mode: "itemName" as const,
            value: normalizeString(mapping.trigger.value),
          },
          formRefs: normalizeFormRefList(mapping.formRefs),
          defaultFilters: normalizeFiltersWithDefaults(mapping.defaultFilters),
          ...(formAbilityUuids.length > 0 ? { formAbilityUuids } : {}),
        };
      })
      .filter(
        (mapping) =>
          mapping.id.length > 0 &&
          mapping.trigger.value.length > 0 &&
          mapping.formRefs.length > 0
      ),
    permissions: {
      playerOverrideEditors: normalizeStringList(config.permissions.playerOverrideEditors),
    },
    ui: {
      showDebugLogs: config.ui.showDebugLogs,
      useChatFallback:
        typeof config.ui.useChatFallback === "boolean"
          ? config.ui.useChatFallback
          : (DEFAULT_GLOBAL_CONFIG.ui.useChatFallback ?? true),
    },
  };
}

export function normalizePlayerOverrideConfig(
  config: PlayerOverrideConfig
): PlayerOverrideConfig {
  return {
    version: config.version,
    mappings: config.mappings
      .map((mapping) => ({
        id: normalizeString(mapping.id),
        formRefsAdd: normalizeFormRefList(mapping.formRefsAdd),
        formRefsRemove: normalizeFormRefList(mapping.formRefsRemove),
        filtersOverride: mapping.filtersOverride
          ? normalizeFilters(mapping.filtersOverride)
          : undefined,
      }))
      .filter((mapping) => mapping.id.length > 0),
  };
}

export function formRefKey(formRef: FormRef): string {
  return formRef.mode === "name"
    ? `${formRef.mode}:${formRef.value.toLowerCase()}`
    : `${formRef.mode}:${formRef.value}`;
}
