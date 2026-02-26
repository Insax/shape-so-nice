import { DEFAULT_WILDSHAPE_FILTERS } from "./defaults";
import { formRefKey } from "./normalize";
import type {
  AbilityFilters,
  EffectiveConfig,
  FormRef,
  GlobalConfig,
  PlayerOverrideConfig,
} from "./types";

function mergeFormRefs(
  globalRefs: FormRef[],
  refsToRemove: FormRef[],
  refsToAdd: FormRef[]
): FormRef[] {
  const removeKeys = new Set<string>(refsToRemove.map((formRef) => formRefKey(formRef)));
  const mergedMap = new Map<string, FormRef>();

  for (const formRef of globalRefs) {
    const key = formRefKey(formRef);
    if (removeKeys.has(key)) {
      continue;
    }
    mergedMap.set(key, formRef);
  }

  for (const formRef of refsToAdd) {
    mergedMap.set(formRefKey(formRef), formRef);
  }

  return [...mergedMap.values()];
}

function applyDefaultFilters(filters: AbilityFilters): AbilityFilters {
  return {
    whitelist:
      filters.whitelist.length > 0
        ? [...filters.whitelist]
        : [...DEFAULT_WILDSHAPE_FILTERS.whitelist],
    blacklist:
      filters.blacklist.length > 0
        ? [...filters.blacklist]
        : [...DEFAULT_WILDSHAPE_FILTERS.blacklist],
  };
}

function cloneFormAbilityUuids(formAbilityUuids?: string[]): string[] | undefined {
  if (!formAbilityUuids || formAbilityUuids.length === 0) {
    return undefined;
  }

  return [...formAbilityUuids];
}

export function mergeEffectiveConfig(
  globalConfig: GlobalConfig,
  playerOverride: PlayerOverrideConfig
): EffectiveConfig {
  const overridesById = new Map(
    playerOverride.mappings.map((mapping) => [mapping.id, mapping] as const)
  );

  return {
    version: globalConfig.version,
    mappings: globalConfig.mappings.map((globalMapping) => {
      const overrideMapping = overridesById.get(globalMapping.id);
      if (!overrideMapping) {
        const formAbilityUuids = cloneFormAbilityUuids(globalMapping.formAbilityUuids);
        return {
          id: globalMapping.id,
          trigger: globalMapping.trigger,
          formRefs: globalMapping.formRefs,
          filters: applyDefaultFilters(globalMapping.defaultFilters),
          ...(formAbilityUuids ? { formAbilityUuids } : {}),
        };
      }

      const formAbilityUuids = cloneFormAbilityUuids(globalMapping.formAbilityUuids);
      return {
        id: globalMapping.id,
        trigger: globalMapping.trigger,
        formRefs: mergeFormRefs(
          globalMapping.formRefs,
          overrideMapping.formRefsRemove,
          overrideMapping.formRefsAdd
        ),
        filters: applyDefaultFilters(overrideMapping.filtersOverride ?? globalMapping.defaultFilters),
        ...(formAbilityUuids ? { formAbilityUuids } : {}),
      };
    }),
    permissions: globalConfig.permissions,
    ui: globalConfig.ui,
  };
}
