import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODULE_ID } from "@/ts/constants";
import {
  getModuleHookDebugContext,
  getRegisteredItemUseHooks,
  registerWildshapeHooks,
} from "@/ts/core/hooks";

const { handleWildshapeItemUseMock } = vi.hoisted(() => ({
  handleWildshapeItemUseMock: vi.fn(),
}));

const { logErrorMock } = vi.hoisted(() => ({
  logErrorMock: vi.fn(),
}));
const { debugAlertMock } = vi.hoisted(() => ({
  debugAlertMock: vi.fn(),
}));

vi.mock("@/ts/core/triggerHandler", () => ({
  handleWildshapeItemUse: handleWildshapeItemUseMock,
}));
vi.mock("@/ts/core/logger", () => ({
  logError: logErrorMock,
  debugAlert: debugAlertMock,
}));

type HookCallbackMap = Record<string, (...args: unknown[]) => void>;

describe("hooks", () => {
  let callbacks: HookCallbackMap;
  let actorsById: Record<string, Actor>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    callbacks = {};
    handleWildshapeItemUseMock.mockResolvedValue(false);
    debugAlertMock.mockReset();
    actorsById = {
      "a1": { id: "a1", name: "Druid" } as Actor,
      "a2": { id: "a2", name: "Beast" } as Actor,
    };

    (globalThis as Record<string, unknown>).Hooks = {
      on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        callbacks[event] = callback;
      }),
    };
    (globalThis as Record<string, unknown>).game = {
      actors: {
        get: vi.fn((id: string) => actorsById[id] ?? null),
      },
    };
  });

  it("exposes static hook metadata", () => {
    expect(getRegisteredItemUseHooks()).toEqual([
      "useItem",
      "itemUse",
      "itemUsageComplete",
      "nimble.useItem",
    ]);
    expect(getModuleHookDebugContext()).toEqual({ moduleId: MODULE_ID });
  });

  it("registers callbacks for all item-use hooks", () => {
    registerWildshapeHooks(() => null);
    expect(Object.keys(callbacks)).toEqual([
      ...getRegisteredItemUseHooks(),
      "createChatMessage",
    ]);
  });

  it("ignores events that do not contain an item-like payload", async () => {
    registerWildshapeHooks(() => ({ id: "nimble" } as unknown as never));
    callbacks.useItem("not-item");
    callbacks.useItem({ item: { bad: true } });
    callbacks.useItem({ name: "Actor Payload", items: [] });
    callbacks.createChatMessage({});
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).not.toHaveBeenCalled();
  });

  it("extracts direct item payloads and nested payload.item", async () => {
    registerWildshapeHooks(() => ({ id: "nimble" } as unknown as never));
    callbacks.itemUse({ name: "Wildshape", actor: { id: "a1" } });
    callbacks.itemUsageComplete({ item: { name: "Wildshape 2", actor: { id: "a2" } } });
    callbacks.useItem(
      { name: "Druid", items: [] },
      { item: { name: "Wildshape 3", actor: { id: "a1" } } }
    );
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).toHaveBeenCalledTimes(3);
    expect(handleWildshapeItemUseMock).toHaveBeenNthCalledWith(
      1,
      { name: "Wildshape", actor: { id: "a1" } },
      { id: "nimble" }
    );
    expect(handleWildshapeItemUseMock).toHaveBeenNthCalledWith(
      2,
      { name: "Wildshape 2", actor: { id: "a2" } },
      { id: "nimble" }
    );
    expect(handleWildshapeItemUseMock).toHaveBeenNthCalledWith(
      3,
      { name: "Wildshape 3", actor: { id: "a1" } },
      { id: "nimble" }
    );
  });

  it("uses Nimble chat-message fallback when message contains activation context", async () => {
    registerWildshapeHooks(() => ({ id: "nimble" } as unknown as never));
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {}, spellName: "Wildshape" },
      flavor: "Druid: Wildshape",
    });
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {} },
      flavor: "Druid: Beast Shape",
    });
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).toHaveBeenCalledTimes(2);
    expect(handleWildshapeItemUseMock).toHaveBeenNthCalledWith(
      1,
      { name: "Wildshape", actor: actorsById["a1"] },
      { id: "nimble" }
    );
    expect(handleWildshapeItemUseMock).toHaveBeenNthCalledWith(
      2,
      { name: "Beast Shape", actor: actorsById["a1"] },
      { id: "nimble" }
    );
  });

  it("ignores chat fallback when adapter is non-nimble or payload is incomplete", async () => {
    registerWildshapeHooks(() => null);
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {}, spellName: "Wildshape" },
      flavor: "Druid: Wildshape",
    });

    registerWildshapeHooks(() => ({ id: "other" } as unknown as never));
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {}, spellName: "Wildshape" },
      flavor: "Druid: Wildshape",
    });

    registerWildshapeHooks(() => ({ id: "nimble" } as unknown as never));
    callbacks.createChatMessage("not-a-record");
    callbacks.createChatMessage({
      speaker: { actor: "missing" },
      system: { activation: {}, spellName: "Wildshape" },
      flavor: "Druid: Wildshape",
    });
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: {},
      flavor: "Druid: Wildshape",
    });
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {} },
      flavor: "No Delimiter",
    });
    callbacks.createChatMessage({
      speaker: { actor: 123 },
      system: { activation: {} },
      flavor: "Druid: Wildshape",
    });
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {} },
      flavor: "Druid:",
    });
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {} },
      flavor: "Other:",
    });
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {} },
    });
    callbacks.createChatMessage({
      system: { activation: {}, spellName: "Wildshape" },
      flavor: "Druid: Wildshape",
    });
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: "bad",
      flavor: "Druid: Wildshape",
    });
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).not.toHaveBeenCalled();
  });

  it("parses chat flavor with generic actor prefix separator", async () => {
    registerWildshapeHooks(() => ({ id: "nimble" } as unknown as never));
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {} },
      flavor: "Someone Else: Wildshape from Flavor",
    });
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).toHaveBeenCalledWith(
      { name: "Wildshape from Flavor", actor: actorsById["a1"] },
      { id: "nimble" }
    );
  });

  it("falls back to flavor parsing when system name is blank", async () => {
    registerWildshapeHooks(() => ({ id: "nimble" } as unknown as never));
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {}, spellName: "   " },
      flavor: "Druid: Wildshape via Flavor",
    });
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).toHaveBeenCalledWith(
      { name: "Wildshape via Flavor", actor: actorsById["a1"] },
      { id: "nimble" }
    );
  });

  it("handles actor lookup fallbacks for missing and contents-only actor collections", async () => {
    registerWildshapeHooks(() => ({ id: "nimble" } as unknown as never));

    (globalThis as Record<string, unknown>).game = {};
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {}, spellName: "Wildshape" },
      flavor: "Druid: Wildshape",
    });

    (globalThis as Record<string, unknown>).game = {
      actors: {
        contents: [{ id: "a1", name: "Druid" }],
      },
    };
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {}, spellName: "Wildshape" },
      flavor: "Druid: Wildshape",
    });

    (globalThis as Record<string, unknown>).game = {
      actors: {},
    };
    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {}, spellName: "Wildshape" },
      flavor: "Druid: Wildshape",
    });
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).toHaveBeenCalledTimes(1);
    expect(handleWildshapeItemUseMock).toHaveBeenCalledWith(
      { name: "Wildshape", actor: { id: "a1", name: "Druid" } },
      { id: "nimble" }
    );
  });

  it("logs structured errors if trigger handling throws", async () => {
    handleWildshapeItemUseMock.mockRejectedValueOnce(new Error("boom"));
    registerWildshapeHooks(() => ({ id: "nimble" } as unknown as never));

    callbacks["nimble.useItem"]({ name: "Wildshape" });
    await Promise.resolve();
    await Promise.resolve();

    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.failed", {
      hookName: "nimble.useItem",
      error: "boom",
    });
    expect(debugAlertMock).toHaveBeenCalledWith("hook error in nimble.useItem: boom");
  });

  it("logs non-Error rejection values for item-use hooks", async () => {
    handleWildshapeItemUseMock.mockRejectedValueOnce("plain item failure");
    registerWildshapeHooks(() => ({ id: "nimble" } as unknown as never));

    callbacks["nimble.useItem"]({ name: "Wildshape", actor: { id: "a1" } });
    await Promise.resolve();
    await Promise.resolve();

    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.failed", {
      hookName: "nimble.useItem",
      error: "plain item failure",
    });
    expect(debugAlertMock).toHaveBeenCalledWith(
      "hook error in nimble.useItem: plain item failure"
    );
  });

  it("logs non-Error rejection values as strings", async () => {
    handleWildshapeItemUseMock.mockRejectedValueOnce("plain failure");
    registerWildshapeHooks(() => ({ id: "nimble" } as unknown as never));

    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {}, spellName: "Wildshape" },
      flavor: "Druid: Wildshape",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.failed", {
      hookName: "createChatMessage",
      error: "plain failure",
    });
    expect(debugAlertMock).toHaveBeenCalledWith(
      "hook error in createChatMessage: plain failure"
    );
  });

  it("logs Error objects for chat fallback hook failures", async () => {
    handleWildshapeItemUseMock.mockRejectedValueOnce(new Error("chat boom"));
    registerWildshapeHooks(() => ({ id: "nimble" } as unknown as never));

    callbacks.createChatMessage({
      speaker: { actor: "a1" },
      system: { activation: {}, spellName: "Wildshape" },
      flavor: "Druid: Wildshape",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.failed", {
      hookName: "createChatMessage",
      error: "chat boom",
    });
    expect(debugAlertMock).toHaveBeenCalledWith("hook error in createChatMessage: chat boom");
  });
});
