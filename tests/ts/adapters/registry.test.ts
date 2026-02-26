import { describe, expect, it } from "vitest";
import { createAdapterRegistry, AdapterRegistry } from "@/ts/adapters/registry";
import type { ActorSnapshot, TransformPlan, WildshapeAdapter } from "@/ts/adapters/types";

class TestAdapter implements WildshapeAdapter {
  public constructor(
    public readonly id: string,
    private readonly active: boolean
  ) {}

  public detect(): boolean {
    return this.active;
  }
  public isWildshapeTrigger(_item: Item): boolean {
    return false;
  }
  public async getActorSnapshot(_actor: Actor): Promise<ActorSnapshot> {
    return {
      takenAt: "2026-02-26T00:00:00.000Z",
      system: {},
      items: [],
      prototypeToken: {},
    };
  }
  public async buildTransformPlan(_input: {
    baseActor: Actor;
    formActor: Actor;
    snapshot: ActorSnapshot;
    filters: { whitelist: string[]; blacklist: string[] };
  }): Promise<TransformPlan> {
    return { actorUpdate: {}, formItemIds: [], formItems: [] };
  }
  public async applyTransform(_actor: Actor, _plan: TransformPlan): Promise<void> {}
  public async applyRevert(
    _actor: Actor,
    _snapshot: ActorSnapshot,
    _options?: { preserveBaseStats?: boolean }
  ): Promise<void> {}
  public async ensureWildshapeAction(_actor: Actor): Promise<void> {}
}

describe("AdapterRegistry", () => {
  it("returns null when no adapter detects active system", () => {
    const registry = new AdapterRegistry();
    registry.register(new TestAdapter("inactive-1", false));
    registry.register(new TestAdapter("inactive-2", false));

    expect(registry.getActiveAdapter()).toBeNull();
  });

  it("returns first matching adapter when multiple adapters are active", () => {
    const registry = new AdapterRegistry();
    const first = new TestAdapter("first", true);
    const second = new TestAdapter("second", true);
    registry.register(first);
    registry.register(second);

    expect(registry.getActiveAdapter()).toBe(first);
  });

  it("factory registers nimble adapter", () => {
    (globalThis as Record<string, unknown>).game = {
      system: { id: "nimble" },
    };
    const registry = createAdapterRegistry();

    expect(registry.getActiveAdapter()?.id).toBe("nimble");
  });
});
