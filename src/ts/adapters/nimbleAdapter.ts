import { getEffectiveConfig } from "../config/effectiveConfig";
import { normalizeString } from "../config/normalize";
import { FLAG_SCOPE, LEGACY_FLAG_SCOPE } from "../constants";
import type { ActorSnapshot, TransformPlan, WildshapeAdapter } from "./types";
import { isRecord } from "../utils/typeGuards";

const KEEP_SYSTEM_ROOT_KEYS = [
  "hp",
  "mana",
  "wounds",
  "resources",
  "level",
  "classData",
  "levelUpHistory",
  "abilities",
  "defenses",
  "saves",
  "skills",
  "gear",
  "inventory",
] as const;

const KEEP_SYSTEM_ATTRIBUTE_KEYS = [
  "hp",
  "mana",
  "wounds",
  "resources",
  "level",
  "hitDice",
  "bonusHitDice",
  "armor",
  "abilities",
  "defenses",
  "saves",
  "skills",
] as const;

const FORM_TOKEN_KEYS = [
  "img",
  "texture",
  "width",
  "height",
  "scale",
  "sight",
  "vision",
  "light",
  "dimSight",
  "brightSight",
  "dimLight",
  "brightLight",
  "detectionModes",
] as const;

const DIRECT_ITEM_USE_WRAP_FLAG = "__shapeSoNiceWildshapeWrappedActivate";
const DIRECT_ITEM_USE_DEPTH_FLAG = "__shapeSoNiceWildshapeActivateDepth";
const NIMBLE_ITEM_USE_HOOKS = [
  "useItem",
  "itemUse",
  "itemUsageComplete",
] as const;

interface ItemDocumentClassRef {
  prototype?: Record<string, unknown>;
}

function getNimbleItemDocumentClasses(): ItemDocumentClassRef[] {
  const configRef = (globalThis as {
    CONFIG?: {
      Item?: {
        documentClasses?: unknown;
      };
    };
  }).CONFIG;
  const documentClasses = configRef?.Item?.documentClasses;
  if (!isRecord(documentClasses)) {
    return [];
  }

  return Object.values(documentClasses).filter((itemClassRef): itemClassRef is ItemDocumentClassRef => {
    if (
      typeof itemClassRef !== "function" &&
      !isRecord(itemClassRef)
    ) {
      return false;
    }

    return isRecord((itemClassRef as { prototype?: unknown }).prototype);
  });
}

function isHookItemLike(value: unknown): value is Item {
  if (!isRecord(value)) {
    return false;
  }

  if (!("name" in value)) {
    return false;
  }

  if ("items" in value) {
    return false;
  }

  return true;
}

function extractHookItemFromArgs(args: unknown[]): Item | null {
  for (const arg of args) {
    if (
      isRecord(arg) &&
      "item" in arg &&
      isHookItemLike((arg as { item?: unknown }).item)
    ) {
      return (arg as { item: Item }).item;
    }
  }

  for (const arg of args) {
    if (isHookItemLike(arg)) {
      return arg;
    }
  }

  return null;
}

function cloneValue<T>(value: T): T {
  return foundry.utils.deepClone(value);
}

function getActorObject(actor: Actor): Record<string, unknown> {
  return actor.toObject() as Record<string, unknown>;
}

function getSystemDataFromActorObject(actorObject: Record<string, unknown>): Record<string, unknown> {
  const rawSystem = actorObject["system"] ?? actorObject["data"] ?? {};
  return isRecord(rawSystem) ? cloneValue(rawSystem) : {};
}

function getPrototypeTokenFromActorObject(
  actorObject: Record<string, unknown>
): Record<string, unknown> {
  const rawToken = actorObject["prototypeToken"] ?? actorObject["token"] ?? {};
  return isRecord(rawToken) ? cloneValue(rawToken) : {};
}

interface AdapterItemRef {
  id: string | null;
  name: string | null;
  type: string | null;
  raw: Record<string, unknown>;
}

interface UpdatableTokenDocument {
  update(data: Record<string, unknown>): Promise<unknown> | unknown;
}

function isUpdatableTokenDocument(value: unknown): value is UpdatableTokenDocument {
  return isRecord(value) && typeof value["update"] === "function";
}

function extractItemsFromContents(actor: Actor): AdapterItemRef[] {
  const fromContents = (actor.items as unknown as { contents?: unknown[] })?.contents ?? [];
  if (!Array.isArray(fromContents)) {
    return [];
  }

  return fromContents.map((item): AdapterItemRef => {
    if (!isRecord(item)) {
      return { id: null, name: null, type: null, raw: {} };
    }
    const maybeToObject = item["toObject"];
    const rawItem =
      typeof maybeToObject === "function"
        ? (maybeToObject.call(item) as Record<string, unknown>)
        : cloneValue(item);
    const id = rawItem["id"] ?? rawItem["_id"] ?? item["id"];
    const name = rawItem["name"] ?? item["name"];
    const type = rawItem["type"] ?? item["type"];
    return {
      id: typeof id === "string" ? id : null,
      name: typeof name === "string" ? name : null,
      type: typeof type === "string" ? type : null,
      raw: rawItem,
    };
  });
}

