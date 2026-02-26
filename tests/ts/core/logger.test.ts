import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODULE_ID, SETTINGS_KEYS } from "@/ts/constants";
import {
  debugAlert,
  logDebug,
  logError,
  logInfo,
  logWarning,
} from "@/ts/core/logger";

describe("logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as Record<string, unknown>).game = {
      settings: {
        settings: new Map<string, unknown>(),
        get: vi.fn(),
      },
    };
    (globalThis as Record<string, unknown>).ui = {
      notifications: {
        info: vi.fn(),
      },
    };
  });

  it("writes info, warning, and error logs with module-prefixed event names", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logInfo("wildshape.init.completed", { moduleId: MODULE_ID });
    logWarning("wildshape.adapter.notFound");
    logError("wildshape.transform.failed", { actorId: "a1" });

    expect(logSpy).toHaveBeenCalledWith(`[${MODULE_ID}] wildshape.init.completed`, {
      moduleId: MODULE_ID,
    });
    expect(warnSpy).toHaveBeenCalledWith(`[${MODULE_ID}] wildshape.adapter.notFound`);
    expect(errorSpy).toHaveBeenCalledWith(`[${MODULE_ID}] wildshape.transform.failed`, {
      actorId: "a1",
    });
  });

  it("suppresses debug logs when setting is unavailable", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logDebug("wildshape.debug.event", { a: 1 });
    debugAlert("wildshape.debug.alert");

    expect(logSpy).not.toHaveBeenCalled();
    const uiMock = (globalThis as Record<string, unknown>).ui as {
      notifications: { info: ReturnType<typeof vi.fn> };
    };
    expect(uiMock.notifications.info).not.toHaveBeenCalled();
  });

  it("suppresses debug logs when config is invalid", () => {
    const gameMock = (globalThis as Record<string, unknown>).game as {
      settings: { settings: Map<string, unknown>; get: ReturnType<typeof vi.fn> };
    };
    gameMock.settings.settings.set(`${MODULE_ID}.${SETTINGS_KEYS.GLOBAL_CONFIG}`, true);
    gameMock.settings.get.mockReturnValue({ ui: { showDebugLogs: "yes" } });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logDebug("wildshape.debug.event", { a: 1 });
    debugAlert("wildshape.debug.alert");

    expect(logSpy).not.toHaveBeenCalled();
    const uiMock = (globalThis as Record<string, unknown>).ui as {
      notifications: { info: ReturnType<typeof vi.fn> };
    };
    expect(uiMock.notifications.info).not.toHaveBeenCalled();
  });

  it("emits debug logs when debug flag is enabled in valid config", () => {
    const gameMock = (globalThis as Record<string, unknown>).game as {
      settings: { settings: Map<string, unknown>; get: ReturnType<typeof vi.fn> };
    };
    gameMock.settings.settings.set(`${MODULE_ID}.${SETTINGS_KEYS.GLOBAL_CONFIG}`, true);
    gameMock.settings.get.mockReturnValue({
      version: 1,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: true },
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logDebug("wildshape.debug.event", { a: 1 });
    debugAlert("wildshape.debug.alert");

    expect(logSpy).toHaveBeenCalledWith(`[${MODULE_ID}] wildshape.debug.event`, { a: 1 });
    const uiMock = (globalThis as Record<string, unknown>).ui as {
      notifications: { info: ReturnType<typeof vi.fn> };
    };
    expect(uiMock.notifications.info).toHaveBeenCalledWith(
      `[${MODULE_ID}] wildshape.debug.alert`
    );
  });

  it("skips debug alert if notifications API is unavailable", () => {
    const gameMock = (globalThis as Record<string, unknown>).game as {
      settings: { settings: Map<string, unknown>; get: ReturnType<typeof vi.fn> };
    };
    gameMock.settings.settings.set(`${MODULE_ID}.${SETTINGS_KEYS.GLOBAL_CONFIG}`, true);
    gameMock.settings.get.mockReturnValue({
      version: 1,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: true },
    });
    (globalThis as Record<string, unknown>).ui = {};

    expect(() => debugAlert("wildshape.debug.alert")).not.toThrow();
  });
});
