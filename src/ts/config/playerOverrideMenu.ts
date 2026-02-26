import { MODULE_ID, SCHEMA_VERSION, SETTINGS_KEYS } from "../constants";
import { getGlobalConfig } from "./settings";
import {
  canCurrentUserEditPlayerOverride,
  getPlayerOverrideConfig,
  setPlayerOverrideConfig,
} from "./playerOverride";
import { normalizePlayerOverrideConfig, normalizeString } from "./normalize";
import { isRecord } from "../utils/typeGuards";
import type {
  FormRef,
  FormRefMode,
  PlayerOverrideConfig,
  PlayerOverrideMapping,
  WildshapeMapping,
} from "./types";

function toIndexedArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((key) => value[key]);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "on", "yes", "1"].includes(normalized);
  }

  if (typeof value === "number") {
    return value === 1;
  }

  return fallback;
}

function asFormRefMode(value: unknown, fallback: FormRefMode): FormRefMode {
  return value === "uuid" || value === "name" ? value : fallback;
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseStringList(entry));
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseFormRefs(value: unknown): FormRef[] {
  return toIndexedArray(value)
    .map((entry): FormRef => {
      const record = isRecord(entry) ? entry : {};
      return {
        mode: asFormRefMode(record["mode"], "name"),
        value: asString(record["value"]),
      };
    })
    .filter((ref) => ref.value.trim().length > 0);
}

function clonePlayerOverrideConfig(config: PlayerOverrideConfig): PlayerOverrideConfig {
  return JSON.parse(JSON.stringify(config)) as PlayerOverrideConfig;
}

interface OverrideEditorRow {
  id: string;
  triggerValue: string;
  formRefsAdd: FormRef[];
  formRefsRemove: FormRef[];
  filtersOverrideEnabled: boolean;
  filtersWhitelist: string[];
  filtersBlacklist: string[];
}

function modeOptions(selected: FormRefMode): Array<{
  value: FormRefMode;
  label: string;
  selected: boolean;
}> {
  return [
    { value: "name", label: "Name", selected: selected === "name" },
    { value: "uuid", label: "UUID", selected: selected === "uuid" },
  ];
}

function emptyFormRef(): FormRef {
  return {
    mode: "name",
    value: "",
  };
}

function getWorldActors(): Actor[] {
  const actorsCollection = (game as Game).actors as
    | {
        contents?: Actor[];
      }
    | undefined;
  return actorsCollection?.contents ?? [];
}

function resolveFormRefMatch(formRef: FormRef, actors: Actor[]): Actor | undefined {
  if (formRef.mode === "uuid") {
    return actors.find(
      (actor) =>
        actor.uuid === formRef.value ||
        actor.id === formRef.value ||
        `Actor.${actor.id}` === formRef.value
    );
  }

  const normalizedValue = normalizeString(formRef.value).toLowerCase();
  if (normalizedValue.length === 0) {
    return undefined;
  }

  return actors.find(
    (actor) =>
      typeof actor.name === "string" &&
      normalizeString(actor.name).toLowerCase() === normalizedValue
  );
}

export function buildOverrideRows(input: {
  globalMappings: WildshapeMapping[];
  overrideConfig: PlayerOverrideConfig;
}): OverrideEditorRow[] {
  return input.globalMappings.map((globalMapping) => {
    const override = input.overrideConfig.mappings.find((entry) => entry.id === globalMapping.id);
    return {
      id: globalMapping.id,
      triggerValue: globalMapping.trigger.value,
      formRefsAdd: override?.formRefsAdd ? JSON.parse(JSON.stringify(override.formRefsAdd)) : [],
      formRefsRemove: override?.formRefsRemove
        ? JSON.parse(JSON.stringify(override.formRefsRemove))
        : [],
      filtersOverrideEnabled: override?.filtersOverride !== undefined,
      filtersWhitelist: override?.filtersOverride
        ? [...override.filtersOverride.whitelist]
        : [],
      filtersBlacklist: override?.filtersOverride
        ? [...override.filtersOverride.blacklist]
        : [],
    };
  });
}

