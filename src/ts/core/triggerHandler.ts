import type { WildshapeAdapter } from "../adapters/types";
import { debugAlert, logError, logInfo, logWarning } from "./logger";
import { openWildshapeChooser } from "./chooser";

export async function handleWildshapeItemUse(
  item: Item,
  adapter: WildshapeAdapter | null,
  targetUser?: User
): Promise<boolean> {
  if (!adapter) {
    debugAlert("trigger ignored: no active adapter");
    return false;
  }

  let isTrigger = false;
  try {
    isTrigger = adapter.isWildshapeTrigger(item);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError("wildshape.trigger.matcherFailed", {
      itemName: item.name ?? "",
      error: message,
    });
    debugAlert(`trigger matcher failed: ${message}`);
    return false;
  }

  if (!isTrigger) {
    debugAlert(`trigger ignored: item not mapped (${String(item.name)})`);
    return false;
  }

  const actor = item.actor;
  if (!actor) {
    debugAlert(`trigger ignored: actor missing (${String(item.name)})`);
    logWarning("wildshape.trigger.actorMissing", { itemName: item.name ?? "" });
    return false;
  }

  logInfo("wildshape.trigger.detected", {
    actorId: actor.id,
    itemName: item.name ?? "",
  });
  debugAlert(`trigger detected: ${String(item.name)}`);
  let opened = false;
  try {
    opened = await openWildshapeChooser({
      actor,
      item,
      adapter,
      targetUser,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logError("wildshape.trigger.chooserFailed", {
      actorId: actor.id ?? null,
      itemName: item.name ?? "",
      error: message,
    });
    debugAlert(`chooser failed: ${message}`);
    return false;
  }

  if (!opened) {
    debugAlert(`chooser did not open for ${String(item.name)}`);
  }
  return opened;
}