function extractItemsFromActorObject(actor: Actor): AdapterItemRef[] {
  const actorObject = getActorObject(actor);
  const rawItems = actorObject["items"];
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems.map((rawItem) => {
    if (!isRecord(rawItem)) {
      return { id: null, name: null, type: null, raw: {} };
    }
    const id = rawItem["id"] ?? rawItem["_id"];
    const name = rawItem["name"];
    const type = rawItem["type"];
    return {
      id: typeof id === "string" ? id : null,
      name: typeof name === "string" ? name : null,
      type: typeof type === "string" ? type : null,
      raw: cloneValue(rawItem),
    };
  });
}

function getActorItems(actor: Actor): AdapterItemRef[] {
  const fromContents = extractItemsFromContents(actor);
  const fromActorObject = extractItemsFromActorObject(actor);

  const byId = new Map<string, AdapterItemRef>();
  const withoutId: AdapterItemRef[] = [];

  const addItem = (item: AdapterItemRef): void => {
    if (!item.id) {
      withoutId.push(item);
      return;
    }

    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  };

  [...fromContents, ...fromActorObject].forEach(addItem);
  return [...byId.values(), ...withoutId];
}

function normalizeFilterName(value: string): string {
  return normalizeString(value).toLowerCase();
}

type FilterRule =
  | {
      kind: "name";
      value: string;
    }
  | {
      kind: "descriptor";
      descriptor: DescriptorKey;
      value: string;
    };

type DescriptorKey = "type" | "objecttype" | "featuretype";

interface DescriptorAlias {
  descriptor: DescriptorKey;
  value: string;
}

interface ItemDescriptors {
  type: Set<string>;
  objecttype: Set<string>;
  featuretype: Set<string>;
}

const DESCRIPTOR_PREFIX_ALIASES: Record<string, DescriptorKey> = {
  type: "type",
  itemtype: "type",
  objecttype: "objecttype",
  featuretype: "featuretype",
};

const DESCRIPTOR_ALIASES: Record<string, DescriptorAlias> = {
  class: { descriptor: "type", value: "class" },
  subclass: { descriptor: "type", value: "subclass" },
  background: { descriptor: "type", value: "background" },
  ancestry: { descriptor: "type", value: "ancestry" },
  boon: { descriptor: "type", value: "boon" },
  feature: { descriptor: "type", value: "feature" },
  monsterfeature: { descriptor: "type", value: "monsterfeature" },
  spell: { descriptor: "type", value: "spell" },
  object: { descriptor: "type", value: "object" },
  armor: { descriptor: "objecttype", value: "armor" },
  armour: { descriptor: "objecttype", value: "armor" },
  shield: { descriptor: "objecttype", value: "shield" },
  weapon: { descriptor: "objecttype", value: "weapon" },
  weapons: { descriptor: "objecttype", value: "weapon" },
  consumable: { descriptor: "objecttype", value: "consumable" },
  miscellaneous: { descriptor: "objecttype", value: "misc" },
  misc: { descriptor: "objecttype", value: "misc" },
  classfeature: { descriptor: "featuretype", value: "class" },
  classfeatures: { descriptor: "featuretype", value: "class" },
  backgroundfeature: { descriptor: "featuretype", value: "background" },
  backgroundfeatures: { descriptor: "featuretype", value: "background" },
  ancestryfeature: { descriptor: "featuretype", value: "ancestry" },
  ancestryfeatures: { descriptor: "featuretype", value: "ancestry" },
  boonfeature: { descriptor: "featuretype", value: "boon" },
  boonfeatures: { descriptor: "featuretype", value: "boon" },
};

const LEGACY_TYPE_CANDIDATE_KEYS = [
  "type",
  "itemType",
  "category",
  "classification",
  "kind",
  "group",
  "weaponType",
  "equipmentType",
] as const;

function normalizeAliasKey(value: string): string {
  return normalizeFilterName(value).replace(/[\s_-]+/g, "");
}

function getAlias(value: string): DescriptorAlias | null {
  const key = normalizeAliasKey(value);
  if (!key) {
    return null;
  }
  return DESCRIPTOR_ALIASES[key] ?? null;
}

function normalizeDescriptorPrefix(value: string): DescriptorKey | null {
  const key = normalizeAliasKey(value);
  if (!key) {
    return null;
  }
  return DESCRIPTOR_PREFIX_ALIASES[key] ?? null;
}

function normalizeDescriptorValue(descriptor: DescriptorKey, value: string): string {
  const normalized = normalizeFilterName(value);
  if (!normalized) {
    return "";
  }

  const alias = getAlias(normalized);
  if (alias && alias.descriptor === descriptor) {
    return alias.value;
  }

  return normalized;
}

