import { MODULE_ID } from "../constants";
import { getGlobalConfig } from "../config/settings";
import { debugAlert, logError } from "./logger";
import { handleWildshapeItemUse } from "./triggerHandler";
import type { WildshapeAdapter } from "../adapters/types";
import { isRecord } from "../utils/typeGuards";

const DEFAULT_ITEM_USE_HOOKS = [
  "useItem",
  "itemUse",
  "itemUsageComplete",
] as const;
const CHAT_MESSAGE_FALLBACK_HOOK = "createChatMessage" as const;
const DIRECT_ITEM_USE_SOURCE = "adapter.directItemUse" as const;

function isChatFallbackEnabled(): boolean {
  try {
    return getGlobalConfig().ui.useChatFallback ?? true;
  } catch {
    return true;
  }
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

function resolveUserById(userId: string): User | null {
  const gameRef = (globalThis as { game?: Game }).game;
  const usersCollection = gameRef?.users as unknown as
    | {
        get?: (id: string) => User | undefined;
        contents?: User[];
      }
    | undefined;

  const userFromGet = usersCollection?.get?.(userId);
  if (userFromGet) {
    return userFromGet;
  }

  const users = usersCollection?.contents;
  if (!Array.isArray(users)) {
    return null;
  }

  return users.find((user) => user.id === userId) ?? null;
}

function getCurrentUserId(): string | null {
  const gameRef = (globalThis as { game?: Game }).game;
  const userId = gameRef?.user?.id;
  return typeof userId === "string" && userId.trim().length > 0 ? userId : null;
}

function resolveUserFromValue(value: unknown): User | null {
  if (typeof value === "string") {
    return resolveUserById(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  const candidateId = value["id"] ?? value["_id"] ?? value["userId"];
  if (typeof candidateId !== "string" || candidateId.trim().length === 0) {
    return null;
  }

  const normalizedCandidateId = candidateId.trim();
  const resolvedUser = resolveUserById(normalizedCandidateId);
  if (resolvedUser) {
    return resolvedUser;
  }

  // Some hook payloads only provide an ID-like user shape; a lightweight user reference is sufficient.
  return { id: normalizedCandidateId } as unknown as User;
}

function extractTargetUserFromHookArgs(args: unknown[]): User | null {
  for (const arg of args) {
    if (!isRecord(arg)) {
      continue;
    }

    const directCandidates = [arg["user"], arg["targetUser"], arg["author"], arg["userId"]];
    for (const candidate of directCandidates) {
      const resolved = resolveUserFromValue(candidate);
      if (resolved) {
        return resolved;
      }
    }

    if ("isGM" in arg || "active" in arg || "role" in arg || "character" in arg) {
      const resolved = resolveUserFromValue(arg);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

function extractTargetUserFromChatMessage(message: unknown): User | null {
  if (!isRecord(message)) {
    return null;
  }

  const candidates = [
    message["author"],
    message["user"],
    message["userId"],
    message["speaker"],
  ];
  for (const candidate of candidates) {
    const resolved = resolveUserFromValue(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function shouldHandleForCurrentUser(targetUser: User | null): boolean {
  if (!targetUser?.id) {
    return true;
  }

  const currentUserId = getCurrentUserId();
  if (!currentUserId) {
    return true;
  }

  return currentUserId === targetUser.id;
}

function resolveItemUseHooks(adapter: WildshapeAdapter | null): string[] {
  const hooksFromAdapter =
    adapter && typeof adapter.getItemUseHooks === "function"
      ? adapter.getItemUseHooks()
      : null;

  const candidateHooks = Array.isArray(hooksFromAdapter)
    ? hooksFromAdapter
    : [...DEFAULT_ITEM_USE_HOOKS];
  const normalized = candidateHooks
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return normalized.length > 0 ? [...new Set(normalized)] : [...DEFAULT_ITEM_USE_HOOKS];
}

export function registerWildshapeHooks(
  getAdapter: () => WildshapeAdapter | null
): void {
  const adapter = getAdapter();
  const itemUseHooks = resolveItemUseHooks(adapter);
  const directItemUseEnabled =
    adapter && typeof adapter.registerDirectItemUseListener === "function"
      ? adapter.registerDirectItemUseListener((item) => {
          const targetUser = resolveUserById(getCurrentUserId() ?? "");
          const handlerPromise = targetUser
            ? handleWildshapeItemUse(item, getAdapter(), targetUser)
            : handleWildshapeItemUse(item, getAdapter());

          void handlerPromise.catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            logError("wildshape.trigger.failed", {
              hookName: DIRECT_ITEM_USE_SOURCE,
              error: message,
            });
            debugAlert(`hook error in ${DIRECT_ITEM_USE_SOURCE}: ${message}`);
          });
        })
      : false;

  itemUseHooks.forEach((hookName) => {
    Hooks.on(hookName, (...args: unknown[]) => {
      if (directItemUseEnabled) {
        debugAlert(`hook ignored (direct listener active): ${hookName}`);
        return;
      }

      debugAlert(`hook fired: ${hookName}`);

      let item: Item | null = null;
      if (adapter && typeof adapter.extractItemFromHookArgs === "function") {
        try {
          item = adapter.extractItemFromHookArgs(hookName, args);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          logError("wildshape.trigger.failed", {
            hookName,
            error: message,
          });
          debugAlert(`hook error in ${hookName}: ${message}`);
          return;
        }
      }

      if (!item) {
        item = extractItemFromArgs(args);
      }

      if (!item) {
        debugAlert(`hook ignored (no item extracted): ${hookName}`);
        return;
      }

      debugAlert(`hook extracted item: ${hookName} (${String(item.name)})`);

      const targetUser = extractTargetUserFromHookArgs(args);
      if (!shouldHandleForCurrentUser(targetUser)) {
        debugAlert(`hook ignored (different initiator): ${hookName}`);
        return;
      }

      const handlerPromise = targetUser
        ? handleWildshapeItemUse(item, getAdapter(), targetUser)
        : handleWildshapeItemUse(item, getAdapter());
      void handlerPromise.catch((error: unknown) => {
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
    if (directItemUseEnabled) {
      return;
    }

    if (!isChatFallbackEnabled()) {
      return;
    }

    debugAlert(`hook fired: ${CHAT_MESSAGE_FALLBACK_HOOK}`);

    const adapter = getAdapter();
    if (!adapter) {
      debugAlert("chat fallback ignored (no active adapter)");
      return;
    }

    if (typeof adapter.extractItemFromChatMessage !== "function") {
      debugAlert(
        `chat fallback ignored (adapter cannot parse chat: ${adapter.id})`
      );
      return;
    }

    let item: Item | null = null;
    try {
      item = adapter.extractItemFromChatMessage(args[0]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logError("wildshape.trigger.failed", {
        hookName: CHAT_MESSAGE_FALLBACK_HOOK,
        error: message,
      });
      debugAlert(`hook error in ${CHAT_MESSAGE_FALLBACK_HOOK}: ${message}`);
      return;
    }

    if (!item) {
      debugAlert("chat fallback ignored (no item extracted)");
      return;
    }

    debugAlert(`chat fallback extracted item (${String(item.name)})`);

    const targetUser = extractTargetUserFromChatMessage(args[0]);
    if (!shouldHandleForCurrentUser(targetUser)) {
      debugAlert("chat fallback ignored (different initiator)");
      return;
    }

    const handlerPromise = targetUser
      ? handleWildshapeItemUse(item, adapter, targetUser)
      : handleWildshapeItemUse(item, adapter);
    void handlerPromise.catch((error: unknown) => {
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
  return DEFAULT_ITEM_USE_HOOKS;
}

export function getModuleHookDebugContext(): { moduleId: string } {
  return { moduleId: MODULE_ID };
}
