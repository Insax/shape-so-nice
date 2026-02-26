import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODULE_ID, SCHEMA_VERSION, SETTINGS_KEYS } from "@/ts/constants";
import type { GlobalConfig } from "@/ts/config/types";
import {
  buildGlobalConfigFromEditorData,
  GlobalConfigMenu,
  registerGlobalConfigMenu,
} from "@/ts/config/globalConfigMenu";

const { getGlobalConfigMock, setGlobalConfigMock } = vi.hoisted(() => ({
  getGlobalConfigMock: vi.fn(),
  setGlobalConfigMock: vi.fn(),
}));

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).FormApplication = class {
    public static defaultOptions = {} as FormApplicationOptions;
    public form: HTMLFormElement | null = null;
    public getData(): Record<string, unknown> {
      return {};
    }
    public render(): void {}
    public activateListeners(_html: JQuery): void {}
  };
});

vi.mock("@/ts/config/settings", () => ({
  getGlobalConfig: getGlobalConfigMock,
  setGlobalConfig: setGlobalConfigMock,
}));

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultGlobalConfig(): GlobalConfig {
  return {
    version: SCHEMA_VERSION,
    mappings: [],
    permissions: { playerOverrideEditors: [] },
    ui: { showDebugLogs: false },
  };
}

