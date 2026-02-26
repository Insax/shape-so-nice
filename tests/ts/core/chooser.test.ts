import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWildshapeChoices, openWildshapeChooser } from "@/ts/core/chooser";

const { resolveMappedFormsForItemNameMock, getModuleWildshapeActorStateMock } = vi.hoisted(() => ({
  resolveMappedFormsForItemNameMock: vi.fn(),
  getModuleWildshapeActorStateMock: vi.fn(),
}));
const { applyWildshapeFormMock, revertWildshapeFormMock } = vi.hoisted(() => ({
  applyWildshapeFormMock: vi.fn(),
  revertWildshapeFormMock: vi.fn(),
}));
const { debugAlertMock } = vi.hoisted(() => ({
  debugAlertMock: vi.fn(),
}));

vi.mock("@/ts/core/formResolver", () => ({
  resolveMappedFormsForItemName: resolveMappedFormsForItemNameMock,
}));
vi.mock("@/ts/core/state", () => ({
  getModuleWildshapeActorState: getModuleWildshapeActorStateMock,
}));
vi.mock("@/ts/core/transform", () => ({
  applyWildshapeForm: applyWildshapeFormMock,
  revertWildshapeForm: revertWildshapeFormMock,
}));
vi.mock("@/ts/core/logger", () => ({
  debugAlert: debugAlertMock,
}));

describe("chooser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resolveMappedFormsForItemNameMock.mockReset();
    getModuleWildshapeActorStateMock.mockReset();
    applyWildshapeFormMock.mockReset();
    revertWildshapeFormMock.mockReset();
    debugAlertMock.mockReset();
    applyWildshapeFormMock.mockResolvedValue(true);
    revertWildshapeFormMock.mockResolvedValue(true);

    (globalThis as Record<string, unknown>).ui = {
      notifications: {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
      },
    };
  });

  it("builds form choices for unshaped actors and handles unnamed forms", () => {
    getModuleWildshapeActorStateMock.mockReturnValue(null);
    const actor = {} as Actor;
    const choices = buildWildshapeChoices(actor, [
      { id: "f1", name: "Wolf Form" } as Actor,
      { id: "f2", name: null } as unknown as Actor,
      { id: null, name: "No Id" } as unknown as Actor,
    ]);

    expect(choices).toEqual([
      {
        kind: "form",
        label: "Wolf Form",
        formActor: { id: "f1", name: "Wolf Form" },
      },
      {
        kind: "form",
        label: "Unnamed Form",
        formActor: { id: "f2", name: null },
      },
    ]);
  });

  it("includes Original Form and excludes current form for shaped actors", () => {
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f2",
      currentFormName: "Bear Form",
      snapshot: null,
    });

    const choices = buildWildshapeChoices({} as Actor, [
      { id: "f1", name: "Wolf Form" } as Actor,
      { id: "f2", name: "Bear Form" } as Actor,
    ]);

    expect(choices).toEqual([
      { kind: "original", label: "Original Form" },
      {
        kind: "form",
        label: "Wolf Form",
        formActor: { id: "f1", name: "Wolf Form" },
      },
    ]);
  });

  it("warns and returns false when no choices are available", async () => {
    resolveMappedFormsForItemNameMock.mockReturnValue([]);
    getModuleWildshapeActorStateMock.mockReturnValue(null);

    const result = await openWildshapeChooser({
      actor: {} as Actor,
      item: { name: null } as unknown as Item,
      adapter: { ensureWildshapeAction: vi.fn() } as unknown as never,
    });

    const uiMock = (globalThis as Record<string, unknown>).ui as {
      notifications: { warn: ReturnType<typeof vi.fn> };
    };
    expect(result).toBe(false);
    expect(uiMock.notifications.warn).toHaveBeenCalledTimes(1);
    expect(resolveMappedFormsForItemNameMock).toHaveBeenCalledWith("", undefined);
  });

  it("opens dialog and handles original + form selections", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue({
      version: 1,
      isShaped: true,
      baseActorId: "a1",
      currentFormActorId: "f2",
      currentFormName: "Bear Form",
      snapshot: null,
    });
    resolveMappedFormsForItemNameMock.mockReturnValue([
      { id: "f1", name: "Wolf Form" },
      { id: "f2", name: "Bear Form" },
    ]);

    let capturedButtons: Record<string, { callback?: () => void }> = {};
    (globalThis as Record<string, unknown>).Dialog = class {
      public constructor(data: { buttons: Record<string, { callback?: () => void }> }) {
        capturedButtons = data.buttons;
      }
      public render(force: boolean): void {
        expect(force).toBe(true);
      }
    };

    const ensureWildshapeAction = vi.fn().mockResolvedValue(undefined);
    const result = await openWildshapeChooser({
      actor: { id: "actor-1" } as Actor,
      item: { name: "Wildshape" } as Item,
      adapter: { ensureWildshapeAction } as unknown as never,
      targetUser: { id: "user-1" } as User,
    });

    expect(result).toBe(true);
    expect(resolveMappedFormsForItemNameMock).toHaveBeenCalledWith("Wildshape", {
      id: "user-1",
    });
    expect(Object.keys(capturedButtons)).toEqual(["choice_0", "choice_1"]);
    capturedButtons["choice_0"].callback?.();
    capturedButtons["choice_1"].callback?.();

    const uiMock = (globalThis as Record<string, unknown>).ui as {
      notifications: { info: ReturnType<typeof vi.fn> };
    };
    expect(uiMock.notifications.info).toHaveBeenCalledTimes(0);
    expect(ensureWildshapeAction).toHaveBeenCalledTimes(0);
    expect(revertWildshapeFormMock).toHaveBeenCalledWith({
      actor: { id: "actor-1" },
      adapter: { ensureWildshapeAction },
    });
    expect(applyWildshapeFormMock).toHaveBeenCalledWith({
      actor: { id: "actor-1" },
      formActor: { id: "f1", name: "Wolf Form" },
      adapter: { ensureWildshapeAction },
      itemName: "Wildshape",
      targetUser: { id: "user-1" },
    });
  });

  it("shows error and returns false when Dialog API is unavailable", async () => {
    getModuleWildshapeActorStateMock.mockReturnValue(null);
    resolveMappedFormsForItemNameMock.mockReturnValue([{ id: "f1", name: "Wolf Form" }]);
    (globalThis as Record<string, unknown>).Dialog = undefined;

    const result = await openWildshapeChooser({
      actor: { id: "actor-1" } as Actor,
      item: { name: "Wildshape" } as Item,
      adapter: { ensureWildshapeAction: vi.fn() } as unknown as never,
    });

    const uiMock = (globalThis as Record<string, unknown>).ui as {
      notifications: { error: ReturnType<typeof vi.fn> };
    };
    expect(result).toBe(false);
    expect(uiMock.notifications.error).toHaveBeenCalledWith(
      "Wildshape chooser could not open because Dialog is unavailable."
    );
  });
});
