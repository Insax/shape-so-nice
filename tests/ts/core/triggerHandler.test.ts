import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleWildshapeItemUse } from "@/ts/core/triggerHandler";

const { openWildshapeChooserMock } = vi.hoisted(() => ({
  openWildshapeChooserMock: vi.fn(),
}));

const { logErrorMock, logInfoMock, logWarningMock } = vi.hoisted(() => ({
  logErrorMock: vi.fn(),
  logInfoMock: vi.fn(),
  logWarningMock: vi.fn(),
}));
const { debugAlertMock } = vi.hoisted(() => ({
  debugAlertMock: vi.fn(),
}));

vi.mock("@/ts/core/chooser", () => ({
  openWildshapeChooser: openWildshapeChooserMock,
}));
vi.mock("@/ts/core/logger", () => ({
  debugAlert: debugAlertMock,
  logError: logErrorMock,
  logInfo: logInfoMock,
  logWarning: logWarningMock,
}));

describe("triggerHandler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    openWildshapeChooserMock.mockResolvedValue(false);
    debugAlertMock.mockReset();
    logErrorMock.mockReset();
  });

  it("returns false when adapter is missing", async () => {
    expect(await handleWildshapeItemUse({} as Item, null)).toBe(false);
  });

  it("returns false for non-trigger items", async () => {
    const adapter = {
      isWildshapeTrigger: vi.fn().mockReturnValue(false),
    };

    expect(
      await handleWildshapeItemUse(
        {
          name: "Attack",
        } as Item,
        adapter as unknown as never
      )
    ).toBe(false);
    expect(openWildshapeChooserMock).not.toHaveBeenCalled();
  });

  it("warns and returns false when trigger item has no actor", async () => {
    const adapter = {
      isWildshapeTrigger: vi.fn().mockReturnValue(true),
    };

    expect(
      await handleWildshapeItemUse(
        {
          name: null,
          actor: null,
        } as unknown as Item,
        adapter as unknown as never
      )
    ).toBe(false);
    expect(logWarningMock).toHaveBeenCalledWith("wildshape.trigger.actorMissing", {
      itemName: "",
    });
  });

  it("logs and opens chooser for trigger items", async () => {
    const adapter = {
      isWildshapeTrigger: vi.fn().mockReturnValue(true),
      ensureWildshapeAction: vi.fn(),
    };
    const actor = { id: "actor-1" };
    openWildshapeChooserMock.mockResolvedValue(true);

    const result = await handleWildshapeItemUse(
      { name: null, actor } as unknown as Item,
      adapter as unknown as never,
      { id: "user-1" } as User
    );

    expect(result).toBe(true);
    expect(logInfoMock).toHaveBeenCalledWith("wildshape.trigger.detected", {
      actorId: "actor-1",
      itemName: "",
    });
    expect(openWildshapeChooserMock).toHaveBeenCalledWith({
      actor,
      item: { name: null, actor },
      adapter,
      targetUser: { id: "user-1" },
    });
  });

  it("returns false when chooser does not open", async () => {
    const adapter = {
      isWildshapeTrigger: vi.fn().mockReturnValue(true),
    };
    const actor = { id: "actor-1" };
    openWildshapeChooserMock.mockResolvedValue(false);

    const result = await handleWildshapeItemUse(
      { name: "Wildshape", actor } as unknown as Item,
      adapter as unknown as never
    );

    expect(result).toBe(false);
    expect(debugAlertMock).toHaveBeenCalledWith("chooser did not open for Wildshape");
  });

  it("handles trigger matcher failures and surfaces debug/log errors", async () => {
    const adapter = {
      isWildshapeTrigger: vi.fn().mockImplementation(() => {
        throw new Error("matcher exploded");
      }),
    };

    const result = await handleWildshapeItemUse(
      { name: "Wildshape", actor: { id: "actor-1" } } as unknown as Item,
      adapter as unknown as never
    );

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.matcherFailed", {
      itemName: "Wildshape",
      error: "matcher exploded",
    });
    expect(debugAlertMock).toHaveBeenCalledWith("trigger matcher failed: matcher exploded");
  });

  it("handles non-Error matcher failures", async () => {
    const adapter = {
      isWildshapeTrigger: vi.fn().mockImplementation(() => {
        throw "matcher plain failure";
      }),
    };

    const result = await handleWildshapeItemUse(
      { name: "Wildshape", actor: { id: "actor-1" } } as unknown as Item,
      adapter as unknown as never
    );

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.matcherFailed", {
      itemName: "Wildshape",
      error: "matcher plain failure",
    });
    expect(debugAlertMock).toHaveBeenCalledWith(
      "trigger matcher failed: matcher plain failure"
    );
  });

  it("handles matcher failures with missing item name", async () => {
    const adapter = {
      isWildshapeTrigger: vi.fn().mockImplementation(() => {
        throw new Error("matcher exploded");
      }),
    };

    const result = await handleWildshapeItemUse(
      { name: null, actor: { id: "actor-1" } } as unknown as Item,
      adapter as unknown as never
    );

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.matcherFailed", {
      itemName: "",
      error: "matcher exploded",
    });
  });

  it("handles chooser exceptions and surfaces debug/log errors", async () => {
    const adapter = {
      isWildshapeTrigger: vi.fn().mockReturnValue(true),
    };
    openWildshapeChooserMock.mockRejectedValueOnce(new Error("chooser exploded"));

    const result = await handleWildshapeItemUse(
      { name: "Wildshape", actor: { id: "actor-1" } } as unknown as Item,
      adapter as unknown as never
    );

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.chooserFailed", {
      actorId: "actor-1",
      itemName: "Wildshape",
      error: "chooser exploded",
    });
    expect(debugAlertMock).toHaveBeenCalledWith("chooser failed: chooser exploded");
  });

  it("handles non-Error chooser failures", async () => {
    const adapter = {
      isWildshapeTrigger: vi.fn().mockReturnValue(true),
    };
    openWildshapeChooserMock.mockRejectedValueOnce("chooser plain failure");

    const result = await handleWildshapeItemUse(
      { name: "Wildshape", actor: { id: "actor-1" } } as unknown as Item,
      adapter as unknown as never
    );

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.chooserFailed", {
      actorId: "actor-1",
      itemName: "Wildshape",
      error: "chooser plain failure",
    });
    expect(debugAlertMock).toHaveBeenCalledWith("chooser failed: chooser plain failure");
  });

  it("handles chooser failures with missing actor id and item name", async () => {
    const adapter = {
      isWildshapeTrigger: vi.fn().mockReturnValue(true),
    };
    openWildshapeChooserMock.mockRejectedValueOnce(new Error("chooser exploded"));

    const result = await handleWildshapeItemUse(
      { name: null, actor: { id: null } } as unknown as Item,
      adapter as unknown as never
    );

    expect(result).toBe(false);
    expect(logErrorMock).toHaveBeenCalledWith("wildshape.trigger.chooserFailed", {
      actorId: null,
      itemName: "",
      error: "chooser exploded",
    });
  });
});
