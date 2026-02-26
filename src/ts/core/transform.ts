import type { ActorSnapshot, WildshapeAdapter } from "../adapters/types";
import { getEffectiveConfig } from "../config/effectiveConfig";
import type { AbilityFilters } from "../config/types";
import { FLAG_KEYS, MODULE_HOOKS, MODULE_ID, SCHEMA_VERSION } from "../constants";
import { logDebug, logError, logInfo, logWarning } from "./logger";
import { getModuleWildshapeActorState, type WildshapeActorState } from "./state";
import { isRecord } from "../utils/typeGuards";

const inFlightActorOperations = new Set<string>();

function isActorSnapshot(value: unknown): value is ActorSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value["takenAt"] === "string" &&
    isRecord(value["system"]) &&
    Array.isArray(value["items"]) &&
    isRecord(value["prototypeToken"])
  );
}

interface MappingContext {
  mappingId: string | null;
  filters: AbilityFilters;
  formAbilityUuids: string[];
}

type FormTransitionReason = "transform" | "revert";

interface FormTransitionHookPayload {
  actor: Actor;
  reason: FormTransitionReason;
  fromFormActorId: string | null;
  toFormActorId: string | null;
  mappingId?: string | null;
  itemName?: string;
}

function resolveMappingContextForItemName(itemName: string, targetUser?: User): MappingContext {
  const effectiveConfig = getEffectiveConfig(targetUser);
  const normalizedItemName = itemName.trim().toLowerCase();
  const mapping = effectiveConfig.mappings.find(
    (entry) =>
      entry.trigger.mode === "itemName" &&
      entry.trigger.value.trim().toLowerCase() === normalizedItemName
  );

  if (!mapping) {
    return {
      mappingId: null,
      filters: { whitelist: [], blacklist: [] },
      formAbilityUuids: [],
    };
  }

  return {
    mappingId: mapping.id,
    filters: mapping.filters,
    formAbilityUuids: [...(mapping.formAbilityUuids ?? [])],
  };
}

