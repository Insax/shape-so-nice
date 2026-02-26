import { MODULE_ID } from "../constants";
import { debugAlert, logError } from "./logger";
import { handleWildshapeItemUse } from "./triggerHandler";
import type { WildshapeAdapter } from "../adapters/types";

const ITEM_USE_HOOKS = [
  "useItem",
  "itemUse",
  "itemUsageComplete",
  "nimble.useItem",
] as const;
const CHAT_MESSAGE_FALLBACK_HOOK = "createChatMessage" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isItemLike(value: unknown): value is Item {
  if (!isRecord(value)) {
    return false;
  }

  if (!("name" in value)) {
    return false;
  }

  // Actor-like payloads frequently include `name` too and can appear before the item in hook args.
  if ("items" in value) {
    return false;
  }

  return true;
}

function extractItemFromArgs(args: unknown[]): Item | null {
  for (const arg of args) {
    if (isRecord(arg) && "item" in arg && isItemLike((arg as { item?: unknown }).item)) {
      return (arg as { item: Item }).item;
    }
  }

  for (const arg of args) {
    if (isItemLike(arg)) {
      return arg;
    }
  }

  return null;
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

function extractItemNameFromChatMessage(message: Record<string, unknown>, actor: Actor): string | null {
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

function extractItemFromChatMessage(message: unknown): Item | null {
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

  const itemName = extractItemNameFromChatMessage(message, actor);
  if (!itemName) {
    return null;
  }

  return {
    name: itemName,
    actor,
  } as Item;
}

export function registerWildshapeHooks(
  getAdapter: () => WildshapeAdapter | null
): void {
  ITEM_USE_HOOKS.forEach((hookName) => {
    Hooks.on(hookName, (...args: unknown[]) => {
      debugAlert(`hook fired: ${hookName}`);

      const item = extractItemFromArgs(args);
      if (!item) {
        debugAlert(`hook ignored (no item extracted): ${hookName}`);
        return;
      }

      debugAlert(`hook extracted item: ${hookName} (${String(item.name)})`);

      void handleWildshapeItemUse(item, getAdapter()).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logError("wildshape.trigger.failed", {
          hookName,
          error: message,
        });
        debugAlert(`hook error in ${hookName}: ${message}`);
      });
    });
  });

  Hooks.on(CHAT_MESSAGE_FALLBACK_HOOK, (...args: unknown[]) => {
    debugAlert(`hook fired: ${CHAT_MESSAGE_FALLBACK_HOOK}`);

    const adapter = getAdapter();
    if (!adapter || adapter.id !== "nimble") {
      debugAlert(
        `chat fallback ignored (adapter mismatch: ${adapter?.id ?? "none"})`
      );
      return;
    }

    const item = extractItemFromChatMessage(args[0]);
    if (!item) {
      debugAlert("chat fallback ignored (no item extracted)");
      return;
    }

    debugAlert(`chat fallback extracted item (${String(item.name)})`);

    void handleWildshapeItemUse(item, adapter).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logError("wildshape.trigger.failed", {
        hookName: CHAT_MESSAGE_FALLBACK_HOOK,
        error: message,
      });
      debugAlert(`hook error in ${CHAT_MESSAGE_FALLBACK_HOOK}: ${message}`);
    });
  });
}

export function getRegisteredItemUseHooks(): readonly string[] {
  return ITEM_USE_HOOKS;
}

export function getModuleHookDebugContext(): { moduleId: string } {
  return { moduleId: MODULE_ID };
}
