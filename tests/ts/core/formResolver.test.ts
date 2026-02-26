import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveFormActors,
  resolveFormsForMapping,
  resolveMappedFormsForItemName,
} from "@/ts/core/formResolver";

const { getEffectiveConfigMock } = vi.hoisted(() => ({
  getEffectiveConfigMock: vi.fn(),
}));
const { logWarningMock } = vi.hoisted(() => ({
  logWarningMock: vi.fn(),
}));

vi.mock("@/ts/config/effectiveConfig", () => ({
  getEffectiveConfig: getEffectiveConfigMock,
}));
vi.mock("@/ts/core/logger", () => ({
  logWarning: logWarningMock,
}));

function actor(id: string | null, name: string, uuid?: string): Actor {
  return {
    id,
    name,
    uuid: uuid ?? (id ? `Actor.${id}` : null),
  } as unknown as Actor;
}

describe("formResolver", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getEffectiveConfigMock.mockReset();
    logWarningMock.mockReset();
    (globalThis as Record<string, unknown>).game = {
      actors: {
        contents: [
          actor("a1", "Wolf Form", "Actor.a1"),
          actor("a2", "Bear Form", "Actor.a2"),
          actor("a3", "Wolf Form", "Actor.a3"),
          actor(null, "No Id"),
        ],
      },
    };
  });

  it("resolves form refs by uuid and name", () => {
    const result = resolveFormActors([
      { mode: "uuid", value: "Actor.a1" },
      { mode: "name", value: "Bear Form" },
    ]);

    expect(result.map((entry) => entry.id)).toEqual(["a1", "a2"]);
  });

  it("supports Actor.<id> and bare actor id values for uuid refs", () => {
    expect(resolveFormActors([{ mode: "uuid", value: "Actor.a2" }])[0]?.id).toBe("a2");
    expect(resolveFormActors([{ mode: "uuid", value: "a2" }])[0]?.id).toBe("a2");
  });

  it("returns empty results when game actor collection is unavailable", () => {
    (globalThis as Record<string, unknown>).game = {
      actors: {},
    };

    expect(resolveFormActors([{ mode: "uuid", value: "Actor.a1" }])).toEqual([]);
    expect(logWarningMock).toHaveBeenCalledWith("wildshape.formResolver.missingFormRef", {
      formRef: { mode: "uuid", value: "Actor.a1" },
    });
  });

  it("warns on missing refs and dedupes duplicate actor matches", () => {
    const result = resolveFormActors([
      { mode: "name", value: "Wolf Form" },
      { mode: "uuid", value: "Actor.a1" },
      { mode: "name", value: "Missing Form" },
    ]);

    expect(result.map((entry) => entry.id)).toEqual(["a1"]);
    expect(logWarningMock).toHaveBeenCalledTimes(1);
    expect(logWarningMock).toHaveBeenCalledWith("wildshape.formResolver.missingFormRef", {
      formRef: { mode: "name", value: "Missing Form" },
    });
  });

  it("ignores resolved actors that have no id", () => {
    expect(resolveFormActors([{ mode: "name", value: "No Id" }])).toEqual([]);
    expect(resolveFormActors([{ mode: "uuid", value: "Actor." }])).toEqual([]);
  });

  it("delegates mapping resolution through resolveFormsForMapping", () => {
    const result = resolveFormsForMapping({
      id: "map_1",
      trigger: { mode: "itemName", value: "Wildshape" },
      formRefs: [{ mode: "name", value: "Bear Form" }],
      filters: { whitelist: [], blacklist: [] },
    });

    expect(result.map((entry) => entry.id)).toEqual(["a2"]);
  });

  it("resolves mapped forms for trigger item names using effective config", () => {
    const targetUser = { id: "player-1" } as User;
    getEffectiveConfigMock.mockReturnValue({
      version: 1,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: " Wildshape " },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          filters: { whitelist: [], blacklist: [] },
        },
      ],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });

    const forms = resolveMappedFormsForItemName("wildshape", targetUser);
    expect(getEffectiveConfigMock).toHaveBeenCalledWith(targetUser);
    expect(forms.map((entry) => entry.id)).toEqual(["a1"]);
    expect(resolveMappedFormsForItemName("not-mapped")).toEqual([]);
  });
});
