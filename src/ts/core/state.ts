import type { ActorSnapshot } from "../adapters/types";
import { FLAG_KEYS, LEGACY_FLAG_SCOPE, MODULE_ID, SCHEMA_VERSION } from "../constants";

export interface WildshapeActorState {
  version: number;
  isShaped: boolean;
  baseActorId: string;
  currentFormActorId: string;
  currentFormName: string;
  snapshot: ActorSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getLegacyStateFlag(actor: Actor): unknown {
  const rawFlags = (actor as unknown as { flags?: unknown }).flags;
  if (!isRecord(rawFlags)) {
    return null;
  }

  const legacyScopedFlags = rawFlags[LEGACY_FLAG_SCOPE];
  if (!isRecord(legacyScopedFlags)) {
    return null;
  }

  return legacyScopedFlags[FLAG_KEYS.STATE] ?? null;
}

function parseStatePayload(actor: Actor, rawState: unknown): WildshapeActorState | null {
  if (rawState == null) {
    return null;
  }

  if (!isWildshapeActorState(rawState)) {
    console.warn(`[${MODULE_ID}] Invalid wildshape actor state detected.`, {
      actorId: actor.id,
      payload: rawState,
    });
    return null;
  }

  return rawState;
}

export function isWildshapeActorState(value: unknown): value is WildshapeActorState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value["version"] === SCHEMA_VERSION &&
    typeof value["isShaped"] === "boolean" &&
    typeof value["baseActorId"] === "string" &&
    typeof value["currentFormActorId"] === "string" &&
    typeof value["currentFormName"] === "string" &&
    (value["snapshot"] === null || isRecord(value["snapshot"]))
  );
}

export function getWildshapeActorState(actor: Actor): WildshapeActorState | null {
  const rawState = actor.getFlag(MODULE_ID, FLAG_KEYS.STATE) ?? getLegacyStateFlag(actor);
  return parseStatePayload(actor, rawState);
}

export function getModuleWildshapeActorState(actor: Actor): WildshapeActorState | null {
  const rawState = actor.getFlag(MODULE_ID, FLAG_KEYS.STATE);
  return parseStatePayload(actor, rawState);
}
