import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODULE_ID } from "@/ts/constants";

const createAdapterRegistryMock = vi.fn();
const registerGlobalConfigMenuMock = vi.fn();
const registerPlayerOverrideMenuMock = vi.fn();
const registerGlobalSettingsMock = vi.fn();
const registerWildshapeHooksMock = vi.fn();
const handleWildshapeItemUseMock = vi.fn();
const logInfoMock = vi.fn();
const logWarningMock = vi.fn();

vi.mock("@/styles/style.scss", () => ({}));
vi.mock("@/ts/adapters/registry", () => ({
  createAdapterRegistry: createAdapterRegistryMock,
}));
vi.mock("@/ts/config/settings", () => ({
  registerGlobalSettings: registerGlobalSettingsMock,
}));
vi.mock("@/ts/config/globalConfigMenu", () => ({
  registerGlobalConfigMenu: registerGlobalConfigMenuMock,
}));
vi.mock("@/ts/config/playerOverrideMenu", () => ({
  registerPlayerOverrideMenu: registerPlayerOverrideMenuMock,
}));
vi.mock("@/ts/core/hooks", () => ({
  registerWildshapeHooks: registerWildshapeHooksMock,
}));
vi.mock("@/ts/core/triggerHandler", () => ({
  handleWildshapeItemUse: handleWildshapeItemUseMock,
}));
vi.mock("@/ts/core/logger", () => ({
  logInfo: logInfoMock,
  logWarning: logWarningMock,
}));

type HookCallbackMap = Record<string, () => void>;

describe("module bootstrap", () => {
  let callbacks: HookCallbackMap;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    handleWildshapeItemUseMock.mockResolvedValue(false);
    callbacks = {};

    (globalThis as Record<string, unknown>).Hooks = {
      once: vi.fn((event: string, callback: () => void) => {
        callbacks[event] = callback;
      }),
    };
  });

  it("registers settings and exposes API on init, then selects active adapter on ready", async () => {
    const moduleData: Record<string, unknown> = {};
    const activeAdapter = { id: "nimble" };
    createAdapterRegistryMock.mockReturnValue({
      getActiveAdapter: vi.fn(() => activeAdapter),
    });
    (globalThis as Record<string, unknown>).game = {
      system: { id: "nimble" },
      modules: new Map([[MODULE_ID, moduleData]]),
    };

    await import("@/ts/module");

    expect(callbacks.init).toBeTypeOf("function");
    expect(callbacks.ready).toBeTypeOf("function");

    callbacks.init();
    expect(registerGlobalSettingsMock).toHaveBeenCalledTimes(1);
    expect(registerGlobalConfigMenuMock).toHaveBeenCalledTimes(1);
    expect(registerPlayerOverrideMenuMock).toHaveBeenCalledTimes(1);
    expect((moduleData.api as { getActiveAdapter: () => unknown }).getActiveAdapter()).toBeNull();
    expect(logInfoMock).toHaveBeenCalledWith("wildshape.init.completed", {
      moduleId: MODULE_ID,
    });

    callbacks.ready();
    expect(logInfoMock).toHaveBeenCalledWith("wildshape.adapter.selected", {
      adapterId: "nimble",
      systemId: "nimble",
    });
    expect(registerWildshapeHooksMock).toHaveBeenCalledTimes(1);
    const adapterGetter = registerWildshapeHooksMock.mock.calls[0][0] as () => unknown;
    expect(adapterGetter()).toBe(activeAdapter);
    expect((moduleData.api as { getActiveAdapter: () => unknown }).getActiveAdapter()).toBe(
      activeAdapter
    );

    const api = moduleData.api as {
      handleItemUse: (item: Item, targetUser?: User) => Promise<boolean>;
    };
    const result = await api.handleItemUse({ name: "Wildshape" } as Item, {
      id: "user-1",
    } as User);
    expect(result).toBe(false);
    expect(handleWildshapeItemUseMock).toHaveBeenCalledWith(
      { name: "Wildshape" },
      activeAdapter,
      { id: "user-1" }
    );
  });

  it("warns and exits init when module cannot be found in game modules", async () => {
    createAdapterRegistryMock.mockReturnValue({
      getActiveAdapter: vi.fn(() => ({ id: "nimble" })),
    });
    (globalThis as Record<string, unknown>).game = {
      system: { id: "nimble" },
      modules: new Map(),
    };

    await import("@/ts/module");
    callbacks.init();

    expect(logWarningMock).toHaveBeenCalledWith("wildshape.module.missing", {
      moduleId: MODULE_ID,
    });
    expect(logInfoMock).not.toHaveBeenCalledWith("wildshape.init.completed", expect.anything());
  });

  it("warns on ready when no adapter matches active system", async () => {
    const moduleData: Record<string, unknown> = {};
    createAdapterRegistryMock.mockReturnValue({
      getActiveAdapter: vi.fn(() => null),
    });
    (globalThis as Record<string, unknown>).game = {
      system: { id: "unknown-system" },
      modules: new Map([[MODULE_ID, moduleData]]),
    };

    await import("@/ts/module");
    callbacks.init();
    callbacks.ready();

    expect(logWarningMock).toHaveBeenCalledWith("wildshape.adapter.notFound", {
      systemId: "unknown-system",
    });
    expect(registerWildshapeHooksMock).not.toHaveBeenCalled();
  });
});