function parseDescriptorFilterRule(descriptor: DescriptorKey, value: string): FilterRule | null {
  const normalizedValue = normalizeFilterName(value);
  if (!normalizedValue) {
    return null;
  }

  if (descriptor === "type") {
    const alias = getAlias(normalizedValue);
    if (alias) {
      return {
        kind: "descriptor",
        descriptor: alias.descriptor,
        value: alias.value,
      };
    }
  }

  const descriptorValue = normalizeDescriptorValue(descriptor, normalizedValue);
  if (!descriptorValue) {
    return null;
  }

  return {
    kind: "descriptor",
    descriptor,
    value: descriptorValue,
  };
}

function parsePrefixedFilterRule(value: string): FilterRule | null {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const prefix = normalizeDescriptorPrefix(value.slice(0, separatorIndex));
  if (!prefix) {
    return null;
  }

  return parseDescriptorFilterRule(prefix, value.slice(separatorIndex + 1));
}

function parseFilterRule(value: string): FilterRule | null {
  const normalized = normalizeFilterName(value);
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("name:")) {
    const normalizedName = normalizeFilterName(normalized.slice("name:".length));
    if (!normalizedName) {
      return null;
    }
    return {
      kind: "name",
      value: normalizedName,
    };
  }

  const prefixedRule = parsePrefixedFilterRule(normalized);
  if (prefixedRule) {
    return prefixedRule;
  }

  const alias = getAlias(normalized);
  if (alias) {
    return {
      kind: "descriptor",
      descriptor: alias.descriptor,
      value: alias.value,
    };
  }

  return {
    kind: "name",
    value: normalized,
  };
}

function parseFilterRules(values: string[]): FilterRule[] {
  return values
    .map((value) => parseFilterRule(value))
    .filter((rule): rule is FilterRule => rule !== null);
}

function appendNormalizedToken(
  value: unknown,
  collect: (value: string) => void,
  allowRecordTraversal = true
): void {
  if (typeof value === "string") {
    const normalized = normalizeFilterName(value);
    if (normalized) {
      collect(normalized);
    }
    return;
  }

  if (!allowRecordTraversal || !isRecord(value)) {
    return;
  }

  const nestedKeys = ["value", "id", "name", "label", "slug", "type", "category", "classification"];
  nestedKeys.forEach((key) => {
    appendNormalizedToken(value[key], collect, false);
  });
}

function createItemDescriptors(): ItemDescriptors {
  return {
    type: new Set<string>(),
    objecttype: new Set<string>(),
    featuretype: new Set<string>(),
  };
}

function addDescriptorValue(
  descriptors: ItemDescriptors,
  descriptor: DescriptorKey,
  value: string
): void {
  const normalized = normalizeDescriptorValue(descriptor, value);
  if (!normalized) {
    return;
  }
  descriptors[descriptor].add(normalized);
}

function addDescriptorAliasValue(descriptors: ItemDescriptors, value: string): void {
  const alias = getAlias(value);
  if (!alias) {
    return;
  }
  descriptors[alias.descriptor].add(alias.value);
}

function collectItemDescriptors(item: AdapterItemRef): ItemDescriptors {
  const descriptors = createItemDescriptors();
  const addTypeValue = (value: string): void => {
    addDescriptorValue(descriptors, "type", value);
    addDescriptorAliasValue(descriptors, value);
  };

  appendNormalizedToken(item.type, addTypeValue);
  appendNormalizedToken(item.raw["type"], addTypeValue);

  const itemSystem = isRecord(item.raw["system"]) ? (item.raw["system"] as Record<string, unknown>) : null;
  if (itemSystem) {
    appendNormalizedToken(itemSystem["objectType"], (value) =>
      addDescriptorValue(descriptors, "objecttype", value)
    );
    appendNormalizedToken(itemSystem["featureType"], (value) =>
      addDescriptorValue(descriptors, "featuretype", value)
    );

    LEGACY_TYPE_CANDIDATE_KEYS.forEach((key) => {
      appendNormalizedToken(itemSystem[key], (value) => addDescriptorAliasValue(descriptors, value));
    });

    const systemDetails = isRecord(itemSystem["details"])
      ? (itemSystem["details"] as Record<string, unknown>)
      : null;
    if (systemDetails) {
      appendNormalizedToken(systemDetails["objectType"], (value) =>
        addDescriptorValue(descriptors, "objecttype", value)
      );
      appendNormalizedToken(systemDetails["featureType"], (value) =>
        addDescriptorValue(descriptors, "featuretype", value)
      );
      LEGACY_TYPE_CANDIDATE_KEYS.forEach((key) => {
        appendNormalizedToken(systemDetails[key], (value) => addDescriptorAliasValue(descriptors, value));
      });
    }
  }

  if (descriptors.type.has("object") && descriptors.objecttype.size === 0) {
    descriptors.objecttype.add("misc");
  }

  return descriptors;
}

