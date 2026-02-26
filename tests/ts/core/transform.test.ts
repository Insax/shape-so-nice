import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODULE_HOOKS } from "@/ts/constants";
import { applyWildshapeForm, revertWildshapeForm } from "@/ts/core/transform";

const { getEffectiveConfigMock, getModuleWildshapeActorStateMock } = vi.hoisted(() => ({
  getEffectiveConfigMock: vi.fn(),
  getModuleWildshapeActorStateMock: vi.fn(),
}));

const { logInfoMock, logWarningMock, logErrorMock, logDebugMock } = vi.hoisted(() => ({
  logInfoMock: vi.fn(),
  logWarningMock: vi.fn(),
  logErrorMock: vi.fn(),
  logDebugMock: vi.fn(),
}));

vi.mock("@/ts/config/effectiveConfig", () => ({
  getEffectiveConfig: getEffectiveConfigMock,
}));
vi.mock("@/ts/core/state", () => ({
  getModuleWildshapeActorState: getModuleWildshapeActorStateMock,
}));
vi.mock("@/ts/core/logger", () => ({
  logInfo: logInfoMock,
  logWarning: logWarningMock,
  logError: logErrorMock,
  logDebug: logDebugMock,
}));

function snapshot(label: string) {
  return {
    takenAt: label,
    system: {},
    items: [],
    prototypeToken: {},
  };
}

function createActor(id: string | null) {
  return {
    id,
    setFlag: vi.fn().mockResolvedValue(undefined),
    unsetFlag: vi.fn().mockResolvedValue(undefined),
  } as unknown as Actor;
}

