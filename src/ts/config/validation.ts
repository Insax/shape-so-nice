import { SCHEMA_VERSION } from "../constants";
import type {
  GlobalConfig,
  MappingTrigger,
  PlayerOverrideConfig,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isItemNameTrigger(value: unknown): value is MappingTrigger {
  if (!isRecord(value)) {
    return false;
  }

  return value["mode"] === "itemName" && typeof value["value"] === "string";
}

function isFormRef(value: unknown, allowEmptyValue = false): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const mode = value["mode"];
  const refValue = value["value"];
  const hasValidValue =
    typeof refValue === "string" &&
    (allowEmptyValue || refValue.trim().length > 0);
  return (
    (mode === "uuid" || mode === "name") &&
    hasValidValue
  );
}

function isFilters(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return isStringArray(value["whitelist"]) && isStringArray(value["blacklist"]);
}

function isMapping(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const formAbilityUuids = value["formAbilityUuids"];
  if (formAbilityUuids !== undefined && !isStringArray(formAbilityUuids)) {
    return false;
  }

  return (
    typeof value["id"] === "string" &&
    value["id"].trim().length > 0 &&
    isItemNameTrigger(value["trigger"]) &&
    Array.isArray(value["formRefs"]) &&
    value["formRefs"].every((ref) => isFormRef(ref)) &&
    isFilters(value["defaultFilters"])
  );
}

function isPlayerOverrideMapping(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value["id"] !== "string" || value["id"].trim().length === 0) {
    return false;
  }

  if (
    !Array.isArray(value["formRefsAdd"]) ||
    !value["formRefsAdd"].every((ref) => isFormRef(ref))
  ) {
    return false;
  }

  if (
    !Array.isArray(value["formRefsRemove"]) ||
    !value["formRefsRemove"].every((ref) => isFormRef(ref))
  ) {
    return false;
  }

  const filtersOverride = value["filtersOverride"];
  if (filtersOverride === undefined) {
    return true;
  }

  return isFilters(filtersOverride);
}

export function isGlobalConfig(value: unknown): value is GlobalConfig {
  if (!isRecord(value)) {
    return false;
  }

  if (value["version"] !== SCHEMA_VERSION) {
    return false;
  }

  if (!Array.isArray(value["mappings"]) || !value["mappings"].every((mapping) => isMapping(mapping))) {
    return false;
  }

  const permissions = value["permissions"];
  if (!isRecord(permissions) || !isStringArray(permissions["playerOverrideEditors"])) {
    return false;
  }

  const ui = value["ui"];
  if (!isRecord(ui) || typeof ui["showDebugLogs"] !== "boolean") {
    return false;
  }

  return true;
}

export function isPlayerOverrideConfig(
  value: unknown
): value is PlayerOverrideConfig {
  if (!isRecord(value)) {
    return false;
  }

  if (value["version"] !== SCHEMA_VERSION) {
    return false;
  }

  if (
    !Array.isArray(value["mappings"]) ||
    !value["mappings"].every((mapping) => isPlayerOverrideMapping(mapping))
  ) {
    return false;
  }

  return true;
}