function doesFilterRuleMatchItem(item: AdapterItemRef, rule: FilterRule): boolean {
  if (rule.kind === "descriptor") {
    return collectItemDescriptors(item)[rule.descriptor].has(rule.value);
  }

  return normalizeFilterName(item.name ?? "") === rule.value;
}

function doesAnyFilterRuleMatchItem(item: AdapterItemRef, rules: FilterRule[]): boolean {
  return rules.some((rule) => doesFilterRuleMatchItem(item, rule));
}

function doesAnyFilterRuleMatchItemByKind(
  item: AdapterItemRef,
  rules: FilterRule[],
  kind: FilterRule["kind"]
): boolean {
  return rules.some((rule) => rule.kind === kind && doesFilterRuleMatchItem(item, rule));
}

const CORE_BASE_IDENTITY_TYPES = new Set(["class", "subclass", "background", "ancestry"]);
const CORE_BASE_IDENTITY_FEATURE_TYPES = new Set(["class", "background", "ancestry"]);

function isCoreBaseIdentityItem(item: AdapterItemRef): boolean {
  const descriptors = collectItemDescriptors(item);
  return (
    [...descriptors.type].some((candidate) => CORE_BASE_IDENTITY_TYPES.has(candidate)) ||
    [...descriptors.featuretype].some((candidate) =>
      CORE_BASE_IDENTITY_FEATURE_TYPES.has(candidate)
    )
  );
}

function isWildshapeActionName(name: string | null | undefined): boolean {
  return normalizeFilterName(name ?? "") === "wildshape";
}

function isInjectedItemRef(item: AdapterItemRef): boolean {
  const wildshapeFlags = item.raw["flags"];
  if (!isRecord(wildshapeFlags)) {
    return false;
  }

  const scopedFlags = getScopedInjectedFlags(wildshapeFlags);
  return isRecord(scopedFlags) && scopedFlags["injected"] === true;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getActorById(actorId: string): Actor | null {
  const actorsCollection = (game as Game).actors as
    | {
        get?: (id: string) => Actor | null | undefined;
        contents?: Actor[];
      }
    | undefined;
  if (!actorsCollection) {
    return null;
  }

  if (typeof actorsCollection.get === "function") {
    return actorsCollection.get(actorId) ?? null;
  }

  const contents = Array.isArray(actorsCollection.contents)
    ? actorsCollection.contents
    : [];
  return contents.find((actor) => actor.id === actorId) ?? null;
}

function extractNimbleItemNameFromChatMessage(
  message: Record<string, unknown>,
  actor: Actor
): string | null {
  const system = message["system"] as Record<string, unknown>;
  const nameFromSystem =
    asString(system["spellName"]) ?? asString(system["itemName"]) ?? asString(system["name"]);
  if (nameFromSystem && nameFromSystem.trim().length > 0) {
    return nameFromSystem.trim();
  }

  const flavor = asString(message["flavor"]);
  if (!flavor || flavor.trim().length === 0) {
    return null;
  }

  const actorName = actor.name?.trim();
  if (actorName && flavor.startsWith(`${actorName}:`)) {
    const itemName = flavor.slice(actorName.length + 1).trim();
    return itemName.length > 0 ? itemName : null;
  }

  const separatorIndex = flavor.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const itemName = flavor.slice(separatorIndex + 1).trim();
  return itemName.length > 0 ? itemName : null;
}

function getConfiguredTriggerItemNames(): string[] {
  const effectiveConfig = getEffectiveConfig();
  const byNormalizedName = new Map<string, string>();

  effectiveConfig.mappings.forEach((mapping) => {
    if (mapping.trigger.mode !== "itemName") {
      return;
    }

    const triggerName = normalizeString(mapping.trigger.value);
    if (!triggerName) {
      return;
    }

    const normalizedTriggerName = normalizeFilterName(triggerName);
    if (!byNormalizedName.has(normalizedTriggerName)) {
      byNormalizedName.set(normalizedTriggerName, triggerName);
    }
  });

  return [...byNormalizedName.values()];
}

function getActorItemNameSet(actor: Actor): Set<string> {
  const names = new Set<string>();

  getActorItems(actor).forEach((item) => {
    const normalizedName = normalizeFilterName(item.name ?? "");
    if (!normalizedName) {
      return;
    }
    names.add(normalizedName);
  });

  return names;
}

function toEnsuredWildshapeActionPayload(itemName: string): Record<string, unknown> {
  return {
    name: itemName,
    type: "feature",
    system: {
      featureType: "class",
    },
    flags: {
      [FLAG_SCOPE]: {
        injected: true,
        ensuredAction: true,
      },
    },
  };
}

function filterItemIdsByRules(
  actor: Actor,
  filters: { whitelist: string[]; blacklist: string[] },
  options?: { includeInjected?: boolean; preserveCoreIdentity?: boolean }
): string[] {
  const includeInjected = options?.includeInjected ?? true;
  const preserveCoreIdentity = options?.preserveCoreIdentity ?? false;
  const items = getActorItems(actor);
  const whitelistRules = parseFilterRules(filters.whitelist);
  const blacklistRules = parseFilterRules(filters.blacklist);

  let candidates = items.filter(
    (item) =>
      typeof item.id === "string" &&
      item.id.length > 0 &&
      (includeInjected || !isInjectedItemRef(item))
  );
  if (whitelistRules.length > 0) {
    candidates = candidates.filter((item) => doesAnyFilterRuleMatchItem(item, whitelistRules));
  }

  candidates = candidates.filter((item) => {
    if (!doesAnyFilterRuleMatchItem(item, blacklistRules)) {
      return true;
    }

    // Blacklist wins unless explicitly whitelisted by item name.
    return doesAnyFilterRuleMatchItemByKind(item, whitelistRules, "name");
  });

  // Keep the wildshape action available even if filters would remove it.
  const wildshapeItems = items.filter(
    (item) =>
      typeof item.id === "string" &&
      item.id.length > 0 &&
      (includeInjected || !isInjectedItemRef(item)) &&
      isWildshapeActionName(item.name)
  );

  const coreIdentityItems = preserveCoreIdentity
    ? items.filter(
        (item) =>
          typeof item.id === "string" &&
          item.id.length > 0 &&
          (includeInjected || !isInjectedItemRef(item)) &&
          isCoreBaseIdentityItem(item)
      )
    : [];

  const dedupe = new Map<string, string>();
  [...candidates, ...wildshapeItems, ...coreIdentityItems].forEach((item) => {
    dedupe.set(item.id!, item.id!);
  });

  return [...dedupe.values()].sort((left, right) => left.localeCompare(right));
}

function prepareFormItems(actor: Actor, itemIds: string[]): Record<string, unknown>[] {
  const itemsById = new Map<string, Record<string, unknown>>();
  getActorItems(actor).forEach((item) => {
    if (!item.id) {
      return;
    }
    itemsById.set(item.id, item.raw);
  });

  return itemIds
    .map((id) => itemsById.get(id))
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => toInjectedItemPayload(item));
}

