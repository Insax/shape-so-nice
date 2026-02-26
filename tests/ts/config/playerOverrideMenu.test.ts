import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODULE_ID, SCHEMA_VERSION, SETTINGS_KEYS } from "@/ts/constants";
import type { WildshapeMapping } from "@/ts/config/types";
import {
  buildOverrideRows,
  buildPlayerOverrideFromRows,
  buildRowsFromEditorData,
  PlayerOverrideMenu,
  registerPlayerOverrideMenu,
} from "@/ts/config/playerOverrideMenu";

const {
  getGlobalConfigMock,
  canCurrentUserEditPlayerOverrideMock,
  getPlayerOverrideConfigMock,
  setPlayerOverrideConfigMock,
} = vi.hoisted(() => ({
  getGlobalConfigMock: vi.fn(),
  canCurrentUserEditPlayerOverrideMock: vi.fn(),
  getPlayerOverrideConfigMock: vi.fn(),
  setPlayerOverrideConfigMock: vi.fn(),
}));

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).FormApplication = class {
    public static defaultOptions = {} as FormApplicationOptions;
    public form: HTMLFormElement | null = null;
    public constructor(_object?: object, _options?: Partial<FormApplicationOptions>) {}
    public getData(): Record<string, unknown> {
      return {};
    }
    public render(): void {}
    public activateListeners(_html: JQuery): void {}
  };
});

vi.mock("@/ts/config/settings", () => ({
  getGlobalConfig: getGlobalConfigMock,
}));

vi.mock("@/ts/config/playerOverride", () => ({
  canCurrentUserEditPlayerOverride: canCurrentUserEditPlayerOverrideMock,
  getPlayerOverrideConfig: getPlayerOverrideConfigMock,
  setPlayerOverrideConfig: setPlayerOverrideConfigMock,
}));

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

function globalMappings(): WildshapeMapping[] {
  return [
    {
      id: "map_1",
      trigger: { mode: "itemName", value: "Wildshape" },
      formRefs: [{ mode: "name", value: "Wolf Form" }],
      defaultFilters: { whitelist: [], blacklist: [] },
    },
    {
      id: "map_2",
      trigger: { mode: "itemName", value: "Beastshape" },
      formRefs: [{ mode: "name", value: "Bear Form" }],
      defaultFilters: { whitelist: [], blacklist: [] },
    },
  ];
}

