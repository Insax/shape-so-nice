import type { AbilityFilters } from "../config/types";

export interface ActorSnapshot {
  takenAt: string;
  system: Record<string, unknown>;
  items: Record<string, unknown>[];
  prototypeToken: Record<string, unknown>;
}

export interface TransformPlan {
  actorUpdate: Record<string, unknown>;
  formItemIds: string[];
  formItems: Record<string, unknown>[];
  baseItemIdsToKeep?: string[];
}

export interface WildshapeAdapter {
  id: string;
  detect(): boolean;
  isWildshapeTrigger(item: Item): boolean;
  getActorSnapshot(actor: Actor): Promise<ActorSnapshot>;
  buildTransformPlan(input: {
    baseActor: Actor;
    formActor: Actor;
    snapshot: ActorSnapshot;
    filters: AbilityFilters;
    formAbilityUuids?: string[];
  }): Promise<TransformPlan>;
  applyTransform(actor: Actor, plan: TransformPlan): Promise<void>;
  applyRevert(
    actor: Actor,
    snapshot: ActorSnapshot,
    options?: {
      preserveBaseStats?: boolean;
    }
  ): Promise<void>;
  ensureWildshapeAction(actor: Actor): Promise<void>;
}