function toInjectedItemPayload(
  rawItem: Record<string, unknown>,
  sourceUuid?: string
): Record<string, unknown> {
  const payload = cloneValue(rawItem);
  delete payload["id"];
  delete payload["_id"];

  const flags = isRecord(payload["flags"])
    ? cloneValue(payload["flags"] as Record<string, unknown>)
    : {};
  const wildshapeFlags = isRecord(flags[FLAG_SCOPE])
    ? cloneValue(flags[FLAG_SCOPE] as Record<string, unknown>)
    : {};
  flags[FLAG_SCOPE] = {
    ...wildshapeFlags,
    injected: true,
    ...(sourceUuid ? { sourceUuid } : {}),
  };
  payload["flags"] = flags;
  return payload;
}

function getScopedInjectedFlags(flags: Record<string, unknown>): Record<string, unknown> | null {
  const scopedFlags = flags[FLAG_SCOPE];
  if (isRecord(scopedFlags)) {
    return scopedFlags;
  }

  const legacyScopedFlags = flags[LEGACY_FLAG_SCOPE];
  if (isRecord(legacyScopedFlags)) {
    return legacyScopedFlags;
  }

  return null;
}

function isItemDocumentLike(value: unknown): value is { toObject?: () => unknown; documentName?: unknown } {
  if (!isRecord(value)) {
    return false;
  }

  const documentName = value["documentName"];
  return documentName === undefined || documentName === "Item";
}

async function resolveFormAbilityRawItemByUuid(
  uuid: string
): Promise<Record<string, unknown> | null> {
  const fromUuidRef = (globalThis as { fromUuid?: (uuid: string) => Promise<unknown> }).fromUuid;
  if (typeof fromUuidRef !== "function") {
    return null;
  }

  const resolved = await fromUuidRef(uuid);
  if (!isItemDocumentLike(resolved)) {
    return null;
  }

  const maybeToObject = resolved.toObject;
  if (typeof maybeToObject === "function") {
    const raw = maybeToObject.call(resolved);
    return isRecord(raw) ? cloneValue(raw) : null;
  }

  return cloneValue(resolved as Record<string, unknown>);
}

async function resolveMappedFormAbilityItems(formAbilityUuids: string[]): Promise<Record<string, unknown>[]> {
  const resolvedItems: Record<string, unknown>[] = [];
  const dedupe = new Set<string>();

  for (const rawUuid of formAbilityUuids) {
    const uuid = normalizeString(rawUuid);
    if (!uuid || dedupe.has(uuid)) {
      continue;
    }
    dedupe.add(uuid);

    const rawItem = await resolveFormAbilityRawItemByUuid(uuid);
    if (!rawItem) {
      continue;
    }

    resolvedItems.push(toInjectedItemPayload(rawItem, uuid));
  }

  return resolvedItems;
}

