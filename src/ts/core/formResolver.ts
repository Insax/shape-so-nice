import { getEffectiveConfig } from "../config/effectiveConfig";
import { normalizeString } from "../config/normalize";
import type { EffectiveMapping, FormRef } from "../config/types";
import { MODULE_ID } from "../constants";

function getActors(): Actor[] {
  const actorsCollection = (game as Game).actors as unknown as {
    contents?: Actor[];
  };
  return actorsCollection.contents ?? [];
}

function resolveActorByUuid(actors: Actor[], formUuid: string): Actor | undefined {
  return actors.find(
    (actor) =>
      actor.uuid === formUuid ||
      actor.id === formUuid ||
      `Actor.${actor.id ?? ""}` === formUuid
  );
}

function resolveActorByName(actors: Actor[], formName: string): Actor | undefined {
  return actors.find(
    (actor) =>
      typeof actor.name === "string" &&
      normalizeString(actor.name) === normalizeString(formName)
  );
}

export function resolveFormActors(formRefs: FormRef[]): Actor[] {
  const actors = getActors();
  const dedupe = new Map<string, Actor>();

  for (const formRef of formRefs) {
    const resolvedActor =
      formRef.mode === "uuid"
        ? resolveActorByUuid(actors, formRef.value)
        : resolveActorByName(actors, formRef.value);

    if (!resolvedActor) {
      console.warn(`[${MODULE_ID}] Missing form actor reference.`, {
        formRef,
      });
      continue;
    }

    if (resolvedActor.id) {
      dedupe.set(resolvedActor.id, resolvedActor);
    }
  }

  return [...dedupe.values()];
}

export function resolveFormsForMapping(mapping: EffectiveMapping): Actor[] {
  return resolveFormActors(mapping.formRefs);
}

export function resolveMappedFormsForItemName(
  itemName: string,
  targetUser?: User
): Actor[] {
  const effectiveConfig = getEffectiveConfig(targetUser);
  const normalizedItemName = normalizeString(itemName).toLowerCase();

  const mapping = effectiveConfig.mappings.find(
    (entry) =>
      entry.trigger.mode === "itemName" &&
      normalizeString(entry.trigger.value).toLowerCase() === normalizedItemName
  );
  if (!mapping) {
    return [];
  }

  return resolveFormsForMapping(mapping);
}
