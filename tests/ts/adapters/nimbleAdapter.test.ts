import { beforeEach, describe, expect, it, vi } from "vitest";
import { NimbleAdapter } from "@/ts/adapters/nimbleAdapter";

const { getEffectiveConfigMock } = vi.hoisted(() => ({
  getEffectiveConfigMock: vi.fn(),
}));

vi.mock("@/ts/config/effectiveConfig", () => ({
  getEffectiveConfig: getEffectiveConfigMock,
}));

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("NimbleAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { fromUuid?: unknown }).fromUuid;
    delete (globalThis as { CONFIG?: unknown }).CONFIG;
    (globalThis as Record<string, unknown>).foundry = {
      utils: { deepClone: clone },
    };
    getEffectiveConfigMock.mockReset();
    getEffectiveConfigMock.mockReturnValue({
      version: 1,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
  });

  it("detects nimble system id", () => {
    (globalThis as Record<string, unknown>).game = {
      system: { id: "nimble" },
    };
    const adapter = new NimbleAdapter();
    expect(adapter.detect()).toBe(true);

    (globalThis as Record<string, unknown>).game = {
      system: { id: "dnd5e" },
    };
    expect(adapter.detect()).toBe(false);
  });

  it("exposes Nimble item-use hook names for core registration", () => {
    const adapter = new NimbleAdapter();
    expect(adapter.getItemUseHooks()).toEqual(["useItem", "itemUse", "itemUsageComplete"]);
  });

  it("extracts item from supported hook argument shapes", () => {
    const adapter = new NimbleAdapter();
    expect(
      adapter.extractItemFromHookArgs("useItem", [
        {
          item: { name: "Wildshape", actor: { id: "a1" } },
        },
      ])
    ).toEqual({ name: "Wildshape", actor: { id: "a1" } });

    expect(
      adapter.extractItemFromHookArgs("itemUse", [{ name: "Wildshape 2", actor: { id: "a2" } }])
    ).toEqual({ name: "Wildshape 2", actor: { id: "a2" } });

    expect(adapter.extractItemFromHookArgs("useItem", [{ name: "Actor", items: [] }])).toBeNull();
  });

  it("registers a direct item-use listener by wrapping Nimble item activate methods", async () => {
    const onItemUse = vi.fn();

    class TestBaseItem {
      public async activate(): Promise<{ id: string }> {
        return { id: "chat-card" };
      }
    }

    class TestSpellItem extends TestBaseItem {
      public override async activate(): Promise<{ id: string }> {
        return super.activate();
      }
    }

    (globalThis as Record<string, unknown>).CONFIG = {
      Item: {
        documentClasses: {
          base: TestBaseItem,
          spell: TestSpellItem,
        },
      },
    };

    const adapter = new NimbleAdapter();
    expect(adapter.registerDirectItemUseListener(onItemUse)).toBe(true);

    const item = new TestSpellItem() as unknown as Item;
    await (item as unknown as { activate: () => Promise<unknown> }).activate();

    expect(onItemUse).toHaveBeenCalledTimes(1);
    expect(onItemUse).toHaveBeenCalledWith(item);
  });

  it("does not emit direct item-use callback when item activation resolves null", async () => {
    const onItemUse = vi.fn();

    class TestFeatureItem {
      public async activate(): Promise<null> {
        return null;
      }
    }

    (globalThis as Record<string, unknown>).CONFIG = {
      Item: {
        documentClasses: {
          feature: TestFeatureItem,
        },
      },
    };

    const adapter = new NimbleAdapter();
    expect(adapter.registerDirectItemUseListener(onItemUse)).toBe(true);

    const item = new TestFeatureItem() as unknown as Item;
    await (item as unknown as { activate: () => Promise<unknown> }).activate();

    expect(onItemUse).not.toHaveBeenCalled();
  });

  it("returns false when no Nimble item document classes are available for direct listener wrapping", () => {
    const adapter = new NimbleAdapter();
    expect(adapter.registerDirectItemUseListener(vi.fn())).toBe(false);
  });

  it("extracts item payload from Nimble chat message data", () => {
    const actor = { id: "a1", name: "Druid" } as Actor;
    (globalThis as Record<string, unknown>).game = {
      actors: {
        get: vi.fn((id: string) => (id === "a1" ? actor : null)),
      },
    };

    const adapter = new NimbleAdapter();
    expect(
      adapter.extractItemFromChatMessage({
        speaker: { actor: "a1" },
        system: { activation: {}, spellName: "Wildshape" },
        flavor: "Druid: Wildshape",
      })
    ).toEqual({
      name: "Wildshape",
      actor,
    });

    expect(
      adapter.extractItemFromChatMessage({
        speaker: { actor: "a1" },
        system: { activation: {} },
        flavor: "Someone Else: Beast Shape",
      })
    ).toEqual({
      name: "Beast Shape",
      actor,
    });
  });

  it("returns null for invalid Nimble chat messages and supports actors.contents fallback", () => {
    (globalThis as Record<string, unknown>).game = {
      actors: {
        contents: [{ id: "a1", name: "Druid" }],
      },
    };

    const adapter = new NimbleAdapter();
    expect(
      adapter.extractItemFromChatMessage({
        speaker: { actor: "a1" },
        system: { activation: {}, spellName: "Wildshape" },
        flavor: "Druid: Wildshape",
      })
    ).toEqual({
      name: "Wildshape",
      actor: { id: "a1", name: "Druid" },
    });

    expect(adapter.extractItemFromChatMessage("not-a-record")).toBeNull();
    expect(
      adapter.extractItemFromChatMessage({
        speaker: { actor: "missing" },
        system: { activation: {}, spellName: "Wildshape" },
        flavor: "Druid: Wildshape",
      })
    ).toBeNull();
    expect(
      adapter.extractItemFromChatMessage({
        speaker: { actor: "a1" },
        system: {},
        flavor: "Druid: Wildshape",
      })
    ).toBeNull();
    expect(
      adapter.extractItemFromChatMessage({
        speaker: {},
        system: { activation: {}, spellName: "Wildshape" },
        flavor: "Druid: Wildshape",
      })
    ).toBeNull();
    expect(
      adapter.extractItemFromChatMessage({
        speaker: { actor: "a1" },
        system: { activation: {} },
        flavor: "NoSeparatorFlavor",
      })
    ).toBeNull();
  });

  it("captures snapshot from modern actor shape", async () => {
    const actorData = {
      system: { hp: { value: 21 } },
      items: [{ _id: "i1", name: "Claw" }],
      prototypeToken: { texture: { src: "wolf.png" } },
    };
    const actor = { toObject: () => actorData } as unknown as Actor;

    const snapshot = await new NimbleAdapter().getActorSnapshot(actor);
    expect(snapshot.system).toEqual({ hp: { value: 21 } });
    expect(snapshot.items).toEqual([{ _id: "i1", name: "Claw" }]);
    expect(snapshot.prototypeToken).toEqual({ texture: { src: "wolf.png" } });

    actorData.system.hp.value = 1;
    actorData.items[0].name = "Mutated";
    actorData.prototypeToken.texture.src = "mutated.png";
    expect(snapshot.system).toEqual({ hp: { value: 21 } });
    expect(snapshot.items).toEqual([{ _id: "i1", name: "Claw" }]);
    expect(snapshot.prototypeToken).toEqual({ texture: { src: "wolf.png" } });
  });

  it("captures snapshot from legacy actor fields", async () => {
    const actor = {
      toObject: () => ({
        data: { hp: { value: 12 } },
        token: { dimSight: 30 },
      }),
    } as unknown as Actor;

    const snapshot = await new NimbleAdapter().getActorSnapshot(actor);
    expect(snapshot.system).toEqual({ hp: { value: 12 } });
    expect(snapshot.items).toEqual([]);
    expect(snapshot.prototypeToken).toEqual({ dimSight: 30 });
  });

  it("uses empty fallbacks when actor object omits system/token fields", async () => {
    const actor = {
      toObject: () => ({
        items: "not-an-array",
      }),
    } as unknown as Actor;

    const snapshot = await new NimbleAdapter().getActorSnapshot(actor);
    expect(snapshot.system).toEqual({});
    expect(snapshot.items).toEqual([]);
    expect(snapshot.prototypeToken).toEqual({});
  });

  it("builds deterministic transform plan with Nimble keep/take rules", async () => {
    const adapter = new NimbleAdapter();
    const baseActor = {
      toObject: () => ({
        prototypeToken: {
          alpha: 0.5,
          texture: { src: "base.png", scaleX: 1 },
          width: 1,
          height: 1,
          light: { dim: 0 },
        },
      }),
    } as unknown as Actor;
    const formActor = {
      toObject: () => ({
        system: {
          hp: { value: 99 },
          mana: { value: 88 },
          movement: { walk: 40 },
          size: "lg",
          attributes: {
            hp: { value: 50 },
            saves: { fortitude: 6 },
            movement: { fly: 20 },
          },
        },
        prototypeToken: {
          texture: { src: "wolf.png", scaleX: 2 },
          width: 2,
          height: 2,
          light: { dim: 20 },
          detectionModes: [{ id: "basicSight" }],
        },
      }),
      items: {
        contents: [{ id: "z2" }, { id: "a1" }, { id: null }, {}],
      },
    } as unknown as Actor;

    const input = {
      baseActor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {
          hp: { value: 22, max: 30 },
          mana: { value: 10 },
          level: 7,
          abilities: { str: 4 },
          defenses: { ac: 17 },
          saves: { fortitude: 5 },
          skills: { stealth: 8 },
          resources: { focus: 2 },
          wounds: { current: 1 },
          gear: { slots: 3 },
          inventory: { carry: 120 },
          attributes: {
            hp: { value: 22, max: 30 },
            mana: { value: 10 },
            saves: { fortitude: 5 },
            skills: { stealth: 8 },
          },
        },
        items: [],
        prototypeToken: {
          texture: { src: "base-token.png" },
        },
      },
      filters: { whitelist: [], blacklist: [] },
    };

    const plan = await adapter.buildTransformPlan(input);
    expect(plan).toEqual({
      actorUpdate: {
        system: {
          hp: { value: 22, max: 30 },
          mana: { value: 10 },
          movement: { walk: 40 },
          size: "lg",
          level: 7,
          abilities: { str: 4 },
          defenses: { ac: 17 },
          saves: { fortitude: 5 },
          skills: { stealth: 8 },
          resources: { focus: 2 },
          wounds: { current: 1 },
          gear: { slots: 3 },
          inventory: { carry: 120 },
          attributes: {
            hp: { value: 22, max: 30 },
            mana: { value: 10 },
            saves: { fortitude: 5 },
            skills: { stealth: 8 },
            movement: { fly: 20 },
          },
        },
        prototypeToken: {
          alpha: 0.5,
          texture: { src: "wolf.png", scaleX: 2 },
          width: 2,
          height: 2,
          light: { dim: 20 },
          detectionModes: [{ id: "basicSight" }],
        },
      },
      formItemIds: ["a1", "z2"],
      formItems: [
        { flags: { "shape-so-nice": { injected: true } } },
        { flags: { "shape-so-nice": { injected: true } } },
      ],
      baseItemIdsToKeep: [],
    });

    const plan2 = await adapter.buildTransformPlan({
      ...input,
      filters: { whitelist: [], blacklist: [] },
    });
    expect(plan2).toEqual(plan);
  });

  it("preserves class and hp-driving fields from base snapshot", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {
          classData: { startingClass: "wolf", levels: ["wolf"] },
          levelUpHistory: [
            {
              level: 9,
              hpIncrease: 99,
              abilityIncreases: {},
              skillIncreases: {},
              hitDieAdded: false,
              classIdentifier: "wolf",
            },
          ],
          attributes: {
            hp: { value: 8, max: 8 },
            hitDice: { "6": { current: 1, origin: ["wolf"] } },
            bonusHitDice: [{ size: 6, value: 1, name: "d6" }],
            armor: { baseValue: "12", value: 12 },
            movement: { walk: 12 },
          },
        },
        prototypeToken: {},
      }),
      items: { contents: [] },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {
          classData: { startingClass: "druid", levels: ["druid", "druid"] },
          levelUpHistory: [
            {
              level: 2,
              hpIncrease: 5,
              abilityIncreases: {},
              skillIncreases: {},
              hitDieAdded: true,
              classIdentifier: "druid",
            },
          ],
          attributes: {
            hp: { value: 21, max: 30 },
            hitDice: { "8": { current: 2, origin: ["druid"] } },
            bonusHitDice: [{ size: 8, value: 1, name: "d8" }],
            armor: { baseValue: "@dexterity", value: 15 },
          },
        },
        items: [],
        prototypeToken: {},
      },
      filters: { whitelist: [], blacklist: [] },
    });

    expect(plan.actorUpdate.system).toMatchObject({
      classData: { startingClass: "druid", levels: ["druid", "druid"] },
      levelUpHistory: [
        {
          level: 2,
          hpIncrease: 5,
          abilityIncreases: {},
          skillIncreases: {},
          hitDieAdded: true,
          classIdentifier: "druid",
        },
      ],
      attributes: {
        hp: { value: 21, max: 30 },
        hitDice: { "8": { current: 2, origin: ["druid"] } },
        bonusHitDice: [{ size: 8, value: 1, name: "d8" }],
        armor: { baseValue: "@dexterity", value: 15 },
        movement: { walk: 12 },
      },
    });
  });

  it("lets explicit whitelist matches override blacklist and keeps wildshape action item", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: {
        contents: [
          { id: "i1", name: "Bite" },
          { id: "i2", name: "Dash" },
          { id: "i3", name: "Wildshape" },
          { id: "i4", name: "Claw" },
        ],
      },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: [" Bite ", "wildshape"],
        blacklist: ["bite", "wildshape"],
      },
    });

    expect(plan.formItemIds).toEqual(["i1", "i3"]);
    expect(plan.formItems).toEqual([
      {
        name: "Bite",
        flags: { "shape-so-nice": { injected: true } },
      },
      {
        name: "Wildshape",
        flags: { "shape-so-nice": { injected: true } },
      },
    ]);
  });

  it("supports type-based filter entries and name overrides for blacklisted types", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: {
        contents: [
          { id: "i1", name: "Stormshifter", type: "class" },
          { id: "i2", name: "Scholar", type: "background" },
          { id: "i3", name: "Human", type: "ancestry" },
          { id: "i4", name: "Leather Armor", type: "armor" },
          { id: "i5", name: "Torch", type: "object" },
          { id: "i6", name: "Staff", type: "weapon" },
          { id: "i7", name: "Dagger", type: "weapon" },
        ],
      },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: ["class", "type:background", "type:ancestry", "type:armor", "misc", "Staff"],
        blacklist: ["weapon"],
      },
    });

    expect(plan.formItemIds).toEqual(["i1", "i2", "i3", "i4", "i5", "i6"]);
  });

  it("supports Nimble descriptor filters for objectType and featureType", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: {
        contents: [
          { id: "i1", name: "Staff", type: "object", system: { objectType: "weapon" } },
          { id: "i2", name: "Torch", type: "object", system: { objectType: "misc" } },
          { id: "i3", name: "Stormshifter", type: "feature", system: { featureType: "class" } },
        ],
      },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: ["objectType:misc", "featureType:class"],
        blacklist: ["objectType:weapon"],
      },
    });

    expect(plan.formItemIds).toEqual(["i2", "i3"]);
  });

  it("supports name: filters and ignores empty/invalid prefixed filter rules", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: {
        contents: [
          { id: "i1", name: "Bite", type: "weapon" },
          { id: "i2", name: "Dash", type: "object" },
        ],
      },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: [" ", "type:", "name:", "name:bite"],
        blacklist: [],
      },
    });

    expect(plan.formItemIds).toEqual(["i1"]);
  });

  it("handles missing or non-string item types during type-based filtering", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
        items: [
          { _id: "i1", name: "Bite", type: 7 },
          { _id: "i2", name: "Claw" },
        ],
      }),
      items: {},
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: ["type:weapon"],
        blacklist: [],
      },
    });

    expect(plan.formItemIds).toEqual([]);
    expect(plan.formItems).toEqual([]);
  });

  it("supports type-based filtering from actor-object fallback items with string types", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
        items: [{ _id: "i1", name: "Bite", type: "weapon" }],
      }),
      items: {},
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: ["type:weapon"],
        blacklist: [],
      },
    });

    expect(plan.formItemIds).toEqual(["i1"]);
    expect(plan.formItems).toEqual([
      {
        name: "Bite",
        type: "weapon",
        flags: { "shape-so-nice": { injected: true } },
      },
    ]);
  });

  it("removes weapon-classified items even when raw item type differs", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: {
        contents: [
          {
            id: "i1",
            name: "Staff",
            type: "equipment",
            system: {
              classification: "weapon",
            },
          },
          {
            id: "i2",
            name: "Leather Armor",
            type: "armor",
          },
        ],
      },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: [],
        blacklist: ["type:weapon"],
      },
    });

    expect(plan.formItemIds).toEqual(["i2"]);
    expect(plan.formItems).toEqual([
      {
        name: "Leather Armor",
        type: "armor",
        flags: { "shape-so-nice": { injected: true } },
      },
    ]);
  });

  it("does not let type-based whitelist override blacklist, but allows explicit name override", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: {
        contents: [
          {
            id: "i1",
            name: "Staff",
            type: "object",
            system: { classification: "weapon" },
          },
          {
            id: "i2",
            name: "Torch",
            type: "object",
          },
        ],
      },
    } as unknown as Actor;

    const withoutNameOverride = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: ["type:miscellaneous"],
        blacklist: ["type:weapon"],
      },
    });
    expect(withoutNameOverride.formItemIds).toEqual(["i2"]);

    const withNameOverride = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: ["type:miscellaneous", "Staff"],
        blacklist: ["type:weapon"],
      },
    });
    expect(withNameOverride.formItemIds).toEqual(["i1", "i2"]);
  });

  it("matches weapon type from nested system and system.details classification objects", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: {
        contents: [
          {
            id: "i1",
            name: "Arc Staff",
            type: "equipment",
            system: {
              classification: { value: "weapon" },
              details: {
                weaponType: { name: "weapon" },
              },
            },
          },
          {
            id: "i2",
            name: "Book",
            type: "object",
          },
        ],
      },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: [],
        blacklist: ["type:weapon"],
      },
    });

    expect(plan.formItemIds).toEqual(["i2"]);
  });

  it("builds base keep list by excluding injected/non-string ids and blank type candidates", async () => {
    const adapter = new NimbleAdapter();
    const baseActor = {
      toObject: () => ({
        items: [
          { _id: "keep-1", name: "Torch", type: "object" },
          { _id: "drop-1", name: "Staff", type: "equipment", system: { classification: "weapon" } },
          {
            _id: "skip-injected",
            name: "Old Form Bite",
            type: "object",
            flags: { "shape-so-nice": { injected: true } },
          },
          {
            _id: "skip-blank",
            name: "BlankType",
            type: "",
            system: { classification: { value: "   " }, details: { category: { name: "" } } },
          },
          { _id: 7, name: "Bad Wildshape", type: "object" },
          { _id: 8, name: "Wildshape", type: "object" },
        ],
      }),
      items: {},
    } as unknown as Actor;
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: { contents: [] },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: ["type:object"],
        blacklist: ["type:weapon"],
      },
    });

    expect(plan.baseItemIdsToKeep).toEqual(["keep-1"]);
  });

  it("keeps core identity items in base keep list even when whitelist would exclude them", async () => {
    const adapter = new NimbleAdapter();
    const baseActor = {
      toObject: () => ({
        items: [
          {
            _id: "class-feature-1",
            name: "Arcane Tradition",
            type: "feature",
            system: { classification: "class-feature" },
          },
          {
            _id: "tool-1",
            name: "Rope",
            type: "object",
          },
        ],
      }),
      items: {},
    } as unknown as Actor;
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: { contents: [] },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: ["type:object"],
        blacklist: [],
      },
    });

    expect(plan.baseItemIdsToKeep).toEqual(["class-feature-1", "tool-1"]);
  });

  it("keeps core identity items when classification uses spaced/plural labels", async () => {
    const adapter = new NimbleAdapter();
    const baseActor = {
      toObject: () => ({
        items: [
          {
            _id: "class-feature-space",
            name: "Fighting Style",
            type: "feature",
            system: { classification: "class feature" },
          },
          {
            _id: "background-feature-space",
            name: "City Secrets",
            type: "feature",
            system: { classification: "background features" },
          },
          {
            _id: "ancestry-feature-space",
            name: "Stonecunning",
            type: "feature",
            system: { classification: "ancestry feature" },
          },
        ],
      }),
      items: {},
    } as unknown as Actor;
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: { contents: [] },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: ["type:object"],
        blacklist: [],
      },
    });

    expect(plan.baseItemIdsToKeep).toEqual([
      "ancestry-feature-space",
      "background-feature-space",
      "class-feature-space",
    ]);
  });

  it("keeps core identity feature items when Nimble featureType descriptors are present", async () => {
    const adapter = new NimbleAdapter();
    const baseActor = {
      toObject: () => ({
        items: [
          {
            _id: "class-feature-type",
            name: "Fighting Style",
            type: "feature",
            system: { featureType: "class" },
          },
          {
            _id: "tool-1",
            name: "Rope",
            type: "object",
            system: { objectType: "misc" },
          },
        ],
      }),
      items: {},
    } as unknown as Actor;
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: { contents: [] },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: ["type:object"],
        blacklist: [],
      },
    });

    expect(plan.baseItemIdsToKeep).toEqual(["class-feature-type", "tool-1"]);
  });

  it("ignores mapped form ability UUID entries when unresolved and dedupes UUID list", async () => {
    delete (globalThis as { fromUuid?: unknown }).fromUuid;

    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: { contents: [] },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: [],
        blacklist: [],
      },
      formAbilityUuids: [" ", "Actor.form.Item.bite", "Actor.form.Item.bite"],
    });

    expect(plan.formItems).toEqual([]);
  });

  it("resolves mapped form ability UUIDs and injects valid item payloads only", async () => {
    (globalThis as Record<string, unknown>).fromUuid = vi.fn(async (uuid: string) => {
      if (uuid === "invalid-record") {
        return null;
      }
      if (uuid === "wrong-type") {
        return { documentName: "Actor" };
      }
      if (uuid === "broken-to-object") {
        return {
          documentName: "Item",
          toObject: () => null,
        };
      }
      if (uuid === "item-to-object") {
        return {
          documentName: "Item",
          toObject: () => ({
            _id: "mapped-1",
            name: "Roar",
            type: "feature",
          }),
        };
      }
      if (uuid === "item-record") {
        return {
          documentName: "Item",
          _id: "mapped-2",
          name: "Pounce",
          type: "feature",
        };
      }
      return null;
    });

    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: { contents: [] },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: [],
        blacklist: [],
      },
      formAbilityUuids: [
        "invalid-record",
        "wrong-type",
        "broken-to-object",
        "item-to-object",
        "item-record",
      ],
    });

    expect(plan.formItems).toEqual([
      {
        name: "Roar",
        type: "feature",
        flags: { "shape-so-nice": { injected: true, sourceUuid: "item-to-object" } },
      },
      {
        name: "Pounce",
        type: "feature",
        documentName: "Item",
        flags: { "shape-so-nice": { injected: true, sourceUuid: "item-record" } },
      },
    ]);
  });

  it("supports form items with toObject and preserves existing scoped flags", async () => {
    const adapter = new NimbleAdapter();
    const toObjectPayload = {
      _id: "i1",
      name: "Bite",
      flags: {
        "shape-so-nice": { persisted: true },
        wildshape: { fromForm: true },
        source: { module: "nimble" },
      },
    };
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
      }),
      items: {
        contents: [
          {
            id: "ignored-id",
            toObject: () => clone(toObjectPayload),
          },
        ],
      },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: ["bite"],
        blacklist: [],
      },
    });

    expect(plan.formItemIds).toEqual(["i1"]);
    expect(plan.formItems).toEqual([
      {
        name: "Bite",
        flags: {
          wildshape: { fromForm: true },
          "shape-so-nice": { persisted: true, injected: true },
          source: { module: "nimble" },
        },
      },
    ]);
    expect(toObjectPayload.flags.wildshape).toEqual({ fromForm: true });
  });

  it("filters item IDs from toObject items fallback when contents are unavailable", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
        items: [
          { _id: "i1", name: "Bite" },
          { id: "i2", name: "Dash" },
          "invalid",
          { _id: 3, name: "Claw" },
        ],
      }),
      items: {},
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: [],
        blacklist: ["dash"],
      },
    });

    expect(plan.formItemIds).toEqual(["i1"]);
    expect(plan.formItems).toEqual([
      {
        name: "Bite",
        flags: { "shape-so-nice": { injected: true } },
      },
    ]);
  });

  it("falls back to actor object items when item collection contents are not an array", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
        items: [{ _id: "i1", name: "Bite" }],
      }),
      items: {
        contents: "invalid-contents",
      },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: [],
        blacklist: [],
      },
    });

    expect(plan.formItemIds).toEqual(["i1"]);
    expect(plan.formItems).toEqual([
      {
        name: "Bite",
        flags: { "shape-so-nice": { injected: true } },
      },
    ]);
  });

  it("dedupes merged item sources by id and prefers collection item payload", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
        items: [
          { _id: "i1", name: "Bite (fallback)" },
          { _id: "i2", name: "Wildshape" },
        ],
      }),
      items: {
        contents: [{ id: "i1", name: "Bite (collection)" }],
      },
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: [],
        blacklist: [],
      },
    });

    expect(plan.formItemIds).toEqual(["i1", "i2"]);
    expect(plan.formItems).toEqual([
      {
        name: "Bite (collection)",
        flags: { "shape-so-nice": { injected: true } },
      },
      {
        name: "Wildshape",
        flags: { "shape-so-nice": { injected: true } },
      },
    ]);
  });

  it("normalizes non-string fallback item names during whitelist filtering", async () => {
    const adapter = new NimbleAdapter();
    const formActor = {
      toObject: () => ({
        system: {},
        prototypeToken: {},
        items: [
          { _id: "i1", name: 123 },
          { _id: "i2", name: "Wildshape" },
        ],
      }),
      items: {},
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor: { toObject: () => ({}) } as unknown as Actor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {},
        items: [],
        prototypeToken: {},
      },
      filters: {
        whitelist: ["wildshape"],
        blacklist: [],
      },
    });

    expect(plan.formItemIds).toEqual(["i2"]);
  });

  it("handles non-object actor data and sparse snapshots when building plans", async () => {
    const adapter = new NimbleAdapter();
    const baseActor = {
      toObject: () => ({
        prototypeToken: "invalid-token",
      }),
    } as unknown as Actor;
    const formActor = {
      toObject: () => ({
        data: "invalid-system",
        token: "invalid-token",
      }),
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {
          hp: { value: 5 },
          attributes: "invalid-attributes" as unknown as Record<string, unknown>,
        },
        items: [],
        prototypeToken: {},
      },
      filters: { whitelist: [], blacklist: [] },
    });

    expect(plan).toEqual({
      actorUpdate: {
        system: {
          hp: { value: 5 },
        },
        prototypeToken: {},
      },
      formItemIds: [],
      formItems: [],
      baseItemIdsToKeep: [],
    });
  });

  it("uses legacy system/token fallbacks and attribute merge fallback when needed", async () => {
    const adapter = new NimbleAdapter();
    const baseActor = {
      toObject: () => ({
        token: { alpha: 0.25 },
      }),
    } as unknown as Actor;
    const formActor = {
      toObject: () => ({
        data: {
          movement: { walk: 25 },
          attributes: "invalid-form-attributes",
        },
        token: { light: { dim: 15 } },
      }),
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {
          hp: { value: 20 },
          attributes: { hp: { value: 20 }, saves: { fortitude: 3 } },
        },
        items: [],
        prototypeToken: {},
      },
      filters: { whitelist: [], blacklist: [] },
    });

    expect(plan).toEqual({
      actorUpdate: {
        system: {
          movement: { walk: 25 },
          attributes: { hp: { value: 20 }, saves: { fortitude: 3 } },
          hp: { value: 20 },
        },
        prototypeToken: {
          alpha: 0.25,
          light: { dim: 15 },
        },
      },
      formItemIds: [],
      formItems: [],
      baseItemIdsToKeep: [],
    });
  });

  it("uses empty-object fallbacks when system and token sources are missing", async () => {
    const adapter = new NimbleAdapter();
    const baseActor = {
      toObject: () => ({}),
    } as unknown as Actor;
    const formActor = {
      toObject: () => ({}),
    } as unknown as Actor;

    const plan = await adapter.buildTransformPlan({
      baseActor,
      formActor,
      snapshot: {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {
          hp: { value: 7 },
        },
        items: [],
        prototypeToken: {},
      },
      filters: { whitelist: [], blacklist: [] },
    });

    expect(plan).toEqual({
      actorUpdate: {
        system: {
          hp: { value: 7 },
        },
        prototypeToken: {},
      },
      formItemIds: [],
      formItems: [],
      baseItemIdsToKeep: [],
    });
  });

  it("applies transform by replacing injected items and creating new form items", async () => {
    const adapter = new NimbleAdapter();
    const tokenDocumentUpdate = vi.fn().mockResolvedValue(undefined);
    const actor = {
      toObject: () => ({
        items: [],
      }),
      items: {
        contents: [
          { id: "old-form", flags: { wildshape: { injected: true } } },
          { id: "player-item", flags: {} },
        ],
      },
      getActiveTokens: vi.fn().mockReturnValue([
        { document: { update: tokenDocumentUpdate } },
      ]),
      deleteEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      createEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
    } as unknown as Actor;

    await adapter.applyTransform(actor, {
      actorUpdate: {
        system: { hp: { value: 11 } },
        prototypeToken: { width: 2, height: 2, texture: { src: "wolf.png" }, alpha: 0.5 },
      },
      formItemIds: ["new-form"],
      formItems: [{ name: "Bite", flags: { "shape-so-nice": { injected: true } } }],
    });

    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["old-form"]);
    expect(actor.update).toHaveBeenCalledWith({
      system: { hp: { value: 11 } },
      prototypeToken: { width: 2, height: 2, texture: { src: "wolf.png" }, alpha: 0.5 },
    });
    expect(tokenDocumentUpdate).toHaveBeenCalledWith({
      width: 2,
      height: 2,
      texture: { src: "wolf.png" },
    });
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
      { name: "Bite", flags: { "shape-so-nice": { injected: true } } },
    ]);
  });

  it("removes base items that are not listed in baseItemIdsToKeep during transform", async () => {
    const adapter = new NimbleAdapter();
    const actor = {
      toObject: () => ({
        items: [],
      }),
      items: {
        contents: [
          { id: "base-keep", flags: {} },
          { id: "base-drop", flags: {} },
          { id: "old-form", flags: { wildshape: { injected: true } } },
        ],
      },
      deleteEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      createEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
      getActiveTokens: vi.fn().mockReturnValue([]),
    } as unknown as Actor;

    await adapter.applyTransform(actor, {
      actorUpdate: { system: {} },
      formItemIds: [],
      formItems: [],
      baseItemIdsToKeep: ["base-keep"],
    });

    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["old-form", "base-drop"]);
  });

  it("ignores malformed item entries while finding injected transform items", async () => {
    const adapter = new NimbleAdapter();
    const actor = {
      toObject: () => ({
        items: [],
      }),
      items: {
        contents: [
          "invalid-entry",
          { id: null, flags: { "shape-so-nice": { injected: true } } },
          { id: "non-object-flags", flags: "bad-flags" },
          { id: "old-form", flags: { "shape-so-nice": { injected: true } } },
        ],
      },
      deleteEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      createEmbeddedDocuments: vi.fn(),
    } as unknown as Actor;

    await adapter.applyTransform(actor, {
      actorUpdate: { system: { hp: { value: 9 } } },
      formItemIds: [],
      formItems: [],
    });

    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["old-form"]);
    expect(actor.update).toHaveBeenCalledWith({
      system: { hp: { value: 9 } },
    });
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("skips deletion/creation when transform has no injected items or form items", async () => {
    const adapter = new NimbleAdapter();
    const actor = {
      toObject: () => ({
        items: [],
      }),
      items: {
        contents: [{ id: "player-item", flags: {} }],
      },
      deleteEmbeddedDocuments: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      createEmbeddedDocuments: vi.fn(),
    } as unknown as Actor;

    await adapter.applyTransform(actor, {
      actorUpdate: { system: {}, prototypeToken: {} },
      formItemIds: [],
      formItems: [],
    });

    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("ignores malformed active token collections when applying transform", async () => {
    const adapter = new NimbleAdapter();
    const actor = {
      toObject: () => ({
        items: [],
      }),
      items: {
        contents: [],
      },
      getActiveTokens: vi.fn().mockReturnValue("not-an-array"),
      deleteEmbeddedDocuments: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      createEmbeddedDocuments: vi.fn(),
    } as unknown as Actor;

    await adapter.applyTransform(actor, {
      actorUpdate: { prototypeToken: { width: 3, height: 3 } },
      formItemIds: [],
      formItems: [],
    });

    expect(actor.update).toHaveBeenCalledWith({
      prototypeToken: { width: 3, height: 3 },
    });
  });

  it("handles actors without active token API when applying transform", async () => {
    const adapter = new NimbleAdapter();
    const actor = {
      toObject: () => ({
        items: [],
      }),
      items: {
        contents: [],
      },
      deleteEmbeddedDocuments: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      createEmbeddedDocuments: vi.fn(),
    } as unknown as Actor;

    await adapter.applyTransform(actor, {
      actorUpdate: { prototypeToken: { width: 1, height: 1 } },
      formItemIds: [],
      formItems: [],
    });

    expect(actor.update).toHaveBeenCalledWith({
      prototypeToken: { width: 1, height: 1 },
    });
  });

  it("skips unsupported active token entries when syncing token documents", async () => {
    const adapter = new NimbleAdapter();
    const actor = {
      toObject: () => ({
        items: [],
      }),
      items: {
        contents: [],
      },
      getActiveTokens: vi.fn().mockReturnValue([
        "invalid-token-entry",
        { id: "token-without-updater" },
      ]),
      deleteEmbeddedDocuments: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      createEmbeddedDocuments: vi.fn(),
    } as unknown as Actor;

    await adapter.applyTransform(actor, {
      actorUpdate: { prototypeToken: { width: 4, height: 4 } },
      formItemIds: [],
      formItems: [],
    });

    expect(actor.update).toHaveBeenCalledWith({
      prototypeToken: { width: 4, height: 4 },
    });
  });

  it("applies rollback-style revert by restoring system/token and replacing all items from snapshot", async () => {
    const adapter = new NimbleAdapter();
    const directTokenDocumentUpdate = vi.fn().mockResolvedValue(undefined);
    const actor = {
      toObject: () => ({
        items: [{ _id: "fallback-item" }],
      }),
      items: {
        contents: [{ id: "old-1" }, { id: "old-2" }],
      },
      getActiveTokens: vi.fn().mockReturnValue([
        { update: directTokenDocumentUpdate },
      ]),
      deleteEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      createEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
    } as unknown as Actor;

    await adapter.applyRevert(
      actor,
      {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: { hp: { value: 22 } },
        prototypeToken: { width: 1 },
        items: [
          { _id: "snap-1", name: "Staff", type: "equipment" },
          { id: "snap-2", name: "Wildshape", flags: { "shape-so-nice": { injected: true } } },
        ],
      },
      {
        preserveBaseStats: false,
      }
    );

    expect(actor.update).toHaveBeenCalledWith({
      system: { hp: { value: 22 } },
      prototypeToken: { width: 1 },
    });
    expect(directTokenDocumentUpdate).toHaveBeenCalledWith({
      width: 1,
    });
    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", [
      "old-1",
      "old-2",
      "fallback-item",
    ]);
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
      { name: "Staff", type: "equipment" },
      { name: "Wildshape", flags: { "shape-so-nice": { injected: true } } },
    ]);
  });

  it("restores only missing snapshot items on normal revert", async () => {
    const adapter = new NimbleAdapter();
    const actor = {
      toObject: () => ({
        items: [{ _id: "base-1", name: "Base" }],
      }),
      items: {
        contents: [{ id: "form-1", flags: { wildshape: { injected: true } } }],
      },
      deleteEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      createEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
    } as unknown as Actor;

    await adapter.applyRevert(actor, {
      takenAt: "2026-02-26T00:00:00.000Z",
      system: {},
      prototypeToken: {},
      items: [{ _id: "base-1", name: "Base" }],
    });

    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["form-1"]);
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("recreates missing base items from snapshot on normal revert", async () => {
    const adapter = new NimbleAdapter();
    const actor = {
      toObject: () => ({
        items: [{ _id: "base-keep", name: "Keep" }],
      }),
      items: {
        contents: [{ id: "form-1", flags: { wildshape: { injected: true } } }],
      },
      deleteEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      createEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
    } as unknown as Actor;

    await adapter.applyRevert(actor, {
      takenAt: "2026-02-26T00:00:00.000Z",
      system: {},
      prototypeToken: {},
      items: [
        { _id: "base-keep", name: "Keep" },
        { _id: "base-removed", name: "Removed Item", type: "object" },
      ],
    });

    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["form-1"]);
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
      { name: "Removed Item", type: "object" },
    ]);
  });

  it("recreates snapshot items without ids on normal revert", async () => {
    const adapter = new NimbleAdapter();
    const actor = {
      toObject: () => ({
        items: [],
      }),
      items: { contents: [] },
      deleteEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      createEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
    } as unknown as Actor;

    await adapter.applyRevert(actor, {
      takenAt: "2026-02-26T00:00:00.000Z",
      system: {},
      prototypeToken: {},
      items: [{ name: "Unnamed Snapshot Item", type: "object" }],
    });

    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
      { name: "Unnamed Snapshot Item", type: "object" },
    ]);
  });

  it("preserves live hp and level-driving fields when reverting to original form", async () => {
    const adapter = new NimbleAdapter();
    const actor = {
      toObject: () => ({
        system: {
          classData: { startingClass: "druid", levels: ["druid", "druid", "druid"] },
          levelUpHistory: [{ level: 3 }],
          resources: { mana: { current: 2, baseMax: 7 } },
          attributes: {
            hp: { value: 9, max: 26 },
            hitDice: { "8": { current: 2, origin: ["druid"] } },
            bonusHitDice: [{ size: 8, value: 1, name: "d8" }],
            armor: { baseValue: "@dexterity", value: 15 },
            movement: { walk: 40 },
          },
        },
        items: [],
      }),
      items: { contents: [] },
      update: vi.fn().mockResolvedValue(undefined),
      deleteEmbeddedDocuments: vi.fn(),
      createEmbeddedDocuments: vi.fn(),
    } as unknown as Actor;

    await adapter.applyRevert(actor, {
      takenAt: "2026-02-26T00:00:00.000Z",
      system: {
        classData: { startingClass: "druid", levels: ["druid"] },
        levelUpHistory: [{ level: 1 }],
        resources: { mana: { current: 7, baseMax: 7 } },
        attributes: {
          hp: { value: 26, max: 26 },
          hitDice: { "8": { current: 1, origin: ["druid"] } },
          bonusHitDice: [],
          armor: { baseValue: "10", value: 10 },
          movement: { walk: 6 },
        },
      },
      prototypeToken: { width: 1 },
      items: [],
    });

    expect(actor.update).toHaveBeenCalledWith({
      system: {
        classData: { startingClass: "druid", levels: ["druid", "druid", "druid"] },
        levelUpHistory: [{ level: 3 }],
        resources: { mana: { current: 2, baseMax: 7 } },
        attributes: {
          hp: { value: 9, max: 26 },
          hitDice: { "8": { current: 2, origin: ["druid"] } },
          bonusHitDice: [{ size: 8, value: 1, name: "d8" }],
          armor: { baseValue: "@dexterity", value: 15 },
          movement: { walk: 6 },
        },
      },
      prototypeToken: { width: 1 },
    });
  });

  it("restores exact snapshot system when preserveBaseStats is disabled", async () => {
    const adapter = new NimbleAdapter();
    const actor = {
      toObject: () => ({
        system: {
          classData: { startingClass: "druid", levels: ["druid", "druid", "druid"] },
          attributes: {
            hp: { value: 9, max: 26 },
            movement: { walk: 40 },
          },
        },
        items: [],
      }),
      items: { contents: [] },
      update: vi.fn().mockResolvedValue(undefined),
      deleteEmbeddedDocuments: vi.fn(),
      createEmbeddedDocuments: vi.fn(),
    } as unknown as Actor;

    await adapter.applyRevert(
      actor,
      {
        takenAt: "2026-02-26T00:00:00.000Z",
        system: {
          classData: { startingClass: "druid", levels: ["druid"] },
          attributes: {
            hp: { value: 26, max: 26 },
            movement: { walk: 6 },
          },
        },
        prototypeToken: {},
        items: [],
      },
      {
        preserveBaseStats: false,
      }
    );

    expect(actor.update).toHaveBeenCalledWith({
      system: {
        classData: { startingClass: "druid", levels: ["druid"] },
        attributes: {
          hp: { value: 26, max: 26 },
          movement: { walk: 6 },
        },
      },
      prototypeToken: {},
    });
  });

  it("skips item creation on revert when snapshot items are empty", async () => {
    const adapter = new NimbleAdapter();
    const actor = {
      toObject: () => ({
        items: [],
      }),
      items: {
        contents: [],
      },
      deleteEmbeddedDocuments: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      createEmbeddedDocuments: vi.fn(),
    } as unknown as Actor;

    await adapter.applyRevert(actor, {
      takenAt: "2026-02-26T00:00:00.000Z",
      system: {},
      prototypeToken: {},
      items: [],
    });

    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("ensures configured wildshape trigger actions exist on actor", async () => {
    getEffectiveConfigMock.mockReturnValue({
      version: 1,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [],
          filters: { whitelist: [], blacklist: [] },
        },
        {
          id: "map_2",
          trigger: { mode: "itemName", value: " Storm Shift " },
          formRefs: [],
          filters: { whitelist: [], blacklist: [] },
        },
        {
          id: "map_3",
          trigger: { mode: "itemName", value: "wildshape" },
          formRefs: [],
          filters: { whitelist: [], blacklist: [] },
        },
      ],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    const actor = {
      toObject: () => ({
        items: [],
      }),
      items: {
        contents: [{ id: "i1", name: "Wildshape", type: "feature" }],
      },
      createEmbeddedDocuments: vi.fn().mockResolvedValue(undefined),
    } as unknown as Actor;

    await new NimbleAdapter().ensureWildshapeAction(actor);

    expect(actor.createEmbeddedDocuments).toHaveBeenCalledWith("Item", [
      {
        name: "Storm Shift",
        type: "feature",
        system: {
          featureType: "class",
        },
        flags: {
          "shape-so-nice": {
            injected: true,
            ensuredAction: true,
          },
        },
      },
    ]);
  });

  it("skips ensureWildshapeAction when all configured triggers already exist", async () => {
    getEffectiveConfigMock.mockReturnValue({
      version: 1,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [],
          filters: { whitelist: [], blacklist: [] },
        },
      ],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    const actor = {
      toObject: () => ({
        items: [],
      }),
      items: {
        contents: [{ id: "i1", name: "wildshape", type: "feature" }],
      },
      createEmbeddedDocuments: vi.fn(),
    } as unknown as Actor;

    await new NimbleAdapter().ensureWildshapeAction(actor);

    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("skips ensureWildshapeAction when actor cannot create embedded items", async () => {
    getEffectiveConfigMock.mockReturnValue({
      version: 1,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [],
          filters: { whitelist: [], blacklist: [] },
        },
      ],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });

    await expect(
      new NimbleAdapter().ensureWildshapeAction({
        toObject: () => ({ items: [] }),
        items: { contents: [] },
      } as unknown as Actor)
    ).resolves.toBeUndefined();
  });

  it("skips ensureWildshapeAction when no trigger mappings are configured", async () => {
    getEffectiveConfigMock.mockReturnValue({
      version: 1,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    const createEmbeddedDocuments = vi.fn();
    const actor = {
      toObject: () => ({ items: [] }),
      items: { contents: [] },
      createEmbeddedDocuments,
    } as unknown as Actor;

    await new NimbleAdapter().ensureWildshapeAction(actor);

    expect(createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("matches trigger item names from effective config", () => {
    getEffectiveConfigMock.mockReturnValue({
      version: 1,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: " Wildshape " },
          formRefs: [],
          filters: { whitelist: [], blacklist: [] },
        },
      ],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    const adapter = new NimbleAdapter();

    expect(adapter.isWildshapeTrigger({ name: "wildshape" } as Item)).toBe(true);
    expect(adapter.isWildshapeTrigger({ name: "Not Wildshape" } as Item)).toBe(false);
    expect(adapter.isWildshapeTrigger({} as Item)).toBe(false);
  });
});
