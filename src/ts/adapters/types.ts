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
  getItemUseHooks?(): readonly string[];
  isWildshapeTrigger(item: Item): boolean;
  extractItemFromHookArgs?(hookName: string, args: unknown[]): Item | null;
  registerDirectItemUseListener?(onItemUse: (item: Item) => void): boolean;
  extractItemFromChatMessage?(message: unknown): Item | null;
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