describe("transform", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    getEffectiveConfigMock.mockReset();
    getModuleWildshapeActorStateMock.mockReset();
    logDebugMock.mockReset();
    getEffectiveConfigMock.mockReturnValue({
      version: 1,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    (globalThis as Record<string, unknown>).ui = {
      notifications: {
        error: vi.fn(),
      },
    };
  });

  it("rejects transform when actor/form ids are missing", async () => {
    const adapter = {
      getActorSnapshot: vi.fn(),
    };

    expect(
      await applyWildshapeForm({
        actor: createActor(null),
        formActor: { id: "f1", name: "Wolf" } as Actor,
        adapter: adapter as unknown as never,
        itemName: "Wildshape",
      })
    ).toBe(false);
    expect(
      await applyWildshapeForm({
        actor: createActor("a1"),
        formActor: { id: null, name: "Wolf" } as unknown as Actor,
        adapter: adapter as unknown as never,
        itemName: "Wildshape",
      })
    ).toBe(false);
    expect(logWarningMock).toHaveBeenCalledTimes(2);
  });

  it("rejects transform when shaped state base actor mismatches", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "other",
      currentFormActorId: "f1",
      currentFormName: "Wolf",
      snapshot: snapshot("base"),
    });

    const result = await applyWildshapeForm({
      actor: createActor("a1"),
      formActor: { id: "f2", name: "Bear" } as Actor,
      adapter: {} as never,
      itemName: "Wildshape",
    });

    expect(result).toBe(false);
    expect(logWarningMock).toHaveBeenCalledWith("wildshape.transform.baseActorMismatch", {
      actorId: "a1",
      expectedBaseActorId: "other",
    });
  });

  it("captures baseline snapshot on first transform and persists state", async () => {
    getEffectiveConfigMock.mockReturnValue({
      version: 1,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [],
          filters: { whitelist: ["Bite"], blacklist: ["Dash"] },
          formAbilityUuids: ["Actor.wolf-id.Item.bite-id"],
        },
      ],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    getModuleWildshapeActorStateMock.mockReturnValue(null);
    const actor = createActor("a1");
    const adapter = {
      getActorSnapshot: vi
        .fn()
        .mockResolvedValueOnce(snapshot("baseline"))
        .mockResolvedValueOnce(snapshot("checkpoint")),
      buildTransformPlan: vi.fn().mockResolvedValue({ actorUpdate: {}, formItemIds: [] }),
      applyTransform: vi.fn().mockResolvedValue(undefined),
      ensureWildshapeAction: vi.fn().mockResolvedValue(undefined),
      applyRevert: vi.fn(),
    };

    const result = await applyWildshapeForm({
      actor,
      formActor: { id: "f1", name: "Wolf Form" } as Actor,
      adapter: adapter as unknown as never,
      itemName: " Wildshape ",
      targetUser: { id: "u1" } as User,
    });

    expect(result).toBe(true);
    expect(adapter.buildTransformPlan).toHaveBeenCalledWith({
      baseActor: actor,
      formActor: { id: "f1", name: "Wolf Form" },
      snapshot: snapshot("checkpoint"),
      filters: { whitelist: ["Bite"], blacklist: ["Dash"] },
      formAbilityUuids: ["Actor.wolf-id.Item.bite-id"],
    });
    expect(actor.setFlag).toHaveBeenCalledTimes(1);
    const setFlagMock = actor.setFlag as unknown as ReturnType<typeof vi.fn>;
    const statePayload = setFlagMock.mock.calls[0][2] as {
      baseActorId: string;
      currentFormActorId: string;
      currentFormName: string;
      snapshot: { takenAt: string };
    };
    expect(statePayload.baseActorId).toBe("a1");
    expect(statePayload.currentFormActorId).toBe("f1");
    expect(statePayload.currentFormName).toBe("Wolf Form");
    expect(statePayload.snapshot.takenAt).toBe("baseline");
  });

  it("treats non-shaped stored state as fresh baseline source", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: false,
      baseActorId: "",
      currentFormActorId: "",
      currentFormName: "",
      snapshot: null,
    });
    const actor = createActor("a1");
    const adapter = {
      getActorSnapshot: vi
        .fn()
        .mockResolvedValueOnce(snapshot("baseline"))
        .mockResolvedValueOnce(snapshot("checkpoint")),
      buildTransformPlan: vi.fn().mockResolvedValue({ actorUpdate: {}, formItemIds: [] }),
      applyTransform: vi.fn().mockResolvedValue(undefined),
      ensureWildshapeAction: vi.fn().mockResolvedValue(undefined),
      applyRevert: vi.fn(),
    };

    const result = await applyWildshapeForm({
      actor,
      formActor: { id: "f1", name: null } as unknown as Actor,
      adapter: adapter as unknown as never,
      itemName: "Wildshape",
    });

    expect(result).toBe(true);
    const setFlagMock = actor.setFlag as unknown as ReturnType<typeof vi.fn>;
    const statePayload = setFlagMock.mock.calls[0][2] as {
      baseActorId: string;
      currentFormName: string;
    };
    expect(statePayload.baseActorId).toBe("a1");
    expect(statePayload.currentFormName).toBe("");
  });

  it("emits module onLeave/onEnter hooks on successful form transitions", async () => {
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
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f1",
      currentFormName: "Wolf",
      snapshot: snapshot("stored-baseline"),
    });
    const callAll = vi.fn();
    (globalThis as Record<string, unknown>).Hooks = { callAll };

    const actor = createActor("a1");
    const adapter = {
      getActorSnapshot: vi.fn().mockResolvedValue(snapshot("checkpoint")),
      buildTransformPlan: vi.fn().mockResolvedValue({ actorUpdate: {}, formItemIds: [] }),
      applyTransform: vi.fn().mockResolvedValue(undefined),
      ensureWildshapeAction: vi.fn().mockResolvedValue(undefined),
      applyRevert: vi.fn().mockResolvedValue(undefined),
    };

    const transformed = await applyWildshapeForm({
      actor,
      formActor: { id: "f2", name: "Bear Form" } as Actor,
      adapter: adapter as unknown as never,
      itemName: "Wildshape",
    });
    expect(transformed).toBe(true);

    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f2",
      currentFormName: "Bear Form",
      snapshot: snapshot("stored-baseline"),
    });

    const reverted = await revertWildshapeForm({
      actor,
      adapter: adapter as unknown as never,
    });
    expect(reverted).toBe(true);

    expect(callAll).toHaveBeenCalledWith(
      MODULE_HOOKS.ON_LEAVE_FORM,
      expect.objectContaining({
        reason: "transform",
        fromFormActorId: "f1",
        toFormActorId: "f2",
      })
    );
    expect(callAll).toHaveBeenCalledWith(
      MODULE_HOOKS.ON_ENTER_FORM,
      expect.objectContaining({
        reason: "transform",
        fromFormActorId: "f1",
        toFormActorId: "f2",
      })
    );
    expect(callAll).toHaveBeenCalledWith(
      MODULE_HOOKS.ON_LEAVE_FORM,
      expect.objectContaining({
        reason: "revert",
        fromFormActorId: "f2",
        toFormActorId: "a1",
      })
    );
    expect(callAll).toHaveBeenCalledWith(
      MODULE_HOOKS.ON_ENTER_FORM,
      expect.objectContaining({
        reason: "revert",
        fromFormActorId: "f2",
        toFormActorId: "a1",
      })
    );
  });

  it("continues transform when module hook handlers throw", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue(null);
    const actor = createActor("a1");
    const adapter = {
      getActorSnapshot: vi
        .fn()
        .mockResolvedValueOnce(snapshot("baseline"))
        .mockResolvedValueOnce(snapshot("checkpoint")),
      buildTransformPlan: vi.fn().mockResolvedValue({ actorUpdate: {}, formItemIds: [] }),
      applyTransform: vi.fn().mockResolvedValue(undefined),
      ensureWildshapeAction: vi.fn().mockResolvedValue(undefined),
      applyRevert: vi.fn().mockResolvedValue(undefined),
    };
    (globalThis as Record<string, unknown>).Hooks = {
      callAll: vi.fn(() => {
        throw new Error("hook exploded");
      }),
    };

    const result = await applyWildshapeForm({
      actor,
      formActor: { id: "f2", name: "Bear Form" } as Actor,
      adapter: adapter as unknown as never,
      itemName: "Wildshape",
    });

    expect(result).toBe(true);
    expect(logWarningMock).toHaveBeenCalledWith("wildshape.transform.hookCallFailed", {
      hookName: MODULE_HOOKS.ON_ENTER_FORM,
      actorId: "a1",
      error: "hook exploded",
    });
  });

  it("handles hook throw payload formatting for non-Error values and null actor id", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f1",
      currentFormName: "Wolf",
      snapshot: snapshot("stored"),
    });
    (globalThis as Record<string, unknown>).Hooks = {
      callAll: vi.fn(() => {
        throw "hook-string-error";
      }),
    };
    const adapter = {
      getActorSnapshot: vi.fn().mockResolvedValue(snapshot("checkpoint")),
      applyRevert: vi.fn().mockResolvedValue(undefined),
      ensureWildshapeAction: vi.fn().mockResolvedValue(undefined),
    };

    const result = await revertWildshapeForm({
      actor: createActor(null),
      adapter: adapter as unknown as never,
    });

    expect(result).toBe(true);
    expect(logWarningMock).toHaveBeenCalledWith("wildshape.transform.hookCallFailed", {
      hookName: MODULE_HOOKS.ON_LEAVE_FORM,
      actorId: null,
      error: "hook-string-error",
    });
  });

  it("reuses shaped baseline snapshot when valid and falls back to empty filters", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f1",
      currentFormName: "Wolf",
      snapshot: snapshot("stored-baseline"),
    });
    const actor = createActor("a1");
    const adapter = {
      getActorSnapshot: vi.fn().mockResolvedValue(snapshot("checkpoint")),
      buildTransformPlan: vi.fn().mockResolvedValue({ actorUpdate: {}, formItemIds: [] }),
      applyTransform: vi.fn().mockResolvedValue(undefined),
      ensureWildshapeAction: vi.fn().mockResolvedValue(undefined),
      applyRevert: vi.fn(),
    };

    const result = await applyWildshapeForm({
      actor,
      formActor: { id: "f2", name: "Bear Form" } as Actor,
      adapter: adapter as unknown as never,
      itemName: "Unknown",
    });

    expect(result).toBe(true);
    expect(adapter.getActorSnapshot).toHaveBeenCalledTimes(1);
    expect(adapter.buildTransformPlan).toHaveBeenCalledWith({
      baseActor: actor,
      formActor: { id: "f2", name: "Bear Form" },
      snapshot: snapshot("checkpoint"),
      filters: { whitelist: [], blacklist: [] },
    });
  });

  it("rolls back and notifies when transform apply fails", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f1",
      currentFormName: "Wolf",
      snapshot: { bad: true },
    });
    const actor = createActor("a1");
    const adapter = {
      getActorSnapshot: vi
        .fn()
        .mockResolvedValueOnce(snapshot("baseline-fallback"))
        .mockResolvedValueOnce(snapshot("checkpoint")),
      buildTransformPlan: vi.fn().mockResolvedValue({ actorUpdate: {}, formItemIds: [] }),
      applyTransform: vi.fn().mockRejectedValue(new Error("transform failed")),
      ensureWildshapeAction: vi.fn(),
      applyRevert: vi.fn().mockResolvedValue(undefined),
    };

    const result = await applyWildshapeForm({
      actor,
      formActor: { id: "f2", name: "Bear Form" } as Actor,
      adapter: adapter as unknown as never,
      itemName: "Wildshape",
    });

    const uiMock = (globalThis as Record<string, unknown>).ui as {
      notifications: { error: ReturnType<typeof vi.fn> };
    };
    expect(result).toBe(false);
    expect(adapter.applyRevert).toHaveBeenCalledWith(actor, snapshot("checkpoint"), {
      preserveBaseStats: false,
    });
    expect(uiMock.notifications.error).toHaveBeenCalledTimes(1);
  });

  it("handles rollback failures during transform failure", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue(null);
    const adapter = {
      getActorSnapshot: vi
        .fn()
        .mockResolvedValueOnce(snapshot("baseline"))
        .mockResolvedValueOnce(snapshot("checkpoint")),
      buildTransformPlan: vi.fn().mockResolvedValue({ actorUpdate: {}, formItemIds: [] }),
      applyTransform: vi.fn().mockRejectedValue("boom"),
      ensureWildshapeAction: vi.fn(),
      applyRevert: vi.fn().mockRejectedValue("rollback failed"),
    };

    const result = await applyWildshapeForm({
      actor: createActor("a1"),
      formActor: { id: "f1", name: "Wolf" } as Actor,
      adapter: adapter as unknown as never,
      itemName: "Wildshape",
    });

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith("wildshape.transform.rollbackFailed", {
      actorId: "a1",
      error: "rollback failed",
    });
  });

  it("handles rollback failures with Error instances during transform failure", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue(null);
    const adapter = {
      getActorSnapshot: vi
        .fn()
        .mockResolvedValueOnce(snapshot("baseline"))
        .mockResolvedValueOnce(snapshot("checkpoint")),
      buildTransformPlan: vi.fn().mockResolvedValue({ actorUpdate: {}, formItemIds: [] }),
      applyTransform: vi.fn().mockRejectedValue("boom"),
      ensureWildshapeAction: vi.fn(),
      applyRevert: vi.fn().mockRejectedValue(new Error("rollback boom")),
    };

    const result = await applyWildshapeForm({
      actor: createActor("a1"),
      formActor: { id: "f1", name: "Wolf" } as Actor,
      adapter: adapter as unknown as never,
      itemName: "Wildshape",
    });

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith("wildshape.transform.rollbackFailed", {
      actorId: "a1",
      error: "rollback boom",
    });
  });

  it("blocks concurrent transform operations for the same actor", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue(null);
    let resolvePlan: ((value: { actorUpdate: Record<string, unknown>; formItemIds: string[] }) => void) | null =
      null;
    const planPromise = new Promise<{ actorUpdate: Record<string, unknown>; formItemIds: string[] }>(
      (resolve) => {
        resolvePlan = resolve;
      }
    );
    const actor = createActor("a1");
    const adapter = {
      getActorSnapshot: vi
        .fn()
        .mockResolvedValueOnce(snapshot("baseline"))
        .mockResolvedValueOnce(snapshot("checkpoint")),
      buildTransformPlan: vi.fn().mockImplementation(() => planPromise),
      applyTransform: vi.fn().mockResolvedValue(undefined),
      ensureWildshapeAction: vi.fn().mockResolvedValue(undefined),
      applyRevert: vi.fn(),
    };

    const first = applyWildshapeForm({
      actor,
      formActor: { id: "f1", name: "Wolf" } as Actor,
      adapter: adapter as unknown as never,
      itemName: "Wildshape",
    });

    const second = await applyWildshapeForm({
      actor,
      formActor: { id: "f2", name: "Bear" } as Actor,
      adapter: adapter as unknown as never,
      itemName: "Wildshape",
    });

    expect(second).toBe(false);
    expect(logWarningMock).toHaveBeenCalledWith("wildshape.transform.inFlight", {
      actorId: "a1",
    });

    resolvePlan?.({ actorUpdate: {}, formItemIds: [] });
    expect(await first).toBe(true);
    expect(adapter.buildTransformPlan).toHaveBeenCalledTimes(1);
  });

  it("returns false when revert is unavailable", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue(null);
    expect(
      await revertWildshapeForm({
        actor: createActor("a1"),
        adapter: {} as never,
      })
    ).toBe(false);
    expect(
      await revertWildshapeForm({
        actor: createActor(null),
        adapter: {} as never,
      })
    ).toBe(false);

    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f1",
      currentFormName: "Wolf",
      snapshot: "bad-snapshot",
    });
    expect(
      await revertWildshapeForm({
        actor: createActor("a1"),
        adapter: {} as never,
      })
    ).toBe(false);
  });

  it("writes revert debug dump to logger before availability check", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue(null);
    const actor = {
      id: "a1",
      type: "character",
      toObject: () => ({
        system: {
          classData: { levels: ["stormshifter", "stormshifter"] },
          attributes: { hp: { value: 26, max: 30 } },
        },
        items: [
          {
            _id: "class-1",
            type: "class",
            name: "Stormshifter",
            system: {
              details: { level: 2 },
            },
          },
        ],
      }),
    } as unknown as Actor;

    const result = await revertWildshapeForm({
      actor,
      adapter: {} as never,
    });

    expect(result).toBe(false);
    expect(logDebugMock).toHaveBeenCalledWith(
      "wildshape.debug.revert.before",
      expect.objectContaining({
        actorId: "a1",
        actorType: "character",
      })
    );
  });

  it("reverts actor and clears state flag when snapshot is valid", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f1",
      currentFormName: "Wolf",
      snapshot: snapshot("stored"),
    });
    const actor = createActor("a1");
    const adapter = {
      getActorSnapshot: vi.fn().mockResolvedValue(snapshot("checkpoint")),
      applyRevert: vi.fn().mockResolvedValue(undefined),
      ensureWildshapeAction: vi.fn().mockResolvedValue(undefined),
    };

    const result = await revertWildshapeForm({
      actor,
      adapter: adapter as unknown as never,
    });

    expect(result).toBe(true);
    expect(adapter.applyRevert).toHaveBeenCalledWith(actor, snapshot("stored"), {
      preserveBaseStats: true,
    });
    expect(actor.unsetFlag).toHaveBeenCalledTimes(1);
  });

  it("rolls back and notifies when revert fails", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f1",
      currentFormName: "Wolf",
      snapshot: snapshot("stored"),
    });
    const actor = createActor("a1");
    const adapter = {
      getActorSnapshot: vi.fn().mockResolvedValue(snapshot("checkpoint")),
      applyRevert: vi
        .fn()
        .mockRejectedValueOnce(new Error("revert failed"))
        .mockResolvedValueOnce(undefined),
      ensureWildshapeAction: vi.fn(),
    };

    const result = await revertWildshapeForm({
      actor,
      adapter: adapter as unknown as never,
    });

    const uiMock = (globalThis as Record<string, unknown>).ui as {
      notifications: { error: ReturnType<typeof vi.fn> };
    };
    expect(result).toBe(false);
    expect(adapter.applyRevert).toHaveBeenNthCalledWith(2, actor, snapshot("checkpoint"), {
      preserveBaseStats: false,
    });
    expect(uiMock.notifications.error).toHaveBeenCalledTimes(1);
  });

  it("handles rollback failures during revert failure", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f1",
      currentFormName: "Wolf",
      snapshot: snapshot("stored"),
    });
    const actor = createActor("a1");
    const adapter = {
      getActorSnapshot: vi.fn().mockResolvedValue(snapshot("checkpoint")),
      applyRevert: vi.fn().mockRejectedValue("failed"),
      ensureWildshapeAction: vi.fn(),
    };

    const result = await revertWildshapeForm({
      actor,
      adapter: adapter as unknown as never,
    });

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith("wildshape.revert.rollbackFailed", {
      actorId: "a1",
      error: "failed",
    });
  });

  it("handles rollback failures with Error instances during revert failure", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f1",
      currentFormName: "Wolf",
      snapshot: snapshot("stored"),
    });
    const actor = createActor("a1");
    const adapter = {
      getActorSnapshot: vi.fn().mockResolvedValue(snapshot("checkpoint")),
      applyRevert: vi.fn().mockRejectedValue(new Error("rollback explode")),
      ensureWildshapeAction: vi.fn(),
    };

    const result = await revertWildshapeForm({
      actor,
      adapter: adapter as unknown as never,
    });

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith("wildshape.revert.rollbackFailed", {
      actorId: "a1",
      error: "rollback explode",
    });
  });

  it("blocks concurrent revert operations for the same actor", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f1",
      currentFormName: "Wolf",
      snapshot: snapshot("stored"),
    });
    let releaseRevert: (() => void) | null = null;
    const revertPromise = new Promise<void>((resolve) => {
      releaseRevert = resolve;
    });
    const actor = createActor("a1");
    const adapter = {
      getActorSnapshot: vi.fn().mockResolvedValue(snapshot("checkpoint")),
      applyRevert: vi.fn().mockImplementation(() => revertPromise),
      ensureWildshapeAction: vi.fn().mockResolvedValue(undefined),
    };

    const first = revertWildshapeForm({
      actor,
      adapter: adapter as unknown as never,
    });
    const second = await revertWildshapeForm({
      actor,
      adapter: adapter as unknown as never,
    });

    expect(second).toBe(false);
    expect(logWarningMock).toHaveBeenCalledWith("wildshape.revert.inFlight", {
      actorId: "a1",
    });

    releaseRevert?.();
    expect(await first).toBe(true);
    expect(adapter.applyRevert).toHaveBeenCalledTimes(1);
  });
});
