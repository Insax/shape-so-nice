import { describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION } from "@/ts/constants";
import {
  getModuleWildshapeActorState,
  getWildshapeActorState,
  isWildshapeActorState,
} from "@/ts/core/state";

describe("state helpers", () => {
  it("validates actor state payload shape", () => {
    expect(
      isWildshapeActorState({
        version: SCHEMA_VERSION,
        isShaped: true,
        baseActorId: "a1",
        currentFormActorId: "f1",
        currentFormName: "Wolf Form",
        snapshot: {},
      })
    ).toBe(true);
    expect(
      isWildshapeActorState({
        version: SCHEMA_VERSION,
        isShaped: false,
        baseActorId: "a1",
        currentFormActorId: "",
        currentFormName: "",
        snapshot: null,
      })
    ).toBe(true);
    expect(
      isWildshapeActorState({
        version: SCHEMA_VERSION + 1,
        isShaped: true,
        baseActorId: "a1",
        currentFormActorId: "f1",
        currentFormName: "Wolf Form",
        snapshot: {},
      })
    ).toBe(false);
    expect(isWildshapeActorState(null)).toBe(false);
  });

  it("returns null when actor has no state flag", () => {
    const actor = {
      getFlag: vi.fn().mockReturnValue(undefined),
    } as unknown as Actor;

    expect(getWildshapeActorState(actor)).toBeNull();
  });

  it("warns and returns null on invalid state payload", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const actor = {
      id: "actor-1",
      getFlag: vi.fn().mockReturnValue({ invalid: true }),
    } as unknown as Actor;

    expect(getWildshapeActorState(actor)).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns valid state payload from actor flag", () => {
    const payload = {
      version: SCHEMA_VERSION,
      isShaped: true,
      baseActorId: "actor-1",
      currentFormActorId: "form-1",
      currentFormName: "Wolf Form",
      snapshot: { hp: { value: 10 } },
    };
    const actor = {
      getFlag: vi.fn().mockReturnValue(payload),
    } as unknown as Actor;

    expect(getWildshapeActorState(actor)).toEqual(payload);
  });

  it("returns valid state payload from module scope helper", () => {
    const payload = {
      version: SCHEMA_VERSION,
      isShaped: true,
      baseActorId: "actor-1",
      currentFormActorId: "form-1",
      currentFormName: "Wolf Form",
      snapshot: { hp: { value: 10 } },
    };
    const actor = {
      getFlag: vi.fn().mockReturnValue(payload),
      flags: {
        wildshape: {
          state: {
            version: SCHEMA_VERSION,
            isShaped: true,
            baseActorId: "legacy",
            currentFormActorId: "legacy-form",
            currentFormName: "Legacy",
            snapshot: {},
          },
        },
      },
    } as unknown as Actor;

    expect(getModuleWildshapeActorState(actor)).toEqual(payload);
  });

  it("does not fall back to legacy state in module scope helper", () => {
    const actor = {
      getFlag: vi.fn().mockReturnValue(undefined),
      flags: {
        wildshape: {
          state: {
            version: SCHEMA_VERSION,
            isShaped: true,
            baseActorId: "legacy",
            currentFormActorId: "legacy-form",
            currentFormName: "Legacy",
            snapshot: {},
          },
        },
      },
    } as unknown as Actor;

    expect(getModuleWildshapeActorState(actor)).toBeNull();
  });

  it("falls back to legacy raw state flag when module scope flag is missing", () => {
    const payload = {
      version: SCHEMA_VERSION,
      isShaped: true,
      baseActorId: "actor-legacy",
      currentFormActorId: "form-legacy",
      currentFormName: "Legacy Wolf",
      snapshot: {},
    };
    const actor = {
      getFlag: vi.fn().mockReturnValue(undefined),
      flags: {
        wildshape: {
          state: payload,
        },
      },
    } as unknown as Actor;

    expect(getWildshapeActorState(actor)).toEqual(payload);
  });

  it("ignores malformed legacy state scope", () => {
    const actor = {
      getFlag: vi.fn().mockReturnValue(undefined),
      flags: {
        wildshape: "bad-legacy-scope",
      },
    } as unknown as Actor;

    expect(getWildshapeActorState(actor)).toBeNull();
  });

  it("returns null when legacy scope exists but state key is missing", () => {
    const actor = {
      getFlag: vi.fn().mockReturnValue(undefined),
      flags: {
        wildshape: {},
      },
    } as unknown as Actor;

    expect(getWildshapeActorState(actor)).toBeNull();
  });
});