export function buildRowsFromEditorData(
  value: unknown,
  fallbackRows: OverrideEditorRow[]
): OverrideEditorRow[] {
  const root = isRecord(value) ? value : {};
  const mappingEntries = toIndexedArray(root["mappings"]);
  if (mappingEntries.length === 0) {
    return fallbackRows;
  }

  return fallbackRows.map((fallbackRow, index) => {
    const entry = mappingEntries[index];
    const record = isRecord(entry) ? entry : {};
    const filtersOverride = isRecord(record["filtersOverride"]) ? record["filtersOverride"] : {};

    return {
      id: asString(record["id"], fallbackRow.id),
      triggerValue: fallbackRow.triggerValue,
      formRefsAdd: parseFormRefs(record["formRefsAdd"]),
      formRefsRemove: parseFormRefs(record["formRefsRemove"]),
      filtersOverrideEnabled: asBoolean(
        filtersOverride["enabled"],
        fallbackRow.filtersOverrideEnabled
      ),
      filtersWhitelist: parseStringList(filtersOverride["whitelist"]),
      filtersBlacklist: parseStringList(filtersOverride["blacklist"]),
    };
  });
}

export function buildPlayerOverrideFromRows(rows: OverrideEditorRow[]): PlayerOverrideConfig {
  const mappings: PlayerOverrideMapping[] = rows
    .map((row): PlayerOverrideMapping | null => {
      const hasRefChanges = row.formRefsAdd.length > 0 || row.formRefsRemove.length > 0;
      const filtersOverride = row.filtersOverrideEnabled
        ? {
            whitelist: row.filtersWhitelist,
            blacklist: row.filtersBlacklist,
          }
        : undefined;
      const hasOverride = hasRefChanges || filtersOverride !== undefined;
      if (!hasOverride) {
        return null;
      }

      return {
        id: row.id,
        formRefsAdd: row.formRefsAdd,
        formRefsRemove: row.formRefsRemove,
        filtersOverride,
      };
    })
    .filter((mapping): mapping is PlayerOverrideMapping => mapping !== null);

  return normalizePlayerOverrideConfig({
    version: SCHEMA_VERSION,
    mappings,
  });
}

function readFormValues(form: HTMLFormElement): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const formData = new FormData(form);
  formData.forEach((rawValue, key) => {
    output[key] = rawValue;
  });

  const checkboxInputs = form.querySelectorAll<HTMLInputElement>("input[type='checkbox'][name]");
  checkboxInputs.forEach((checkbox) => {
    output[checkbox.name] = checkbox.checked;
  });
  return output;
}

const FormApplicationBase = (globalThis as Record<string, unknown>)
  .FormApplication as typeof FormApplication;

export class PlayerOverrideMenu extends FormApplicationBase {
  private readonly targetUser: User | null;
  private readonly canEdit: boolean;
  private editorRows: OverrideEditorRow[];

  public constructor(object: object = {}, options?: Partial<FormApplicationOptions>) {
    super(object, options);
    this.targetUser = (game as Game).user ?? null;
    this.canEdit = this.targetUser ? canCurrentUserEditPlayerOverride(this.targetUser) : false;
    this.editorRows = buildOverrideRows({
      globalMappings: getGlobalConfig().mappings,
      overrideConfig: getPlayerOverrideConfig(this.targetUser ?? undefined),
    });
  }

  public static override get defaultOptions(): FormApplicationOptions {
    return {
      ...super.defaultOptions,
      id: `${MODULE_ID}-player-override-menu`,
      classes: ["shape-so-nice", "wildshape-player-override"],
      template: `modules/${MODULE_ID}/templates/player-override-menu.hbs`,
      title:
        (game as Game).i18n?.localize("WILDSHAPE.settings.playerOverride.menu.name") ??
        "Wildshape Player Override",
      width: 860,
      closeOnSubmit: false,
      submitOnClose: false,
    };
  }