function expandObject(flat: Record<string, unknown>): Record<string, unknown> {
  const expanded: Record<string, unknown> = {};

  Object.entries(flat).forEach(([key, value]) => {
    const parts = key.split(".");
    let cursor: Record<string, unknown> = expanded;

    for (let index = 0; index < parts.length - 1; index += 1) {
      const segment = parts[index];
      const current = cursor[segment];
      if (!current || typeof current !== "object") {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }

    cursor[parts[parts.length - 1]] = value;
  });

  return expanded;
}

class FakeFormData {
  private readonly entriesList: Array<[string, unknown]>;

  public constructor(form: unknown) {
    const raw = form as { __entries?: Array<[string, unknown]> };
    this.entriesList = raw.__entries ?? [];
  }

  public forEach(callback: (value: unknown, key: string) => void): void {
    this.entriesList.forEach(([key, value]) => callback(value, key));
  }
}

describe("global config menu", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete (globalThis as { fromUuid?: unknown }).fromUuid;

    getGlobalConfigMock.mockReset();
    setGlobalConfigMock.mockReset();
    getGlobalConfigMock.mockReturnValue(defaultGlobalConfig());
    setGlobalConfigMock.mockResolvedValue(undefined);

    (globalThis as Record<string, unknown>).FormData = FakeFormData;
    (globalThis as Record<string, unknown>).foundry = {
      utils: {
        expandObject,
      },
    };
    (globalThis as Record<string, unknown>).ui = {
      notifications: {
        info: vi.fn(),
      },
    };
    (globalThis as Record<string, unknown>).game = {
      i18n: {
        localize: vi.fn(() => "Localized Title"),
      },
      actors: {
        contents: [
          {
            id: "wolf-id",
            uuid: "Actor.wolf-id",
            name: "Wolf Form",
            items: {
              contents: [{ id: "bite-id", name: "Bite Attack" }],
            },
          },
          { id: "bear-id", uuid: "Actor.bear-id", name: "Bear Form", items: { contents: [] } },
        ],
      },
      settings: {
        registerMenu: vi.fn(),
      },
    };
  });

  it("builds normalized config from editor-style data", () => {
    const output = buildGlobalConfigFromEditorData(
      {
        mappings: {
          0: {
            id: " map_1 ",
            trigger: { value: " Wildshape " },
            formRefs: {
              0: { mode: "name", value: " Wolf Form " },
              1: { mode: "uuid", value: " abc123 " },
              2: { mode: "name", value: "   " },
            },
            defaultFilters: {
              whitelist: [" Bite ", "Claw"],
              blacklist: " Dash,\n  ",
            },
            formAbilityUuids: {
              0: { value: " Actor.wolf-id.Item.bite-id " },
              1: { value: "Actor.wolf-id.Item.bite-id" },
            },
          },
        },
        permissions: {
          playerOverrideEditors: " user-a, user-b ",
        },
        ui: {
          showDebugLogs: "on",
        },
      },
      defaultGlobalConfig()
    );

    expect(output).toEqual({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [
            { mode: "name", value: "Wolf Form" },
            { mode: "uuid", value: "abc123" },
          ],
          defaultFilters: {
            whitelist: ["Bite", "Claw"],
            blacklist: ["Dash"],
          },
          formAbilityUuids: ["Actor.wolf-id.Item.bite-id"],
        },
      ],
      permissions: { playerOverrideEditors: ["user-a", "user-b"] },
      ui: { showDebugLogs: true },
    });
  });

  it("falls back for invalid editor inputs and removes incomplete mappings", () => {
    const fallback = {
      ...defaultGlobalConfig(),
      ui: { showDebugLogs: true },
    };
    const output = buildGlobalConfigFromEditorData(
      {
        mappings: {
          0: {
            id: "map_1",
            trigger: { value: "Wildshape" },
            formRefs: [],
            defaultFilters: {
              whitelist: null,
              blacklist: null,
            },
          },
        },
        permissions: {
          playerOverrideEditors: 42,
        },
        ui: {
          showDebugLogs: "false",
        },
      },
      fallback
    );

    expect(output).toEqual({
      version: SCHEMA_VERSION,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
  });

  it("handles malformed mapping and form-ref entries safely", () => {
    const output = buildGlobalConfigFromEditorData(
      {
        mappings: ["bad-entry", { id: 42, trigger: "bad", formRefs: ["bad"], defaultFilters: "bad" }],
        permissions: { playerOverrideEditors: [] },
        ui: { showDebugLogs: false },
      },
      defaultGlobalConfig()
    );

    expect(output.mappings).toEqual([]);
  });

  it("handles non-record editor payloads by using fallback defaults", () => {
    const fallback = defaultGlobalConfig();
    const output = buildGlobalConfigFromEditorData(null, fallback);
    expect(output).toEqual({
      version: SCHEMA_VERSION,
      mappings: [],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
  });

  it("exposes localized default options and fallback title", () => {
    expect(GlobalConfigMenu.defaultOptions.title).toBe("Localized Title");

    (globalThis as Record<string, unknown>).game = {
      settings: { registerMenu: vi.fn() },
    };
    expect(GlobalConfigMenu.defaultOptions.title).toBe("Wildshape Global Config");
  });

  it("builds menu data from current draft config", () => {
    getGlobalConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [
            { mode: "uuid", value: "wolf-id" },
            { mode: "name", value: "Bear Form" },
            { mode: "name", value: "" },
            { mode: "uuid", value: "missing" },
          ],
          defaultFilters: { whitelist: ["Bite"], blacklist: ["Dash"] },
          formAbilityUuids: ["Actor.wolf-id.Item.bite-id"],
        },
      ],
      permissions: { playerOverrideEditors: ["u1", "u2"] },
      ui: { showDebugLogs: true },
    });

    const menu = new GlobalConfigMenu();
    const data = menu.getData() as unknown as {
      permissionsEditorIds: string;
      permissionsEditorEntries: Array<{ value: string }>;
      showDebugLogs: boolean;
      mappings: Array<{
        title: string;
        collapsed: boolean;
        whitelistEntries: Array<{ value: string }>;
        blacklistEntries: Array<{ value: string }>;
        formAbilityEntries: Array<{ value: string; matchFound: boolean; abilityName: string | null }>;
        formRefs: Array<{ value: string; matchFound: boolean }>;
      }>;
    };

    expect(data.permissionsEditorIds).toBe("u1, u2");
    expect(data.permissionsEditorEntries.map((entry) => entry.value)).toEqual(["u1", "u2"]);
    expect(data.showDebugLogs).toBe(true);
    expect(data.mappings[0].title).toBe("Wildshape");
    expect(data.mappings[0].collapsed).toBe(false);
    expect(data.mappings[0].whitelistEntries.map((entry) => entry.value)).toEqual(["Bite"]);
    expect(data.mappings[0].blacklistEntries.map((entry) => entry.value)).toEqual(["Dash"]);
    expect(data.mappings[0].formAbilityEntries.map((entry) => entry.value)).toEqual([
      "Actor.wolf-id.Item.bite-id",
    ]);
    expect(data.mappings[0].formAbilityEntries[0]).toMatchObject({
      matchFound: true,
      abilityName: "Bite Attack",
    });
    expect(data.mappings[0].formRefs[0].value).toBe("wolf-id");
    expect(data.mappings[0].formRefs.map((entry) => entry.matchFound)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("handles absent actor collection when building menu data", () => {
    getGlobalConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: { whitelist: [], blacklist: [] },
        },
      ],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    (globalThis as Record<string, unknown>).game = {
      i18n: { localize: vi.fn(() => "Localized Title") },
      settings: { registerMenu: vi.fn() },
    };

    const menu = new GlobalConfigMenu();
    const data = menu.getData() as unknown as {
      mappings: Array<{ formRefs: Array<{ matchFound: boolean }> }>;
    };
    expect(data.mappings[0].formRefs[0].matchFound).toBe(false);
  });

  it("resolves ability confirmations from actor toObject fallback item arrays", () => {
    getGlobalConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: { whitelist: [], blacklist: [] },
          formAbilityUuids: ["Actor.wolf-id.Item.bite-id"],
        },
      ],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    (globalThis as Record<string, unknown>).game = {
      i18n: { localize: vi.fn(() => "Localized Title") },
      settings: { registerMenu: vi.fn() },
      actors: {
        contents: [
          {
            id: "wolf-id",
            uuid: "Actor.wolf-id",
            name: "Wolf Form",
            toObject: () => ({
              items: [{ _id: "bite-id", name: "Fallback Bite" }],
            }),
          },
        ],
      },
    };

    const menu = new GlobalConfigMenu();
    const data = menu.getData() as unknown as {
      mappings: Array<{
        formAbilityEntries: Array<{ matchFound: boolean; abilityName: string | null }>;
      }>;
    };

    expect(data.mappings[0].formAbilityEntries[0]).toMatchObject({
      matchFound: true,
      abilityName: "Fallback Bite",
    });
  });

  it("covers ability preview actor matching variants and title fallback", () => {
    getGlobalConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "  " },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: { whitelist: [], blacklist: [] },
          formAbilityUuids: ["Actor.wolf-id.Item.bite-id"],
        },
        {
          id: "map_2",
          trigger: { mode: "itemName", value: "Wildshape Two" },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: { whitelist: [], blacklist: [] },
          formAbilityUuids: ["Actor.wolf-uuid.Item.bite-id"],
        },
        {
          id: "map_3",
          trigger: { mode: "itemName", value: "Wildshape Three" },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: { whitelist: [], blacklist: [] },
          formAbilityUuids: ["Actor.wolf-actor.Item.bite-id"],
        },
        {
          id: "map_4",
          trigger: { mode: "itemName", value: "Wildshape Four" },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: { whitelist: [], blacklist: [] },
          formAbilityUuids: ["Actor.wolf-id-idprefix.Item.bite-id"],
        },
        {
          id: "map_5",
          trigger: { mode: "itemName", value: "Wildshape Five" },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: { whitelist: [], blacklist: [] },
          formAbilityUuids: ["Actor.badname.Item.n1"],
        },
        {
          id: "map_6",
          trigger: { mode: "itemName", value: "Wildshape Six" },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: { whitelist: [], blacklist: [] },
          formAbilityUuids: ["Actor.nonrecord.Item.n1"],
        },
        {
          id: "map_7",
          trigger: { mode: "itemName", value: "Wildshape Seven" },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: { whitelist: [], blacklist: [] },
          formAbilityUuids: ["Actor.notfound.Item.n1"],
        },
        {
          id: "map_8",
          trigger: { mode: "itemName", value: "Wildshape Eight" },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: { whitelist: [], blacklist: [] },
          formAbilityUuids: ["Actor.emptyactor.Item.n1"],
        },
        {
          id: "map_9",
          trigger: { mode: "itemName", value: "Wildshape Nine" },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: { whitelist: [], blacklist: [] },
          formAbilityUuids: ["Actor.emptytoobject.Item.n1"],
        },
      ],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    (globalThis as Record<string, unknown>).game = {
      i18n: { localize: vi.fn(() => "Localized Title") },
      settings: { registerMenu: vi.fn() },
      actors: {
        contents: [
          {
            id: "wolf-id",
            uuid: "u1",
            name: "Wolf Form",
            items: { contents: [{ id: "bite-id", name: "By Id Match" }] },
          },
          {
            id: "x2",
            uuid: "wolf-uuid",
            name: "Wolf UUID",
            items: { contents: [{ id: "bite-id", name: "By UUID Match" }] },
          },
          {
            id: "x3",
            uuid: "Actor.wolf-actor",
            name: "Wolf Actor UUID",
            items: { contents: [{ id: "bite-id", name: "By Actor Prefix UUID Match" }] },
          },
          {
            id: "Actor.wolf-id-idprefix",
            name: "Wolf Actor Id Prefix",
            items: { contents: [{ id: "bite-id", name: "By Actor Id Prefix Match" }] },
          },
          {
            id: "badname",
            name: "Bad Name Wolf",
            items: { contents: [{ id: "n1", name: 7 }] },
          },
          {
            id: "nonrecord",
            name: "Non Record Wolf",
            items: { contents: [null] },
          },
          {
            id: "emptyactor",
            name: "Empty Actor Wolf",
          },
          {
            id: "emptytoobject",
            name: "Empty ToObject Wolf",
            toObject: () => ({}),
          },
        ],
      },
    };

    const menu = new GlobalConfigMenu();
    const data = menu.getData() as unknown as {
      mappings: Array<{
        title: string;
        formAbilityEntries: Array<{ matchFound: boolean; abilityName: string | null }>;
      }>;
    };

    expect(data.mappings[0].title).toBe("Unnamed Ability");
    expect(data.mappings[0].formAbilityEntries[0]).toMatchObject({
      matchFound: true,
      abilityName: "By Id Match",
    });
    expect(data.mappings[1].formAbilityEntries[0]).toMatchObject({
      matchFound: true,
      abilityName: "By UUID Match",
    });
    expect(data.mappings[2].formAbilityEntries[0]).toMatchObject({
      matchFound: true,
      abilityName: "By Actor Prefix UUID Match",
    });
    expect(data.mappings[3].formAbilityEntries[0]).toMatchObject({
      matchFound: true,
      abilityName: "By Actor Id Prefix Match",
    });
    expect(data.mappings[4].formAbilityEntries[0]).toMatchObject({
      matchFound: false,
      abilityName: null,
    });
    expect(data.mappings[5].formAbilityEntries[0]).toMatchObject({
      matchFound: false,
      abilityName: null,
    });
    expect(data.mappings[6].formAbilityEntries[0]).toMatchObject({
      matchFound: false,
      abilityName: null,
    });
    expect(data.mappings[7].formAbilityEntries[0]).toMatchObject({
      matchFound: false,
      abilityName: null,
    });
    expect(data.mappings[8].formAbilityEntries[0]).toMatchObject({
      matchFound: false,
      abilityName: null,
    });
  });

  it("syncs draft state from form values and checkbox state", () => {
    const menu = new GlobalConfigMenu() as any;
    menu.form = {
      __entries: [
        ["permissions.playerOverrideEditors.0.value", "u1"],
        ["permissions.playerOverrideEditors.1.value", "u2"],
        ["mappings.0.id", "map_1"],
        ["mappings.0.trigger.value", "Wildshape"],
        ["mappings.0.formRefs.0.mode", "name"],
        ["mappings.0.formRefs.0.value", "Wolf Form"],
        ["mappings.0.defaultFilters.whitelist.0.value", "Bite"],
        ["mappings.0.defaultFilters.whitelist.1.value", "Claw"],
        ["mappings.0.defaultFilters.blacklist.0.value", "Dash"],
        ["mappings.0.formAbilityUuids.0.value", "Actor.wolf-id.Item.bite-id"],
      ],
      querySelectorAll: () => [{ name: "ui.showDebugLogs", checked: true }],
    } as unknown as HTMLFormElement;

    menu.syncDraftFromForm();
    expect(menu.draftConfig).toEqual({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [{ mode: "name", value: "Wolf Form" }],
          defaultFilters: {
            whitelist: ["Bite", "Claw"],
            blacklist: ["Dash"],
          },
          formAbilityUuids: ["Actor.wolf-id.Item.bite-id"],
        },
      ],
      permissions: { playerOverrideEditors: ["u1", "u2"] },
      ui: { showDebugLogs: true },
    });
  });

  it("keeps draft unchanged when no form is mounted", () => {
    const menu = new GlobalConfigMenu() as any;
    const before = clone(menu.draftConfig);
    menu.form = null;
    menu.syncDraftFromForm();
    expect(menu.draftConfig).toEqual(before);
  });

  it("handles mapping actions and live confirmations from listeners", async () => {
    const menu = new GlobalConfigMenu() as any;
    menu.draftConfig = defaultGlobalConfig();
    menu.syncDraftFromForm = vi.fn();
    menu.render = vi.fn();

    let clickHandler: ((event: { preventDefault: () => void; currentTarget: unknown }) => void) | null = null;
    const delegatedHandlers = new Map<string, (event: { currentTarget: unknown }) => void>();
    const html = {
      find: vi.fn(() => ({
        on: vi.fn((_event: string, handler: typeof clickHandler) => {
          clickHandler = handler;
        }),
      })),
      on: vi.fn((event: string, selector: string, handler: (event: { currentTarget: unknown }) => void) => {
        delegatedHandlers.set(`${event}|${selector}`, handler);
      }),
    };

    menu.activateListeners(html as unknown as JQuery);
    expect(clickHandler).toBeTypeOf("function");

    const handleClick = clickHandler as unknown as (event: {
      preventDefault: () => void;
      currentTarget: unknown;
    }) => void;

    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "add-mapping" } },
    });
    expect(menu.draftConfig.mappings).toHaveLength(1);
    expect(menu.draftConfig.mappings[0].id).toBe("map_1");

    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "toggle-mapping", mappingId: "map_1" } },
    });
    expect(menu.collapsedMappingIds.has("map_1")).toBe(true);
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "toggle-mapping", mappingId: "map_1" } },
    });
    expect(menu.collapsedMappingIds.has("map_1")).toBe(false);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: { action: "add-form-ref", mappingIndex: "0" },
      },
    });
    expect(menu.draftConfig.mappings[0].formRefs).toHaveLength(1);
    expect(menu.render).toHaveBeenCalledWith(true);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: { action: "add-whitelist-entry", mappingIndex: "0" },
      },
    });
    expect(menu.draftConfig.mappings[0].defaultFilters.whitelist).toHaveLength(6);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: {
          action: "remove-whitelist-entry",
          mappingIndex: "0",
          formRefIndex: "0",
        },
      },
    });
    expect(menu.draftConfig.mappings[0].defaultFilters.whitelist).toHaveLength(5);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: { action: "add-blacklist-entry", mappingIndex: "0" },
      },
    });
    expect(menu.draftConfig.mappings[0].defaultFilters.blacklist).toHaveLength(2);
    delete menu.draftConfig.mappings[0].formAbilityUuids;

    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: { action: "add-form-ability-entry", mappingIndex: "0" },
      },
    });
    expect(menu.draftConfig.mappings[0].formAbilityUuids).toHaveLength(1);
    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: { action: "add-form-ability-entry", mappingIndex: "0" },
      },
    });
    expect(menu.draftConfig.mappings[0].formAbilityUuids).toHaveLength(2);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: {
          action: "remove-form-ability-entry",
          mappingIndex: "0",
          formRefIndex: "0",
        },
      },
    });
    expect(menu.draftConfig.mappings[0].formAbilityUuids).toHaveLength(1);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: {
          action: "remove-blacklist-entry",
          mappingIndex: "0",
          formRefIndex: "0",
        },
      },
    });
    expect(menu.draftConfig.mappings[0].defaultFilters.blacklist).toHaveLength(1);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: {
          action: "remove-form-ref",
          mappingIndex: "0",
          formRefIndex: "0",
        },
      },
    });
    expect(menu.draftConfig.mappings[0].formRefs).toHaveLength(0);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "remove-mapping", mappingIndex: "x" } },
    });
    expect(menu.draftConfig.mappings).toHaveLength(1);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "remove-mapping", mappingIndex: "0" } },
    });
    expect(menu.draftConfig.mappings).toHaveLength(0);
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "remove-mapping", mappingIndex: "0" } },
    });

    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "add-permission-editor" } },
    });
    expect(menu.draftConfig.permissions.playerOverrideEditors).toHaveLength(1);
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "remove-permission-editor", formRefIndex: "0" } },
    });
    expect(menu.draftConfig.permissions.playerOverrideEditors).toHaveLength(0);
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "remove-permission-editor", formRefIndex: "x" } },
    });

    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "unknown" } },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: {} },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "add-form-ref", mappingIndex: "99" } },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "add-whitelist-entry", mappingIndex: "99" } },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "add-blacklist-entry", mappingIndex: "99" } },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "add-form-ability-entry", mappingIndex: "99" } },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: {
          action: "remove-whitelist-entry",
          mappingIndex: "99",
          formRefIndex: "0",
        },
      },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: {
          action: "remove-form-ability-entry",
          mappingIndex: "99",
          formRefIndex: "0",
        },
      },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: {
          action: "remove-blacklist-entry",
          mappingIndex: "99",
          formRefIndex: "0",
        },
      },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: {
          action: "remove-form-ref",
          mappingIndex: "99",
          formRefIndex: "0",
        },
      },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: null,
    });

    expect(menu.syncDraftFromForm).toHaveBeenCalledTimes(28);
    expect(menu.render).toHaveBeenCalledTimes(28);

    const titleNode = { textContent: "" };
    const titleHandler = delegatedHandlers.get("keydown input|input[name$='.trigger.value']");
    expect(titleHandler).toBeTypeOf("function");
    titleHandler?.({ currentTarget: null });
    titleHandler?.({
      currentTarget: {
        value: "  Storm Form  ",
        closest: () => ({
          querySelector: () => titleNode,
        }),
      },
    });
    expect(titleNode.textContent).toBe("Storm Form");

    const statusIcon = { classList: { toggle: vi.fn() } };
    const formRefStatus = {
      classList: { toggle: vi.fn() },
      querySelector: () => statusIcon,
      title: "",
    };
    const formRefInput = {
      value: "Wolf Form",
      closest: () => ({
        querySelector: (selector: string) => {
          if (selector.includes("select")) {
            return { value: "name" };
          }
          if (selector === ".ws-entry-status") {
            return formRefStatus;
          }
          return null;
        },
      }),
    };
    const formRefHandler = delegatedHandlers.get("keydown input|input[name*='.formRefs.'][name$='.value']");
    expect(formRefHandler).toBeTypeOf("function");
    formRefHandler?.({ currentTarget: null });
    formRefHandler?.({ currentTarget: formRefInput });
    expect((formRefStatus.classList.toggle as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      ["is-match", true],
      ["is-missing", false],
    ]);

    const modeChangeHandler = delegatedHandlers.get("change|select[name*='.formRefs.'][name$='.mode']");
    expect(modeChangeHandler).toBeTypeOf("function");
    modeChangeHandler?.({ currentTarget: null });
    modeChangeHandler?.({
      currentTarget: {
        value: "name",
        closest: () => null,
      },
    });
    modeChangeHandler?.({
      currentTarget: {
        value: "name",
        closest: () => ({
          querySelector: () => null,
        }),
      },
    });
    modeChangeHandler?.({
      currentTarget: {
        value: "name",
        closest: () => ({
          querySelector: () => formRefInput,
        }),
      },
    });

    const abilityIcon = { classList: { toggle: vi.fn() } };
    const abilityStatus = {
      classList: { toggle: vi.fn() },
      querySelector: () => abilityIcon,
      title: "",
    };
    const abilityLabel = { textContent: "" };
    const abilityRow = {
      dataset: {} as Record<string, string>,
      querySelector: (selector: string) => {
        if (selector === ".ws-entry-status") {
          return abilityStatus;
        }
        if (selector === "[data-role='ability-name']") {
          return abilityLabel;
        }
        return null;
      },
    };
    const abilityInput = {
      value: "Actor.wolf-id.Item.bite-id",
      closest: () => abilityRow,
    };
    const abilityHandler = delegatedHandlers.get(
      "keydown input|input[name*='.formAbilityUuids.'][name$='.value']"
    );
    expect(abilityHandler).toBeTypeOf("function");
    abilityHandler?.({ currentTarget: null });
    abilityHandler?.({ currentTarget: abilityInput });
    await Promise.resolve();
    expect(abilityLabel.textContent).toBe("Bite Attack");
  });

  it("refreshes persisted form ability UUID confirmations when listeners activate", () => {
    const menu = new GlobalConfigMenu() as any;
    menu.refreshFormAbilityConfirmation = vi.fn().mockResolvedValue(undefined);

    const abilityInputA = { value: "Actor.wolf-id.Item.bite-id" } as HTMLInputElement;
    const html = {
      find: vi.fn((selector: string) => {
        if (selector === "button[data-action]") {
          return {
            on: vi.fn(),
          };
        }
        if (selector === "input[name*='.formAbilityUuids.'][name$='.value']") {
          return {
            each: vi.fn((callback: (index: number, element: unknown) => void) => {
              callback(0, abilityInputA);
              callback(1, null);
            }),
          };
        }
        return {};
      }),
      on: vi.fn(),
    };

    menu.activateListeners(html as unknown as JQuery);
    expect(menu.refreshFormAbilityConfirmation).toHaveBeenCalledTimes(1);
    expect(menu.refreshFormAbilityConfirmation).toHaveBeenCalledWith(abilityInputA);
  });

  it("keeps incomplete mapping in draft when adding form rows", () => {
    const menu = new GlobalConfigMenu() as any;
    menu.draftConfig = {
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          trigger: { mode: "itemName", value: "Wildshape" },
          formRefs: [],
          defaultFilters: { whitelist: [], blacklist: [] },
        },
      ],
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    };
    menu.form = {
      __entries: [
        ["mappings.0.id", "map_1"],
        ["mappings.0.trigger.value", "Wildshape"],
      ],
      querySelectorAll: () => [],
    } as unknown as HTMLFormElement;
    menu.render = vi.fn();

    let clickHandler: ((event: { preventDefault: () => void; currentTarget: unknown }) => void) | null = null;
    const html = {
      find: vi.fn(() => ({
        on: vi.fn((_event: string, handler: typeof clickHandler) => {
          clickHandler = handler;
        }),
      })),
      on: vi.fn(),
    };

    menu.activateListeners(html as unknown as JQuery);
    const handleClick = clickHandler as unknown as (event: {
      preventDefault: () => void;
      currentTarget: unknown;
    }) => void;

    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "add-form-ref", mappingIndex: "0" } },
    });

    expect(menu.draftConfig.mappings).toHaveLength(1);
    expect(menu.draftConfig.mappings[0].formRefs).toHaveLength(1);
    expect(menu.render).toHaveBeenCalledWith(true);
  });

  it("submits parsed config and shows a success notification", async () => {
    const menu = new GlobalConfigMenu() as any;

    await menu._updateObject({} as Event, {
      mappings: [],
      permissions: {
        playerOverrideEditors: "u1",
      },
      ui: {
        showDebugLogs: 1,
      },
    });

    const uiMock = (globalThis as Record<string, unknown>).ui as {
      notifications: { info: ReturnType<typeof vi.fn> };
    };
    expect(setGlobalConfigMock).toHaveBeenCalledWith({
      version: SCHEMA_VERSION,
      mappings: [],
      permissions: { playerOverrideEditors: ["u1"] },
      ui: { showDebugLogs: true },
    });
    expect(uiMock.notifications.info).toHaveBeenCalledWith("Wildshape global config saved.");
  });

  it("handles form ability live confirmation edge cases", async () => {
    const menu = new GlobalConfigMenu() as any;

    await menu.refreshFormAbilityConfirmation({
      value: "Actor.wolf-id.Item.bite-id",
      closest: () => null,
    });

    menu.refreshMappingTitle({
      value: "  ",
      closest: () => null,
    });
    menu.refreshMappingTitle({
      value: "  ",
      closest: () => ({ querySelector: () => null }),
    });
    const emptyTitle = { textContent: "placeholder" };
    menu.refreshMappingTitle({
      value: "  ",
      closest: () => ({ querySelector: () => emptyTitle }),
    });
    expect(emptyTitle.textContent).toBe("Unnamed Ability");

    menu.refreshFormRefConfirmation({
      value: "Ghost",
      closest: () => null,
    });
    menu.refreshFormRefConfirmation({
      value: "Ghost",
      closest: () => ({
        querySelector: () => null,
      }),
    });
    const missingFormStatus = {
      classList: { toggle: vi.fn() },
      querySelector: () => ({ classList: { toggle: vi.fn() } }),
      title: "",
    };
    menu.refreshFormRefConfirmation({
      value: "Ghost",
      closest: () => ({
        querySelector: (selector: string) => {
          if (selector.includes("select")) {
            return { value: "name" };
          }
          if (selector === ".ws-entry-status") {
            return missingFormStatus;
          }
          return null;
        },
      }),
    });
    expect((missingFormStatus.classList.toggle as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      ["is-match", false],
      ["is-missing", true],
    ]);

    await menu.refreshFormAbilityConfirmation({
      value: "Actor.wolf-id.Item.bite-id",
      closest: () => ({
        querySelector: () => null,
      }),
    });

    const statusWithoutIcon = {
      classList: { toggle: vi.fn() },
      querySelector: () => null,
      title: "",
    };
    menu.applyMatchBadge(statusWithoutIcon, true, "ok");

    let resolveFromUuid: ((value: unknown) => void) | null = null;
    (globalThis as Record<string, unknown>).fromUuid = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFromUuid = resolve;
        })
    );
    const staleRow = {
      dataset: {} as Record<string, string>,
      querySelector: (selector: string) => {
        if (selector === ".ws-entry-status") {
          return {
            classList: { toggle: vi.fn() },
            querySelector: () => ({ classList: { toggle: vi.fn() } }),
            title: "",
          };
        }
        if (selector === "[data-role='ability-name']") {
          return { textContent: "" };
        }
        return null;
      },
    };
    const stalePromise = menu.refreshFormAbilityConfirmation({
      value: "Compendium.module.item",
      closest: () => staleRow,
    });
    staleRow.dataset.validationToken = "stale";
    resolveFromUuid?.({ documentName: "Item", name: "Delayed Name" });
    await stalePromise;

    delete (globalThis as { fromUuid?: unknown }).fromUuid;
    const noFromUuidLabel = { textContent: "" };
    await menu.refreshFormAbilityConfirmation({
      value: "Compendium.module.item",
      closest: () => ({
        dataset: {} as Record<string, string>,
        querySelector: (selector: string) => {
          if (selector === ".ws-entry-status") {
            return {
              classList: { toggle: vi.fn() },
              querySelector: () => ({ classList: { toggle: vi.fn() } }),
              title: "",
            };
          }
          if (selector === "[data-role='ability-name']") {
            return noFromUuidLabel;
          }
          return null;
        },
      }),
    });
    expect(noFromUuidLabel.textContent).toBe("Unknown ability");

    const emptyValueLabel = { textContent: "" };
    await menu.refreshFormAbilityConfirmation({
      value: "   ",
      closest: () => ({
        dataset: {} as Record<string, string>,
        querySelector: (selector: string) => {
          if (selector === ".ws-entry-status") {
            return {
              classList: { toggle: vi.fn() },
              querySelector: () => ({ classList: { toggle: vi.fn() } }),
              title: "",
            };
          }
          if (selector === "[data-role='ability-name']") {
            return emptyValueLabel;
          }
          return null;
        },
      }),
    });
    expect(emptyValueLabel.textContent).toBe("Unknown ability");

    (globalThis as Record<string, unknown>).fromUuid = vi.fn(async () => null);
    const nonRecordLabel = { textContent: "" };
    await menu.refreshFormAbilityConfirmation({
      value: "Compendium.module.item",
      closest: () => ({
        dataset: {} as Record<string, string>,
        querySelector: (selector: string) => {
          if (selector === ".ws-entry-status") {
            return {
              classList: { toggle: vi.fn() },
              querySelector: () => ({ classList: { toggle: vi.fn() } }),
              title: "",
            };
          }
          if (selector === "[data-role='ability-name']") {
            return nonRecordLabel;
          }
          return null;
        },
      }),
    });
    expect(nonRecordLabel.textContent).toBe("Unknown ability");

    (globalThis as Record<string, unknown>).fromUuid = vi.fn(async () => ({
      documentName: "Actor",
      name: "Not An Item",
    }));
    const wrongDocLabel = { textContent: "" };
    await menu.refreshFormAbilityConfirmation({
      value: "Compendium.module.item",
      closest: () => ({
        dataset: {} as Record<string, string>,
        querySelector: (selector: string) => {
          if (selector === ".ws-entry-status") {
            return {
              classList: { toggle: vi.fn() },
              querySelector: () => ({ classList: { toggle: vi.fn() } }),
              title: "",
            };
          }
          if (selector === "[data-role='ability-name']") {
            return wrongDocLabel;
          }
          return null;
        },
      }),
    });
    expect(wrongDocLabel.textContent).toBe("Unknown ability");

    (globalThis as Record<string, unknown>).fromUuid = vi.fn(async () => {
      throw new Error("boom");
    });
    const throwStatus = {
      classList: { toggle: vi.fn() },
      querySelector: () => ({ classList: { toggle: vi.fn() } }),
      title: "",
    };
    const throwLabel = { textContent: "" };
    await menu.refreshFormAbilityConfirmation({
      value: "Compendium.module.item",
      closest: () => ({
        dataset: {} as Record<string, string>,
        querySelector: (selector: string) => {
          if (selector === ".ws-entry-status") {
            return throwStatus;
          }
          if (selector === "[data-role='ability-name']") {
            return throwLabel;
          }
          return null;
        },
      }),
    });
    expect(throwLabel.textContent).toBe("Unknown ability");
  });

  it("registers the GM menu entry in settings", () => {
    registerGlobalConfigMenu();

    const gameMock = (globalThis as Record<string, unknown>).game as {
      settings: { registerMenu: ReturnType<typeof vi.fn> };
    };
    expect(gameMock.settings.registerMenu).toHaveBeenCalledWith(
      MODULE_ID,
      SETTINGS_KEYS.GLOBAL_CONFIG_MENU,
      expect.objectContaining({
        restricted: true,
        type: GlobalConfigMenu,
      })
    );
  });
});