function emitFormTransitionHook(
  hookName: string,
  payload: FormTransitionHookPayload
): void {
  const hooksRef = (globalThis as {
    Hooks?: {
      callAll?: (hookName: string, payload: FormTransitionHookPayload) => unknown;
    };
  }).Hooks;
  const callAll = hooksRef?.callAll;
  if (typeof callAll === "function") {
    try {
      callAll(hookName, payload);
    } catch (error: unknown) {
      logWarning("wildshape.transform.hookCallFailed", {
        hookName,
        actorId: payload.actor.id ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function buildNextState(input: {
  baseActorId: string;
  formActorId: string;
  formActorName: string;
  snapshot: ActorSnapshot;
}): WildshapeActorState {
  return {
    version: SCHEMA_VERSION,
    isShaped: true,
    baseActorId: input.baseActorId,
    currentFormActorId: input.formActorId,
    currentFormName: input.formActorName,
    snapshot: input.snapshot,
  };
}

function beginActorOperation(actorId: string): boolean {
  if (inFlightActorOperations.has(actorId)) {
    return false;
  }

  inFlightActorOperations.add(actorId);
  return true;
}

function endActorOperation(actorId: string): void {
  inFlightActorOperations.delete(actorId);
}

function getCharacterDebugDump(actor: Actor): Record<string, unknown> {
  const actorObject =
    typeof (actor as unknown as { toObject?: () => unknown }).toObject === "function"
      ? ((actor as unknown as { toObject: () => unknown }).toObject() as Record<string, unknown>)
      : {};
  const system = isRecord(actorObject["system"])
    ? (actorObject["system"] as Record<string, unknown>)
    : isRecord(actorObject["data"])
      ? (actorObject["data"] as Record<string, unknown>)
      : {};
  const classData = isRecord(system["classData"])
    ? (system["classData"] as Record<string, unknown>)
    : {};
  const attributes = isRecord(system["attributes"])
    ? (system["attributes"] as Record<string, unknown>)
    : {};
  const hp = isRecord(attributes["hp"])
    ? (attributes["hp"] as Record<string, unknown>)
    : isRecord(system["hp"])
      ? (system["hp"] as Record<string, unknown>)
      : null;
  const rawItems = Array.isArray(actorObject["items"]) ? actorObject["items"] : [];
  const classItems = rawItems
    .filter((item) => isRecord(item) && item["type"] === "class")
    .map((item) => {
      const itemData = item as Record<string, unknown>;
      const itemSystem = isRecord(itemData["system"])
        ? (itemData["system"] as Record<string, unknown>)
        : {};
      const itemDetails = isRecord(itemSystem["details"])
        ? (itemSystem["details"] as Record<string, unknown>)
        : {};
      return {
        id: typeof itemData["_id"] === "string" ? itemData["_id"] : itemData["id"] ?? null,
        name: typeof itemData["name"] === "string" ? itemData["name"] : null,
        level:
          itemSystem["level"] ??
          itemDetails["level"] ??
          itemSystem["classLevel"] ??
          itemSystem["currentLevel"] ??
          null,
      };
    });

  return {
    actorId: actor.id ?? null,
    actorType: actor.type ?? null,
    classDataLevels: classData["levels"] ?? null,
    hp,
    classItems,
  };
}

function logCharacterDebugDump(event: string, actor: Actor): void {
  logDebug(event, getCharacterDebugDump(actor));
}

export async function applyWildshapeForm(input: {
  actor: Actor;
  formActor: Actor;
  adapter: WildshapeAdapter;
  itemName: string;
  targetUser?: User;
}): Promise<boolean> {
  const actorId = input.actor.id;
  if (!actorId || !input.formActor.id) {
    logWarning("wildshape.transform.actorIdMissing", {
      actorId: actorId ?? null,
      formActorId: input.formActor.id ?? null,
    });
    return false;
  }

  const currentState = getModuleWildshapeActorState(input.actor);
  if (currentState?.isShaped && currentState.baseActorId !== actorId) {
    logWarning("wildshape.transform.baseActorMismatch", {
      actorId,
      expectedBaseActorId: currentState.baseActorId,
    });
    return false;
  }

  if (!beginActorOperation(actorId)) {
    logWarning("wildshape.transform.inFlight", { actorId });
    return false;
  }

  try {
    const baselineSnapshot =
      currentState?.isShaped && isActorSnapshot(currentState.snapshot)
        ? currentState.snapshot
        : await input.adapter.getActorSnapshot(input.actor);
    const checkpointSnapshot = await input.adapter.getActorSnapshot(input.actor);
    const mappingContext = resolveMappingContextForItemName(input.itemName, input.targetUser);

    logInfo("wildshape.transform.started", {
      actorId,
      formActorId: input.formActor.id,
    });

    try {
      const buildTransformPlanInput: Parameters<WildshapeAdapter["buildTransformPlan"]>[0] = {
        baseActor: input.actor,
        formActor: input.formActor,
        snapshot: checkpointSnapshot,
        filters: mappingContext.filters,
      };
      if (mappingContext.formAbilityUuids.length > 0) {
        buildTransformPlanInput.formAbilityUuids = mappingContext.formAbilityUuids;
      }

      const plan = await input.adapter.buildTransformPlan(buildTransformPlanInput);
      await input.adapter.applyTransform(input.actor, plan);
      await input.adapter.ensureWildshapeAction(input.actor);
      const previousFormActorId = currentState?.isShaped ? currentState.currentFormActorId : null;
      if (previousFormActorId) {
        emitFormTransitionHook(MODULE_HOOKS.ON_LEAVE_FORM, {
          actor: input.actor,
          reason: "transform",
          fromFormActorId: previousFormActorId,
          toFormActorId: input.formActor.id,
          mappingId: mappingContext.mappingId,
          itemName: input.itemName,
        });
      }
      emitFormTransitionHook(MODULE_HOOKS.ON_ENTER_FORM, {
        actor: input.actor,
        reason: "transform",
        fromFormActorId: previousFormActorId,
        toFormActorId: input.formActor.id,
        mappingId: mappingContext.mappingId,
        itemName: input.itemName,
      });
      await input.actor.setFlag(
        MODULE_ID,
        FLAG_KEYS.STATE,
        buildNextState({
          baseActorId: currentState?.isShaped ? currentState.baseActorId : actorId,
          formActorId: input.formActor.id,
          formActorName: input.formActor.name ?? "",
          snapshot: baselineSnapshot,
        })
      );
      logInfo("wildshape.transform.succeeded", {
        actorId,
        formActorId: input.formActor.id,
      });
      return true;
    } catch (error: unknown) {
      logError("wildshape.transform.failed", {
        actorId,
        formActorId: input.formActor.id,
        error: error instanceof Error ? error.message : String(error),
      });
      try {
        await input.adapter.applyRevert(input.actor, checkpointSnapshot, {
          preserveBaseStats: false,
        });
      } catch (rollbackError: unknown) {
        logError("wildshape.transform.rollbackFailed", {
          actorId,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
      ui.notifications?.error("Wildshape transform failed and actor state was restored.");
      return false;
    }
  } finally {
    endActorOperation(actorId);
  }
}

export async function revertWildshapeForm(input: {
  actor: Actor;
  adapter: WildshapeAdapter;
}): Promise<boolean> {
  const actorId = input.actor.id ?? "";
  logCharacterDebugDump("wildshape.debug.revert.before", input.actor);
  const state = getModuleWildshapeActorState(input.actor);
  if (!state?.isShaped || !isActorSnapshot(state.snapshot)) {
    logWarning("wildshape.revert.unavailable", { actorId: input.actor.id ?? null });
    return false;
  }

  if (!beginActorOperation(actorId)) {
    logWarning("wildshape.revert.inFlight", { actorId });
    return false;
  }

  try {
    const checkpointSnapshot = await input.adapter.getActorSnapshot(input.actor);
    try {
      logDebug("wildshape.debug.revert.snapshot", {
        snapshotSystemClassDataLevels:
          (state.snapshot.system as Record<string, unknown>)["classData"] &&
          isRecord((state.snapshot.system as Record<string, unknown>)["classData"])
            ? (
                (state.snapshot.system as Record<string, unknown>)["classData"] as Record<
                  string,
                  unknown
                >
              )["levels"] ?? null
            : null,
        snapshotSystemHp:
          (state.snapshot.system as Record<string, unknown>)["attributes"] &&
          isRecord((state.snapshot.system as Record<string, unknown>)["attributes"])
            ? (
                ((state.snapshot.system as Record<string, unknown>)["attributes"] as Record<
                  string,
                  unknown
                >)["hp"] ?? null
              )
            : null,
      });
      await input.adapter.applyRevert(input.actor, state.snapshot, {
        preserveBaseStats: true,
      });
      logCharacterDebugDump("wildshape.debug.revert.afterApplyRevert", input.actor);
      await input.adapter.ensureWildshapeAction(input.actor);
      logCharacterDebugDump("wildshape.debug.revert.afterEnsureAction", input.actor);
      emitFormTransitionHook(MODULE_HOOKS.ON_LEAVE_FORM, {
        actor: input.actor,
        reason: "revert",
        fromFormActorId: state.currentFormActorId,
        toFormActorId: state.baseActorId,
      });
      emitFormTransitionHook(MODULE_HOOKS.ON_ENTER_FORM, {
        actor: input.actor,
        reason: "revert",
        fromFormActorId: state.currentFormActorId,
        toFormActorId: state.baseActorId,
      });
      await input.actor.unsetFlag(MODULE_ID, FLAG_KEYS.STATE);
      logCharacterDebugDump("wildshape.debug.revert.afterUnsetFlag", input.actor);
      logInfo("wildshape.revert.succeeded", { actorId });
      return true;
    } catch (error: unknown) {
      logError("wildshape.revert.failed", {
        actorId,
        error: error instanceof Error ? error.message : String(error),
      });
      try {
        await input.adapter.applyRevert(input.actor, checkpointSnapshot, {
          preserveBaseStats: false,
        });
        logCharacterDebugDump("wildshape.debug.revert.afterRollback", input.actor);
      } catch (rollbackError: unknown) {
        logError("wildshape.revert.rollbackFailed", {
          actorId,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
      ui.notifications?.error("Wildshape revert failed and actor state was restored.");
      return false;
    }
  } finally {
    endActorOperation(actorId);
  }
}