  public override getData(
    options?: Partial<FormApplicationOptions>
  ): FormApplication.Data<{}, FormApplicationOptions> {
    void options;
    const actors = getWorldActors();
    return {
      canEdit: this.canEdit,
      hasTargetUser: Boolean(this.targetUser),
      mappings: this.editorRows.map((row, mappingIndex) => ({
        index: mappingIndex,
        id: row.id,
        triggerValue: row.triggerValue,
        filtersOverrideEnabled: row.filtersOverrideEnabled,
        whitelistInput: row.filtersWhitelist.join(", "),
        blacklistInput: row.filtersBlacklist.join(", "),
        formRefsAdd: row.formRefsAdd.map((ref, refIndex) => ({
          index: refIndex,
          value: ref.value,
          modeOptions: modeOptions(ref.mode),
          matchFound: Boolean(resolveFormRefMatch(ref, actors)),
        })),
        formRefsRemove: row.formRefsRemove.map((ref, refIndex) => ({
          index: refIndex,
          value: ref.value,
          modeOptions: modeOptions(ref.mode),
          matchFound: Boolean(resolveFormRefMatch(ref, actors)),
        })),
      })),
    } as unknown as FormApplication.Data<{}, FormApplicationOptions>;
  }

  public override activateListeners(html: JQuery): void {
    super.activateListeners(html);
    if (!this.canEdit) {
      return;
    }

    html.find("button[data-action]").on("click", (event) => {
      event.preventDefault();
      const source = event.currentTarget as HTMLElement | null;
      if (!source) {
        return;
      }

      this.syncRowsFromForm();
      const action =
        typeof source.dataset.action === "string" ? source.dataset.action : "";
      const mappingIndex = Number(source.dataset.mappingIndex);
      const formRefIndex = Number(source.dataset.formRefIndex);
      const row = this.editorRows[mappingIndex];

      if (action === "add-form-add" && row) {
        row.formRefsAdd.push(emptyFormRef());
      } else if (action === "remove-form-add" && row && Number.isInteger(formRefIndex)) {
        row.formRefsAdd.splice(formRefIndex, 1);
      } else if (action === "add-form-remove" && row) {
        row.formRefsRemove.push(emptyFormRef());
      } else if (action === "remove-form-remove" && row && Number.isInteger(formRefIndex)) {
        row.formRefsRemove.splice(formRefIndex, 1);
      }

      this.render();
    });
  }

  protected override async _updateObject(
    _event: Event,
    formData: Record<string, unknown>
  ): Promise<void> {
    if (!this.targetUser) {
      ui.notifications?.warn("No user context is available for player override settings.");
      return;
    }

    if (!this.canEdit) {
      ui.notifications?.warn("You do not have permission to edit player wildshape overrides.");
      return;
    }

    const expanded = foundry.utils.expandObject(formData) as Record<string, unknown>;
    this.editorRows = buildRowsFromEditorData(expanded, this.editorRows);
    const nextOverride = buildPlayerOverrideFromRows(this.editorRows);

    await setPlayerOverrideConfig(nextOverride, this.targetUser);
    this.editorRows = buildOverrideRows({
      globalMappings: getGlobalConfig().mappings,
      overrideConfig: clonePlayerOverrideConfig(nextOverride),
    });
    ui.notifications?.info("Wildshape player override saved.");
  }

  private syncRowsFromForm(): void {
    if (!this.form) {
      return;
    }

    const expanded = foundry.utils.expandObject(
      readFormValues(this.form as HTMLFormElement)
    ) as Record<string, unknown>;
    this.editorRows = buildRowsFromEditorData(expanded, this.editorRows);
  }
}

export function registerPlayerOverrideMenu(): void {
  (game as Game).settings.registerMenu(MODULE_ID, SETTINGS_KEYS.PLAYER_OVERRIDE_MENU, {
    name: "WILDSHAPE.settings.playerOverride.menu.name",
    hint: "WILDSHAPE.settings.playerOverride.menu.hint",
    label: "WILDSHAPE.settings.playerOverride.menu.label",
    icon: "fas fa-user",
    type: PlayerOverrideMenu,
    restricted: false,
  });
}