describe("player override menu", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    getGlobalConfigMock.mockReset();
    canCurrentUserEditPlayerOverrideMock.mockReset();
    getPlayerOverrideConfigMock.mockReset();
    setPlayerOverrideConfigMock.mockReset();

    getGlobalConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: globalMappings(),
      permissions: { playerOverrideEditors: [] },
      ui: { showDebugLogs: false },
    });
    canCurrentUserEditPlayerOverrideMock.mockReturnValue(true);
    getPlayerOverrideConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [],
    });
    setPlayerOverrideConfigMock.mockResolvedValue(undefined);

    (globalThis as Record<string, unknown>).FormData = FakeFormData;
    (globalThis as Record<string, unknown>).foundry = {
      utils: {
        expandObject,
      },
    };
    (globalThis as Record<string, unknown>).ui = {
      notifications: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    };
    (globalThis as Record<string, unknown>).game = {
      user: { id: "player-1" },
      actors: {
        contents: [
          { id: "panther-id", uuid: "Actor.panther-id", name: "Panther Form" },
          { id: "wolf-id", uuid: "Actor.wolf-id", name: "Wolf Form" },
        ],
      },
      i18n: {
        localize: vi.fn(() => "Localized Player Override"),
      },
      settings: {
        registerMenu: vi.fn(),
      },
    };
  });

  it("builds editor rows from global mappings + existing override", () => {
    const rows = buildOverrideRows({
      globalMappings: globalMappings(),
      overrideConfig: {
        version: SCHEMA_VERSION,
        mappings: [
          {
            id: "map_1",
            formRefsAdd: [{ mode: "name", value: "Panther Form" }],
            formRefsRemove: [{ mode: "uuid", value: "form-2" }],
            filtersOverride: { whitelist: ["Bite"], blacklist: ["Dash"] },
          },
        ],
      },
    });

    expect(rows).toEqual([
      {
        id: "map_1",
        triggerValue: "Wildshape",
        formRefsAdd: [{ mode: "name", value: "Panther Form" }],
        formRefsRemove: [{ mode: "uuid", value: "form-2" }],
        filtersOverrideEnabled: true,
        filtersWhitelist: ["Bite"],
        filtersBlacklist: ["Dash"],
      },
      {
        id: "map_2",
        triggerValue: "Beastshape",
        formRefsAdd: [],
        formRefsRemove: [],
        filtersOverrideEnabled: false,
        filtersWhitelist: [],
        filtersBlacklist: [],
      },
    ]);
  });

  it("parses editor data with fallbacks and malformed entries", () => {
    const fallbackRows = [
      {
        id: "map_1",
        triggerValue: "Wildshape",
        formRefsAdd: [],
        formRefsRemove: [],
        filtersOverrideEnabled: false,
        filtersWhitelist: [],
        filtersBlacklist: [],
      },
      {
        id: "map_2",
        triggerValue: "Beastshape",
        formRefsAdd: [],
        formRefsRemove: [],
        filtersOverrideEnabled: true,
        filtersWhitelist: ["default-a"],
        filtersBlacklist: ["default-b"],
      },
    ];
    const rows = buildRowsFromEditorData(
      {
        mappings: {
          0: {
            id: " map_1 ",
            formRefsAdd: [{ mode: "name", value: " Panther Form " }, "bad"],
            formRefsRemove: [{ mode: "uuid", value: " form-2 " }],
            filtersOverride: {
              enabled: "on",
              whitelist: "Bite,Claw",
              blacklist: ["Dash"],
            },
          },
          1: "bad",
        },
      },
      fallbackRows
    );

    expect(rows).toEqual([
      {
        id: " map_1 ",
        triggerValue: "Wildshape",
        formRefsAdd: [{ mode: "name", value: " Panther Form " }],
        formRefsRemove: [{ mode: "uuid", value: " form-2 " }],
        filtersOverrideEnabled: true,
        filtersWhitelist: ["Bite", "Claw"],
        filtersBlacklist: ["Dash"],
      },
      {
        id: "map_2",
        triggerValue: "Beastshape",
        formRefsAdd: [],
        formRefsRemove: [],
        filtersOverrideEnabled: true,
        filtersWhitelist: [],
        filtersBlacklist: [],
      },
    ]);
    expect(buildRowsFromEditorData({}, fallbackRows)).toBe(fallbackRows);
    expect(buildRowsFromEditorData(null, fallbackRows)).toBe(fallbackRows);
  });

  it("parses numeric filter enabled flags", () => {
    const fallbackRows = [
      {
        id: "map_1",
        triggerValue: "Wildshape",
        formRefsAdd: [],
        formRefsRemove: [],
        filtersOverrideEnabled: false,
        filtersWhitelist: [],
        filtersBlacklist: [],
      },
    ];

    const enabledRows = buildRowsFromEditorData(
      {
        mappings: {
          0: {
            id: "map_1",
            filtersOverride: {
              enabled: 1,
            },
          },
        },
      },
      fallbackRows
    );
    expect(enabledRows[0].filtersOverrideEnabled).toBe(true);

    const disabledRows = buildRowsFromEditorData(
      {
        mappings: {
          0: {
            id: "map_1",
            filtersOverride: {
              enabled: 0,
            },
          },
        },
      },
      fallbackRows
    );
    expect(disabledRows[0].filtersOverrideEnabled).toBe(false);
  });

  it("builds normalized override payload and drops empty mapping rows", () => {
    const config = buildPlayerOverrideFromRows([
      {
        id: " map_1 ",
        triggerValue: "Wildshape",
        formRefsAdd: [{ mode: "name", value: " Panther Form " }],
        formRefsRemove: [],
        filtersOverrideEnabled: false,
        filtersWhitelist: [],
        filtersBlacklist: [],
      },
      {
        id: "map_2",
        triggerValue: "Beastshape",
        formRefsAdd: [],
        formRefsRemove: [],
        filtersOverrideEnabled: true,
        filtersWhitelist: [" Bite "],
        filtersBlacklist: [" Dash "],
      },
      {
        id: "map_3",
        triggerValue: "Unused",
        formRefsAdd: [],
        formRefsRemove: [],
        filtersOverrideEnabled: false,
        filtersWhitelist: [],
        filtersBlacklist: [],
      },
    ]);

    expect(config).toEqual({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          formRefsAdd: [{ mode: "name", value: "Panther Form" }],
          formRefsRemove: [],
        },
        {
          id: "map_2",
          formRefsAdd: [],
          formRefsRemove: [],
          filtersOverride: {
            whitelist: ["Bite"],
            blacklist: ["Dash"],
          },
        },
      ],
    });
  });

  it("uses localized and fallback default options", () => {
    expect(PlayerOverrideMenu.defaultOptions.title).toBe("Localized Player Override");

    (globalThis as Record<string, unknown>).game = {
      user: { id: "player-1" },
      settings: { registerMenu: vi.fn() },
    };
    expect(PlayerOverrideMenu.defaultOptions.title).toBe("Wildshape Player Override");
  });

  it("provides menu data for rendering", () => {
    getPlayerOverrideConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          formRefsAdd: [
            { mode: "name", value: "Panther Form" },
            { mode: "name", value: "   " },
          ],
          formRefsRemove: [
            { mode: "uuid", value: "wolf-id" },
            { mode: "uuid", value: "missing-form" },
          ],
          filtersOverride: { whitelist: ["Bite"], blacklist: ["Dash"] },
        },
      ],
    });

    const menu = new PlayerOverrideMenu();
    const data = menu.getData() as unknown as {
      canEdit: boolean;
      hasTargetUser: boolean;
      mappings: Array<{
        id: string;
        filtersOverrideEnabled: boolean;
        whitelistInput: string;
        formRefsAdd: Array<{ value: string; matchFound: boolean }>;
        formRefsRemove: Array<{ value: string; matchFound: boolean }>;
      }>;
    };

    expect(data.canEdit).toBe(true);
    expect(data.hasTargetUser).toBe(true);
    expect(data.mappings[0].id).toBe("map_1");
    expect(data.mappings[0].filtersOverrideEnabled).toBe(true);
    expect(data.mappings[0].whitelistInput).toBe("Bite");
    expect(data.mappings[0].formRefsAdd[0].value).toBe("Panther Form");
    expect(data.mappings[0].formRefsAdd.map((entry) => entry.matchFound)).toEqual([true, false]);
    expect(data.mappings[0].formRefsRemove.map((entry) => entry.matchFound)).toEqual([
      true,
      false,
    ]);
  });

  it("handles missing actor collection when building player override data", () => {
    (globalThis as Record<string, unknown>).game = {
      user: { id: "player-1" },
      i18n: {
        localize: vi.fn(() => "Localized Player Override"),
      },
      settings: {
        registerMenu: vi.fn(),
      },
    };
    getPlayerOverrideConfigMock.mockReturnValue({
      version: SCHEMA_VERSION,
      mappings: [
        {
          id: "map_1",
          formRefsAdd: [{ mode: "name", value: "Panther Form" }],
          formRefsRemove: [],
        },
      ],
    });

    const menu = new PlayerOverrideMenu();
    const data = menu.getData() as unknown as {
      mappings: Array<{ formRefsAdd: Array<{ matchFound: boolean }> }>;
    };
    expect(data.mappings[0].formRefsAdd[0].matchFound).toBe(false);
  });

  it("does not attach action listeners when user cannot edit", () => {
    canCurrentUserEditPlayerOverrideMock.mockReturnValue(false);
    const menu = new PlayerOverrideMenu();
    const onMock = vi.fn();
    const html = {
      find: vi.fn(() => ({
        on: onMock,
      })),
    };
    menu.activateListeners(html as unknown as JQuery);
    expect(onMock).not.toHaveBeenCalled();
  });

  it("handles action buttons for add/remove form refs", () => {
    const menu = new PlayerOverrideMenu() as any;
    menu.render = vi.fn();
    menu.syncRowsFromForm = vi.fn();

    let clickHandler: ((event: { preventDefault: () => void; currentTarget: unknown }) => void) | null =
      null;
    const html = {
      find: vi.fn(() => ({
        on: vi.fn((_event: string, handler: typeof clickHandler) => {
          clickHandler = handler;
        }),
      })),
    };
    menu.activateListeners(html as unknown as JQuery);
    const handleClick = clickHandler as unknown as (event: {
      preventDefault: () => void;
      currentTarget: unknown;
    }) => void;

    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "add-form-add", mappingIndex: "0" } },
    });
    expect(menu.editorRows[0].formRefsAdd).toHaveLength(1);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: { action: "remove-form-add", mappingIndex: "0", formRefIndex: "0" },
      },
    });
    expect(menu.editorRows[0].formRefsAdd).toHaveLength(0);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "add-form-remove", mappingIndex: "0" } },
    });
    expect(menu.editorRows[0].formRefsRemove).toHaveLength(1);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: { action: "remove-form-remove", mappingIndex: "0", formRefIndex: "0" },
      },
    });
    expect(menu.editorRows[0].formRefsRemove).toHaveLength(0);

    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "unknown", mappingIndex: "0" } },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { mappingIndex: "0" } },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "add-form-add", mappingIndex: "99" } },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "remove-form-add", mappingIndex: "0", formRefIndex: "x" } },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: { dataset: { action: "add-form-remove", mappingIndex: "99" } },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: { action: "remove-form-remove", mappingIndex: "0", formRefIndex: "x" },
      },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: {
        dataset: { action: "remove-form-remove", mappingIndex: "99", formRefIndex: "0" },
      },
    });
    handleClick({
      preventDefault: () => undefined,
      currentTarget: null,
    });

    expect(menu.syncRowsFromForm).toHaveBeenCalledTimes(11);
    expect(menu.render).toHaveBeenCalledTimes(11);
  });

  it("syncs rows from form data and no-ops when form is missing", () => {
    const menu = new PlayerOverrideMenu() as any;
    const before = JSON.parse(JSON.stringify(menu.editorRows));
    menu.form = null;
    menu.syncRowsFromForm();
    expect(menu.editorRows).toEqual(before);

    menu.form = {
      __entries: [
        ["mappings.0.id", "map_1"],
        ["mappings.0.formRefsAdd.0.mode", "name"],
        ["mappings.0.formRefsAdd.0.value", "Panther Form"],
        ["mappings.0.filtersOverride.whitelist", "Bite,Claw"],
      ],
      querySelectorAll: () => [{ name: "mappings.0.filtersOverride.enabled", checked: true }],
    } as unknown as HTMLFormElement;

    menu.syncRowsFromForm();
    expect(menu.editorRows[0].formRefsAdd).toEqual([{ mode: "name", value: "Panther Form" }]);
    expect(menu.editorRows[0].filtersOverrideEnabled).toBe(true);
    expect(menu.editorRows[0].filtersWhitelist).toEqual(["Bite", "Claw"]);
  });

  it("gates updates by user context and permissions", async () => {
    const uiMock = (globalThis as Record<string, unknown>).ui as {
      notifications: { warn: ReturnType<typeof vi.fn> };
    };

    (globalThis as Record<string, unknown>).game = {
      user: null,
      settings: { registerMenu: vi.fn() },
      i18n: { localize: vi.fn() },
    };
    const noUserMenu = new PlayerOverrideMenu() as any;
    await noUserMenu._updateObject({} as Event, {});
    expect(setPlayerOverrideConfigMock).not.toHaveBeenCalled();
    expect(uiMock.notifications.warn).toHaveBeenCalledWith(
      "No user context is available for player override settings."
    );

    canCurrentUserEditPlayerOverrideMock.mockReturnValue(false);
    (globalThis as Record<string, unknown>).game = {
      user: { id: "player-1" },
      settings: { registerMenu: vi.fn() },
      i18n: { localize: vi.fn() },
    };
    const blockedMenu = new PlayerOverrideMenu() as any;
    await blockedMenu._updateObject({} as Event, {});
    expect(setPlayerOverrideConfigMock).not.toHaveBeenCalled();
    expect(uiMock.notifications.warn).toHaveBeenCalledWith(
      "You do not have permission to edit player wildshape overrides."
    );
  });

  it("saves normalized player override config when authorized", async () => {
    const menu = new PlayerOverrideMenu() as any;
    await menu._updateObject({} as Event, {
      mappings: {
        0: {
          id: "map_1",
          formRefsAdd: [{ mode: "name", value: " Panther Form " }],
          formRefsRemove: [{ mode: "uuid", value: " form-2 " }],
          filtersOverride: { enabled: true, whitelist: "Bite", blacklist: "Dash" },
        },
        1: {
          id: "map_2",
          formRefsAdd: [],
          formRefsRemove: [],
          filtersOverride: { enabled: false, whitelist: "", blacklist: "" },
        },
      },
    });

    const gameMock = (globalThis as Record<string, unknown>).game as {
      user: { id: string };
    };
    const uiMock = (globalThis as Record<string, unknown>).ui as {
      notifications: { info: ReturnType<typeof vi.fn> };
    };
    expect(setPlayerOverrideConfigMock).toHaveBeenCalledWith(
      {
        version: SCHEMA_VERSION,
        mappings: [
          {
            id: "map_1",
            formRefsAdd: [{ mode: "name", value: "Panther Form" }],
            formRefsRemove: [{ mode: "uuid", value: "form-2" }],
            filtersOverride: {
              whitelist: ["Bite"],
              blacklist: ["Dash"],
            },
          },
        ],
      },
      gameMock.user
    );
    expect(uiMock.notifications.info).toHaveBeenCalledWith("Wildshape player override saved.");
  });

  it("registers the player override settings menu", () => {
    registerPlayerOverrideMenu();
    const gameMock = (globalThis as Record<string, unknown>).game as {
      settings: { registerMenu: ReturnType<typeof vi.fn> };
    };
    expect(gameMock.settings.registerMenu).toHaveBeenCalledWith(
      MODULE_ID,
      SETTINGS_KEYS.PLAYER_OVERRIDE_MENU,
      expect.objectContaining({
        type: PlayerOverrideMenu,
        restricted: false,
      })
    );
  });
});