function getInjectedItemIds(actor: Actor): string[] {
  return getActorItems(actor)
    .filter((item) => item.id && isInjectedItemRef(item))
    .map((item) => item.id as string);
}

function getAllActorItemIds(actor: Actor): string[] {
  return getActorItems(actor)
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

function getSnapshotItemId(item: Record<string, unknown>): string | null {
  const id = item["id"] ?? item["_id"];
  return typeof id === "string" && id.length > 0 ? id : null;
}

function getMissingSnapshotItemsForCreate(
  actor: Actor,
  snapshotItems: Record<string, unknown>[]
): Record<string, unknown>[] {
  const currentItemIds = new Set(getAllActorItemIds(actor));
  return snapshotItems
    .filter((item) => isRecord(item))
    .filter((item) => {
      const snapshotItemId = getSnapshotItemId(item);
      if (!snapshotItemId) {
        return true;
      }
      return !currentItemIds.has(snapshotItemId);
    })
    .map((item) => {
      const payload = cloneValue(item);
      delete payload["id"];
      delete payload["_id"];
      return payload;
    });
}

function getFilteredBaseItemRemovalIds(actor: Actor, baseItemIdsToKeep: string[]): string[] {
  const keepSet = new Set(baseItemIdsToKeep);
  return getActorItems(actor)
    .filter(
      (item) =>
        item.id &&
        !isInjectedItemRef(item) &&
        !keepSet.has(item.id)
    )
    .map((item) => item.id as string);
}

function snapshotItemsForCreate(snapshotItems: Record<string, unknown>[]): Record<string, unknown>[] {
  return snapshotItems
    .filter((item) => isRecord(item))
    .map((item) => {
      const payload = cloneValue(item);
      delete payload["id"];
      delete payload["_id"];
      return payload;
    });
}

function mergeSystemData(input: {
  baseSystem: Record<string, unknown>;
  formSystem: Record<string, unknown>;
}): Record<string, unknown> {
  const mergedSystem = cloneValue(input.formSystem);

  KEEP_SYSTEM_ROOT_KEYS.forEach((key) => {
    const keepValue = input.baseSystem[key];
    if (keepValue === undefined) {
      return;
    }
    mergedSystem[key] = cloneValue(keepValue);
  });

  const baseAttributes = input.baseSystem["attributes"];
  const formAttributes = mergedSystem["attributes"];
  if (isRecord(baseAttributes)) {
    const mergedAttributes = isRecord(formAttributes) ? cloneValue(formAttributes) : {};
    KEEP_SYSTEM_ATTRIBUTE_KEYS.forEach((key) => {
      const keepValue = baseAttributes[key];
      if (keepValue === undefined) {
        return;
      }
      mergedAttributes[key] = cloneValue(keepValue);
    });
    mergedSystem["attributes"] = mergedAttributes;
  }

  return mergedSystem;
}

function mergePrototypeToken(input: {
  baseToken: Record<string, unknown>;
  formToken: Record<string, unknown>;
}): Record<string, unknown> {
  const mergedToken = cloneValue(input.baseToken);

  FORM_TOKEN_KEYS.forEach((key) => {
    const tokenValue = input.formToken[key];
    if (tokenValue === undefined) {
      return;
    }
    mergedToken[key] = cloneValue(tokenValue);
  });

  return mergedToken;
}

function getActiveTokenDocuments(actor: Actor): UpdatableTokenDocument[] {
  const maybeGetActiveTokens = (
    actor as unknown as { getActiveTokens?: () => unknown }
  ).getActiveTokens;
  if (typeof maybeGetActiveTokens !== "function") {
    return [];
  }

  const activeTokens = maybeGetActiveTokens.call(actor);
  if (!Array.isArray(activeTokens)) {
    return [];
  }

  const tokenDocuments = activeTokens
    .map((activeToken) => {
      if (isUpdatableTokenDocument(activeToken)) {
        return activeToken;
      }

      if (!isRecord(activeToken)) {
        return null;
      }

      const tokenDocument = activeToken["document"];
      if (isUpdatableTokenDocument(tokenDocument)) {
        return tokenDocument;
      }

      return null;
    })
    .filter((token): token is UpdatableTokenDocument => token !== null);

  return [...new Set(tokenDocuments)];
}

function getTokenUpdateData(prototypeToken: Record<string, unknown>): Record<string, unknown> {
  const tokenUpdateData: Record<string, unknown> = {};
  FORM_TOKEN_KEYS.forEach((key) => {
    const tokenValue = prototypeToken[key];
    if (tokenValue === undefined) {
      return;
    }
    tokenUpdateData[key] = cloneValue(tokenValue);
  });
  return tokenUpdateData;
}

async function syncActiveTokenDocuments(
  actor: Actor,
  prototypeToken: Record<string, unknown>
): Promise<void> {
  const tokenUpdateData = getTokenUpdateData(prototypeToken);
  if (Object.keys(tokenUpdateData).length === 0) {
    return;
  }

  const activeTokenDocuments = getActiveTokenDocuments(actor);
  for (const tokenDocument of activeTokenDocuments) {
    await tokenDocument.update(cloneValue(tokenUpdateData));
  }
}

export class NimbleAdapter implements WildshapeAdapter {
  public readonly id = "nimble";

  public detect(): boolean {
    return (game as Game).system.id === this.id;
  }

  public getItemUseHooks(): readonly string[] {
    return NIMBLE_ITEM_USE_HOOKS;
  }

  public extractItemFromHookArgs(_hookName: string, args: unknown[]): Item | null {
    return extractHookItemFromArgs(args);
  }

  public isWildshapeTrigger(item: Item): boolean {
    const itemName = normalizeString(item.name ?? "").toLowerCase();
    if (!itemName) {
      return false;
    }

    const effectiveConfig = getEffectiveConfig();
    return effectiveConfig.mappings.some(
      (mapping) =>
        mapping.trigger.mode === "itemName" &&
        normalizeString(mapping.trigger.value).toLowerCase() === itemName
    );
  }

  public registerDirectItemUseListener(onItemUse: (item: Item) => void): boolean {
    let wrappedCount = 0;

    getNimbleItemDocumentClasses().forEach((itemClassRef) => {
      const prototypeRef = itemClassRef.prototype;
      if (!isRecord(prototypeRef)) {
        return;
      }

      if (prototypeRef[DIRECT_ITEM_USE_WRAP_FLAG] === true) {
        return;
      }

      const activate = prototypeRef["activate"];
      if (typeof activate !== "function") {
        return;
      }

      const originalActivate = activate as (
        this: Item & Record<string, unknown>,
        ...args: unknown[]
      ) => Promise<unknown> | unknown;

      prototypeRef["activate"] = async function wrappedItemActivate(
        this: Item & Record<string, unknown>,
        ...args: unknown[]
      ): Promise<unknown> {
        const currentDepthValue = this[DIRECT_ITEM_USE_DEPTH_FLAG];
        const depth = typeof currentDepthValue === "number" ? currentDepthValue : 0;
        this[DIRECT_ITEM_USE_DEPTH_FLAG] = depth + 1;

        try {
          const result = await originalActivate.apply(this, args);
          if (depth === 0 && result !== null && result !== undefined) {
            try {
              onItemUse(this as Item);
            } catch {
              // Never break item activation flow because of module listeners.
            }
          }
          return result;
        } finally {
          const depthValue = this[DIRECT_ITEM_USE_DEPTH_FLAG];
          const nextDepth = typeof depthValue === "number" ? depthValue - 1 : 0;
          if (nextDepth <= 0) {
            delete this[DIRECT_ITEM_USE_DEPTH_FLAG];
          } else {
            this[DIRECT_ITEM_USE_DEPTH_FLAG] = nextDepth;
          }
        }
      };

      prototypeRef[DIRECT_ITEM_USE_WRAP_FLAG] = true;
      wrappedCount += 1;
    });

    return wrappedCount > 0;
  }

  public extractItemFromChatMessage(message: unknown): Item | null {
    if (!isRecord(message)) {
      return null;
    }

    const system = isRecord(message["system"]) ? message["system"] : null;
    if (!system || !("activation" in system || typeof system["spellName"] === "string")) {
      return null;
    }

    const speaker = isRecord(message["speaker"]) ? message["speaker"] : null;
    const actorId = speaker ? asString(speaker["actor"]) : null;
    if (!actorId) {
      return null;
    }

    const actor = getActorById(actorId);
    if (!actor) {
      return null;
    }

    const itemName = extractNimbleItemNameFromChatMessage(message, actor);
    if (!itemName) {
      return null;
    }

    return {
      name: itemName,
      actor,
    } as Item;
  }

  public async getActorSnapshot(actor: Actor): Promise<ActorSnapshot> {
    const actorObject = actor.toObject() as Record<string, unknown>;
    const rawSystem = actorObject["system"] ?? actorObject["data"] ?? {};
    const rawItems = actorObject["items"];
    const rawPrototypeToken = actorObject["prototypeToken"] ?? actorObject["token"] ?? {};

    return {
      takenAt: new Date().toISOString(),
      system: foundry.utils.deepClone(rawSystem as Record<string, unknown>),
      items: Array.isArray(rawItems)
        ? foundry.utils.deepClone(rawItems as Record<string, unknown>[])
        : [],
      prototypeToken: foundry.utils.deepClone(rawPrototypeToken as Record<string, unknown>),
    };
  }

  public async buildTransformPlan(input: {
    baseActor: Actor;
    formActor: Actor;
    snapshot: ActorSnapshot;
    filters: { whitelist: string[]; blacklist: string[] };
    formAbilityUuids?: string[];
  }): Promise<TransformPlan> {
    const baseActorObject = getActorObject(input.baseActor);
    const formActorObject = getActorObject(input.formActor);
    const formSystem = getSystemDataFromActorObject(formActorObject);
    const baseToken = getPrototypeTokenFromActorObject(baseActorObject);
    const formToken = getPrototypeTokenFromActorObject(formActorObject);
    const formItemIds = filterItemIdsByRules(input.formActor, input.filters);
    const baseItemIdsToKeep = filterItemIdsByRules(input.baseActor, input.filters, {
      includeInjected: false,
      preserveCoreIdentity: true,
    });
    const mappedFormAbilityItems = await resolveMappedFormAbilityItems(input.formAbilityUuids ?? []);

    return {
      actorUpdate: {
        system: mergeSystemData({
          baseSystem: input.snapshot.system,
          formSystem,
        }),
        prototypeToken: mergePrototypeToken({
          baseToken,
          formToken,
        }),
      },
      formItemIds,
      formItems: [...prepareFormItems(input.formActor, formItemIds), ...mappedFormAbilityItems],
      baseItemIdsToKeep,
    };
  }

  public async applyTransform(_actor: Actor, _plan: TransformPlan): Promise<void> {
    const injectedItemIds = getInjectedItemIds(_actor);
    const baseItemIdsToRemove = Array.isArray(_plan.baseItemIdsToKeep)
      ? getFilteredBaseItemRemovalIds(_actor, _plan.baseItemIdsToKeep)
      : [];
    const idsToDelete = [...new Set([...injectedItemIds, ...baseItemIdsToRemove])];
    if (idsToDelete.length > 0) {
      await _actor.deleteEmbeddedDocuments("Item", idsToDelete);
    }

    await _actor.update(_plan.actorUpdate);
    const prototypeToken = _plan.actorUpdate["prototypeToken"];
    if (isRecord(prototypeToken)) {
      await syncActiveTokenDocuments(_actor, prototypeToken);
    }

    if (_plan.formItems.length > 0) {
      await _actor.createEmbeddedDocuments("Item", cloneValue(_plan.formItems));
    }
  }

  public async applyRevert(
    _actor: Actor,
    _snapshot: ActorSnapshot,
    options?: {
      preserveBaseStats?: boolean;
    }
  ): Promise<void> {
    const preserveBaseStats = options?.preserveBaseStats ?? true;
    const currentActorObject = getActorObject(_actor);
    const currentSystem = getSystemDataFromActorObject(currentActorObject);
    const revertedSystem = preserveBaseStats
      ? mergeSystemData({
          baseSystem: currentSystem,
          formSystem: _snapshot.system,
        })
      : cloneValue(_snapshot.system);

    if (preserveBaseStats) {
      const injectedItemIds = getInjectedItemIds(_actor);
      if (injectedItemIds.length > 0) {
        await _actor.deleteEmbeddedDocuments("Item", injectedItemIds);
      }

      const missingSnapshotItems = getMissingSnapshotItemsForCreate(_actor, _snapshot.items);
      if (missingSnapshotItems.length > 0) {
        await _actor.createEmbeddedDocuments("Item", missingSnapshotItems);
      }
    } else {
      const currentItemIds = getAllActorItemIds(_actor);
      if (currentItemIds.length > 0) {
        await _actor.deleteEmbeddedDocuments("Item", currentItemIds);
      }

      const snapshotItems = snapshotItemsForCreate(_snapshot.items);
      if (snapshotItems.length > 0) {
        await _actor.createEmbeddedDocuments("Item", snapshotItems);
      }
    }

    await _actor.update({
      system: revertedSystem,
      prototypeToken: cloneValue(_snapshot.prototypeToken),
    });
    await syncActiveTokenDocuments(_actor, _snapshot.prototypeToken);
  }

  public async ensureWildshapeAction(_actor: Actor): Promise<void> {
    const configuredTriggerNames = getConfiguredTriggerItemNames();
    if (configuredTriggerNames.length === 0) {
      return;
    }

    const existingNames = getActorItemNameSet(_actor);
    const missingNames = configuredTriggerNames.filter(
      (name) => !existingNames.has(normalizeFilterName(name))
    );
    if (missingNames.length === 0) {
      return;
    }

    const createEmbeddedDocuments = (
      _actor as unknown as {
        createEmbeddedDocuments?: (
          documentName: string,
          data: Record<string, unknown>[]
        ) => Promise<unknown> | unknown;
      }
    ).createEmbeddedDocuments;
    if (typeof createEmbeddedDocuments !== "function") {
      return;
    }

    await createEmbeddedDocuments.call(
      _actor,
      "Item",
      missingNames.map((name) => toEnsuredWildshapeActionPayload(name))
    );
  }
}
