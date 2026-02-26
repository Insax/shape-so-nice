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

const { getGlobalConfigMock } = vi.hoisted(() => ({
  getGlobalConfigMock: vi.fn(),
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
vi.mock("@/ts/config/settings", () => ({
  getGlobalConfig: getGlobalConfigMock,
}));
vi.mock("@/ts/core/logger", () => ({
  logError: logErrorMock,
  debugAlert: debugAlertMock,
}));

type HookCallbackMap = Record<string, (...args: unknown[]) => void>;

function createAdapter(input?: {
  id?: string;
  parser?: (message: unknown) => Item | null;
  registerDirect?: (onItemUse: (item: Item) => void) => boolean;
  extractFromHookArgs?: (hookName: string, args: unknown[]) => Item | null;
  itemUseHooks?: readonly string[];
}) {
  return {
    id: input?.id ?? "test-adapter",
    extractItemFromChatMessage: input?.parser,
    registerDirectItemUseListener: input?.registerDirect,
    extractItemFromHookArgs: input?.extractFromHookArgs,
    getItemUseHooks: input?.itemUseHooks ? () => input.itemUseHooks! : undefined,
  } as unknown as never;
}

describe("hooks", () => {
  let callbacks: HookCallbackMap;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    callbacks = {};
    handleWildshapeItemUseMock.mockResolvedValue(false);
    debugAlertMock.mockReset();
    getGlobalConfigMock.mockReset();
    getGlobalConfigMock.mockReturnValue({
      version: 1,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false, useChatFallback: true },
    });

    (globalThis as Record<string, unknown>).Hooks = {
      on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        callbacks[event] = callback;
      }),
    };
  });

  it("exposes static hook metadata", () => {
    expect(getRegisteredItemUseHooks()).toEqual(["useItem", "itemUse", "itemUsageComplete"]);
    expect(getModuleHookDebugContext()).toEqual({ moduleId: MODULE_ID });
  });

  it("registers callbacks for all item-use hooks and chat fallback", () => {
    registerWildshapeHooks(() => null);
    expect(Object.keys(callbacks)).toEqual([
      ...getRegisteredItemUseHooks(),
      "createChatMessage",
    ]);
  });

  it("registers adapter-provided item-use hooks when present", () => {
    registerWildshapeHooks(() =>
      createAdapter({
        itemUseHooks: ["custom.itemUse", "custom.itemUse.after"],
      })
    );
    expect(Object.keys(callbacks)).toEqual([
      "custom.itemUse",
      "custom.itemUse.after",
      "createChatMessage",
    ]);
  });

  it("falls back to default item-use hooks when adapter hook list is empty/invalid", () => {
    registerWildshapeHooks(() =>
      createAdapter({
        itemUseHooks: ["", "   ", "custom", "custom"] as unknown as readonly string[],
      })
    );
    expect(Object.keys(callbacks)).toEqual(["custom", "createChatMessage"]);

    callbacks = {};
    (globalThis as Record<string, unknown>).Hooks = {
      on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        callbacks[event] = callback;
      }),
    };

    registerWildshapeHooks(() =>
      createAdapter({
        itemUseHooks: ["", "   "] as unknown as readonly string[],
      })
    );

    expect(Object.keys(callbacks)).toEqual([
      ...getRegisteredItemUseHooks(),
      "createChatMessage",
    ]);
  });

  it("ignores item-use events that do not contain an item-like payload", async () => {
    registerWildshapeHooks(() => createAdapter());
    callbacks.useItem("not-item");
    callbacks.useItem({ item: { bad: true } });
    callbacks.useItem({ name: "Actor Payload", items: [] });
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).not.toHaveBeenCalled();
  });

  it("extracts direct item payloads and nested payload.item", async () => {
    const adapter = createAdapter();
    registerWildshapeHooks(() => adapter);
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
      adapter
    );
    expect(handleWildshapeItemUseMock).toHaveBeenNthCalledWith(
      2,
      { name: "Wildshape 2", actor: { id: "a2" } },
      adapter
    );
    expect(handleWildshapeItemUseMock).toHaveBeenNthCalledWith(
      3,
      { name: "Wildshape 3", actor: { id: "a1" } },
      adapter
    );
  });

  it("uses adapter hook-arg extractor before generic fallback", async () => {
    const adapter = createAdapter({
      extractFromHookArgs: vi.fn((_hookName, args) => {
        const payload = args[0] as { mappedItem?: Item };
        return payload.mappedItem ?? null;
      }),
    });
    registerWildshapeHooks(() => adapter);
    callbacks.useItem({ mappedItem: { name: "Wildshape", actor: { id: "a1" } } });
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).toHaveBeenCalledWith(
      { name: "Wildshape", actor: { id: "a1" } },
      adapter
    );
  });

  it("logs adapter hook-arg extractor errors and skips trigger handling", async () => {
    registerWildshapeHooks(() =>
      createAdapter({
        extractFromHookArgs: () => {
          throw new Error("bad hook args");
        },
      })
    );
    callbacks.useItem({ name: "Wildshape", actor: { id: "a1" } });
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).not.toHaveBeenCalled();
    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.failed", {
      hookName: "useItem",
      error: "bad hook args",
    });
    expect(debugAlertMock).toHaveBeenCalledWith("hook error in useItem: bad hook args");
  });

  it("uses adapter chat parser when chat fallback is enabled", async () => {
    const parserMock = vi
      .fn()
      .mockReturnValueOnce({ name: "Wildshape", actor: { id: "a1" } })
      .mockReturnValueOnce({ name: "Beast Shape", actor: { id: "a1" } });
    const adapter = createAdapter({ parser: parserMock });
    registerWildshapeHooks(() => adapter);

    callbacks.createChatMessage({ kind: "first" });
    callbacks.createChatMessage({ kind: "second" });
    await Promise.resolve();

    expect(parserMock).toHaveBeenNthCalledWith(1, { kind: "first" });
    expect(parserMock).toHaveBeenNthCalledWith(2, { kind: "second" });
    expect(handleWildshapeItemUseMock).toHaveBeenNthCalledWith(
      1,
      { name: "Wildshape", actor: { id: "a1" } },
      adapter
    );
    expect(handleWildshapeItemUseMock).toHaveBeenNthCalledWith(
      2,
      { name: "Beast Shape", actor: { id: "a1" } },
      adapter
    );
  });

  it("ignores chat fallback when no adapter is active", async () => {
    registerWildshapeHooks(() => null);
    callbacks.createChatMessage({ kind: "message" });
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).not.toHaveBeenCalled();
    expect(debugAlertMock).toHaveBeenCalledWith("chat fallback ignored (no active adapter)");
  });

  it("ignores chat fallback when adapter does not provide parser", async () => {
    registerWildshapeHooks(() => createAdapter({ parser: undefined }));
    callbacks.createChatMessage({ kind: "message" });
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).not.toHaveBeenCalled();
    expect(debugAlertMock).toHaveBeenCalledWith(
      "chat fallback ignored (adapter cannot parse chat: test-adapter)"
    );
  });

  it("ignores chat fallback when parser returns null", async () => {
    registerWildshapeHooks(() => createAdapter({ parser: () => null }));
    callbacks.createChatMessage({ kind: "message" });
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).not.toHaveBeenCalled();
    expect(debugAlertMock).toHaveBeenCalledWith("chat fallback ignored (no item extracted)");
  });

  it("ignores chat fallback when global config disables it", async () => {
    const parserMock = vi.fn().mockReturnValue({ name: "Wildshape", actor: { id: "a1" } });
    getGlobalConfigMock.mockReturnValue({
      version: 1,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false, useChatFallback: false },
    });
    registerWildshapeHooks(() => createAdapter({ parser: parserMock }));
    callbacks.createChatMessage({ kind: "message" });
    await Promise.resolve();

    expect(parserMock).not.toHaveBeenCalled();
    expect(handleWildshapeItemUseMock).not.toHaveBeenCalled();
  });

  it("defaults chat fallback to enabled when config omits useChatFallback", async () => {
    const parserMock = vi.fn().mockReturnValue({ name: "Wildshape", actor: { id: "a1" } });
    getGlobalConfigMock.mockReturnValue({
      version: 1,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    registerWildshapeHooks(() => createAdapter({ parser: parserMock }));
    callbacks.createChatMessage({ kind: "message" });
    await Promise.resolve();

    expect(parserMock).toHaveBeenCalledWith({ kind: "message" });
    expect(handleWildshapeItemUseMock).toHaveBeenCalledWith(
      { name: "Wildshape", actor: { id: "a1" } },
      expect.anything()
    );
  });

  it("defaults chat fallback to enabled when global config read throws", async () => {
    const parserMock = vi.fn().mockReturnValue({ name: "Wildshape", actor: { id: "a1" } });
    getGlobalConfigMock.mockImplementation(() => {
      throw new Error("settings unavailable");
    });
    registerWildshapeHooks(() => createAdapter({ parser: parserMock }));
    callbacks.createChatMessage({ kind: "message" });
    await Promise.resolve();

    expect(parserMock).toHaveBeenCalledWith({ kind: "message" });
    expect(handleWildshapeItemUseMock).toHaveBeenCalled();
  });

  it("skips chat fallback when adapter direct item-use listener is active", async () => {
    const parserMock = vi.fn().mockReturnValue({ name: "Wildshape", actor: { id: "a1" } });
    registerWildshapeHooks(() =>
      createAdapter({
        parser: parserMock,
        registerDirect: () => true,
      })
    );

    callbacks.createChatMessage({ kind: "message" });
    await Promise.resolve();

    expect(parserMock).not.toHaveBeenCalled();
    expect(handleWildshapeItemUseMock).not.toHaveBeenCalled();
  });

  it("routes direct adapter item-use listener into trigger handler", async () => {
    let directListener: ((item: Item) => void) | null = null;
    const adapter = createAdapter({
      registerDirect: (onItemUse) => {
        directListener = onItemUse;
        return true;
      },
    });

    registerWildshapeHooks(() => adapter);
    directListener?.({ name: "Wildshape", actor: { id: "a1" } } as Item);
    await Promise.resolve();
    await Promise.resolve();

    expect(handleWildshapeItemUseMock).toHaveBeenCalledWith(
      { name: "Wildshape", actor: { id: "a1" } },
      adapter
    );
  });

  it("logs direct-listener trigger errors without breaking activation flow", async () => {
    let directListener: ((item: Item) => void) | null = null;
    handleWildshapeItemUseMock.mockRejectedValueOnce(new Error("direct boom"));
    registerWildshapeHooks(() =>
      createAdapter({
        registerDirect: (onItemUse) => {
          directListener = onItemUse;
          return true;
        },
      })
    );

    directListener?.({ name: "Wildshape", actor: { id: "a1" } } as Item);
    await Promise.resolve();
    await Promise.resolve();

    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.failed", {
      hookName: "adapter.directItemUse",
      error: "direct boom",
    });
    expect(debugAlertMock).toHaveBeenCalledWith(
      "hook error in adapter.directItemUse: direct boom"
    );
  });

  it("logs direct-listener trigger errors for non-Error values", async () => {
    let directListener: ((item: Item) => void) | null = null;
    handleWildshapeItemUseMock.mockRejectedValueOnce("direct plain failure");
    registerWildshapeHooks(() =>
      createAdapter({
        registerDirect: (onItemUse) => {
          directListener = onItemUse;
          return true;
        },
      })
    );

    directListener?.({ name: "Wildshape", actor: { id: "a1" } } as Item);
    await Promise.resolve();
    await Promise.resolve();

    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.failed", {
      hookName: "adapter.directItemUse",
      error: "direct plain failure",
    });
    expect(debugAlertMock).toHaveBeenCalledWith(
      "hook error in adapter.directItemUse: direct plain failure"
    );
  });

  it("logs structured errors if trigger handling throws from item-use hook", async () => {
    handleWildshapeItemUseMock.mockRejectedValueOnce(new Error("boom"));
    registerWildshapeHooks(() => createAdapter());

    callbacks["useItem"]({ name: "Wildshape" });
    await Promise.resolve();
    await Promise.resolve();

    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.failed", {
      hookName: "useItem",
      error: "boom",
    });
    expect(debugAlertMock).toHaveBeenCalledWith("hook error in useItem: boom");
  });

  it("logs non-Error item-use failures from trigger handling", async () => {
    handleWildshapeItemUseMock.mockRejectedValueOnce("useItem plain failure");
    registerWildshapeHooks(() => createAdapter());

    callbacks["useItem"]({ name: "Wildshape" });
    await Promise.resolve();
    await Promise.resolve();

    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.failed", {
      hookName: "useItem",
      error: "useItem plain failure",
    });
    expect(debugAlertMock).toHaveBeenCalledWith("hook error in useItem: useItem plain failure");
  });

  it("logs parser errors for chat fallback hook failures", async () => {
    registerWildshapeHooks(() =>
      createAdapter({
        parser: () => {
          throw new Error("chat parse boom");
        },
      })
    );

    callbacks.createChatMessage({ kind: "message" });
    await Promise.resolve();

    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.failed", {
      hookName: "createChatMessage",
      error: "chat parse boom",
    });
    expect(debugAlertMock).toHaveBeenCalledWith("hook error in createChatMessage: chat parse boom");
  });

  it("logs parser errors for non-Error thrown values", async () => {
    registerWildshapeHooks(() =>
      createAdapter({
        parser: () => {
          throw "chat parse plain failure";
        },
      })
    );

    callbacks.createChatMessage({ kind: "message" });
    await Promise.resolve();

    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.failed", {
      hookName: "createChatMessage",
      error: "chat parse plain failure",
    });
    expect(debugAlertMock).toHaveBeenCalledWith(
      "hook error in createChatMessage: chat parse plain failure"
    );
  });

  it("logs chat fallback errors when trigger handling rejects", async () => {
    handleWildshapeItemUseMock.mockRejectedValueOnce("plain failure");
    registerWildshapeHooks(() =>
      createAdapter({
        parser: () => ({ name: "Wildshape", actor: { id: "a1" } } as Item),
      })
    );

    callbacks.createChatMessage({ kind: "message" });
    await Promise.resolve();
    await Promise.resolve();

    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.failed", {
      hookName: "createChatMessage",
      error: "plain failure",
    });
    expect(debugAlertMock).toHaveBeenCalledWith("hook error in createChatMessage: plain failure");
  });
});
