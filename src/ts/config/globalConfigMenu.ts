import { MODULE_ID, SCHEMA_VERSION, SETTINGS_KEYS } from "../constants";
import { getGlobalConfig, setGlobalConfig } from "./settings";
import { normalizeGlobalConfig, normalizeString } from "./normalize";
import { DEFAULT_WILDSHAPE_FILTERS } from "./defaults";
import type {
  FormRef,
  FormRefMode,
  GlobalConfig,
  WildshapeMapping,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cloneGlobalConfig(config: GlobalConfig): GlobalConfig {
  return JSON.parse(JSON.stringify(config)) as GlobalConfig;
}

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
  if (Array.isArray(value) || isRecord(value)) {
    return toIndexedArray(value).flatMap((entry) => parseStringList(entry));
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

function parseMappings(value: unknown): WildshapeMapping[] {
  return toIndexedArray(value).map((entry, index) => {
    const record = isRecord(entry) ? entry : {};
    const trigger = isRecord(record["trigger"]) ? record["trigger"] : {};
    const defaultFilters = isRecord(record["defaultFilters"])
      ? record["defaultFilters"]
      : {};

    const formAbilityUuids = parseStringList(record["formAbilityUuids"]);

    return {
      id: asString(record["id"], `map_${index + 1}`),
      trigger: {
        mode: "itemName",
        value: asString(trigger["value"]),
      },
      formRefs: parseFormRefs(record["formRefs"]),
      defaultFilters: {
        whitelist: parseStringList(defaultFilters["whitelist"]),
        blacklist: parseStringList(defaultFilters["blacklist"]),
      },
      ...(formAbilityUuids.length > 0 ? { formAbilityUuids } : {}),
    };
  });
}

function parseGlobalConfigDraftFromEditorData(
  value: unknown,
  fallback: GlobalConfig
): GlobalConfig {
  const root = isRecord(value) ? value : {};
  const permissions = isRecord(root["permissions"]) ? root["permissions"] : {};
  const ui = isRecord(root["ui"]) ? root["ui"] : {};

  return {
    version: SCHEMA_VERSION,
    mappings: parseMappings(root["mappings"]),
    permissions: {
      playerOverrideEditors: parseStringList(permissions["playerOverrideEditors"]),
    },
    ui: {
      showDebugLogs: asBoolean(ui["showDebugLogs"], fallback.ui.showDebugLogs),
    },
  };
}

export function buildGlobalConfigFromEditorData(
  value: unknown,
  fallback: GlobalConfig
): GlobalConfig {
  return normalizeGlobalConfig(parseGlobalConfigDraftFromEditorData(value, fallback));
}

function buildModeOptions(selected: FormRefMode): Array<{
  value: FormRefMode;
  label: string;
  selected: boolean;
}> {
  return [
    {
      value: "uuid",
      label: "UUID",
      selected: selected === "uuid",
    },
    {
      value: "name",
      label: "Name",
      selected: selected === "name",
    },
  ];
}

function createDefaultMapping(nextIndex: number): WildshapeMapping {
  return {
    id: `map_${nextIndex + 1}`,
    trigger: {
      mode: "itemName",
      value: "Wildshape",
    },
    formRefs: [],
    defaultFilters: {
      whitelist: [...DEFAULT_WILDSHAPE_FILTERS.whitelist],
      blacklist: [...DEFAULT_WILDSHAPE_FILTERS.blacklist],
    },
    formAbilityUuids: [],
  };
}

function createDefaultFormRef(): FormRef {
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

interface FormAbilityMatchResult {
  matchFound: boolean;
  abilityName: string | null;
}

function getActorItems(actor: Actor): unknown[] {
  const collectionItems = (actor.items as unknown as { contents?: unknown[] } | undefined)?.contents;
  if (Array.isArray(collectionItems)) {
    return collectionItems;
  }

  const actorObject =
    typeof (actor as unknown as { toObject?: () => unknown }).toObject === "function"
      ? ((actor as unknown as { toObject: () => unknown }).toObject() as Record<string, unknown>)
      : {};
  return Array.isArray(actorObject["items"]) ? actorObject["items"] : [];
}

function getActorItemName(actor: Actor, itemId: string): string | null {
  const item = getActorItems(actor).find((entry) => {
    if (!isRecord(entry)) {
      return false;
    }
    const id = entry["_id"] ?? entry["id"];
    return typeof id === "string" && id === itemId;
  });
  if (!isRecord(item)) {
    return null;
  }
  return typeof item["name"] === "string" ? item["name"] : null;
}

function resolveFormAbilityMatchSync(formAbilityUuid: string, actors: Actor[]): FormAbilityMatchResult {
  const normalized = normalizeString(formAbilityUuid);
  if (!normalized) {
    return {
      matchFound: false,
      abilityName: null,
    };
  }

  const actorItemMatch = /^Actor\.([^.]+)\.Item\.([^.]+)$/i.exec(normalized);
  if (!actorItemMatch) {
    return {
      matchFound: false,
      abilityName: null,
    };
  }

  const actorId = actorItemMatch[1];
  const itemId = actorItemMatch[2];
  const actor = actors.find(
    (entry) =>
      entry.id === actorId ||
      entry.uuid === actorId ||
      entry.uuid === `Actor.${actorId}` ||
      entry.id === `Actor.${actorId}`
  );
  if (!actor) {
    return {
      matchFound: false,
      abilityName: null,
    };
  }

  const abilityName = getActorItemName(actor, itemId);
  return {
    matchFound: Boolean(abilityName),
    abilityName,
  };
}

function isItemDocumentLike(value: unknown): value is { name?: unknown; documentName?: unknown } {
  if (!isRecord(value)) {
    return false;
  }
  const documentName = value["documentName"];
  if (documentName !== undefined && documentName !== "Item") {
    return false;
  }
  return typeof value["name"] === "string";
}

async function resolveFormAbilityMatch(
  formAbilityUuid: string,
  actors: Actor[]
): Promise<FormAbilityMatchResult> {
  const syncMatch = resolveFormAbilityMatchSync(formAbilityUuid, actors);
  if (syncMatch.matchFound) {
    return syncMatch;
  }

  const normalized = normalizeString(formAbilityUuid);
  if (!normalized) {
    return syncMatch;
  }

  const fromUuidRef = (globalThis as { fromUuid?: (uuid: string) => Promise<unknown> }).fromUuid;
  if (typeof fromUuidRef !== "function") {
    return syncMatch;
  }

  try {
    const resolved = await fromUuidRef(normalized);
    if (isItemDocumentLike(resolved)) {
      return {
        matchFound: true,
        abilityName: resolved.name as string,
      };
    }
  } catch (error) {
    void error;
  }

  return syncMatch;
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

export class GlobalConfigMenu extends FormApplicationBase {
  private draftConfig: GlobalConfig;
  private collapsedMappingIds: Set<string>;
  private liveValidationCounter: number;

  public constructor(object: object = {}, options?: Partial<FormApplicationOptions>) {
    super(object, options);
    this.draftConfig = cloneGlobalConfig(getGlobalConfig());
    this.collapsedMappingIds = new Set<string>();
    this.liveValidationCounter = 0;
  }

  public static override get defaultOptions(): FormApplicationOptions {
    return {
      ...super.defaultOptions,
      id: `${MODULE_ID}-global-config-menu`,
      classes: ["shape-so-nice", "wildshape-global-config"],
      template: `modules/${MODULE_ID}/templates/global-config-menu.hbs`,
      title:
        (game as Game).i18n?.localize("WILDSHAPE.settings.globalConfig.menu.name") ??
        "Wildshape Global Config",
      width: 980,
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
      permissionsEditorIds: this.draftConfig.permissions.playerOverrideEditors.join(", "),
      permissionsEditorEntries: this.draftConfig.permissions.playerOverrideEditors.map(
        (entry, index) => ({
          index,
          value: entry,
        })
      ),
      showDebugLogs: this.draftConfig.ui.showDebugLogs,
      mappings: this.draftConfig.mappings.map((mapping, mappingIndex) => ({
        index: mappingIndex,
        id: mapping.id,
        title: normalizeString(mapping.trigger.value) || "Unnamed Ability",
        collapsed: this.collapsedMappingIds.has(mapping.id),
        triggerValue: mapping.trigger.value,
        whitelistEntries: mapping.defaultFilters.whitelist.map((entry, entryIndex) => ({
          index: entryIndex,
          value: entry,
        })),
        blacklistEntries: mapping.defaultFilters.blacklist.map((entry, entryIndex) => ({
          index: entryIndex,
          value: entry,
        })),
        formAbilityEntries: (mapping.formAbilityUuids ?? []).map((entry, entryIndex) => {
          const match = resolveFormAbilityMatchSync(entry, actors);
          return {
            index: entryIndex,
            value: entry,
            matchFound: match.matchFound,
            abilityName: match.abilityName,
          };
        }),
        formRefs: mapping.formRefs.map((formRef, formRefIndex) => ({
          index: formRefIndex,
          modeOptions: buildModeOptions(formRef.mode),
          value: formRef.value,
          matchFound: Boolean(resolveFormRefMatch(formRef, actors)),
        })),
      })),
    } as unknown as FormApplication.Data<{}, FormApplicationOptions>;
  }

  public override activateListeners(html: JQuery): void {
    super.activateListeners(html);

    html.find("button[data-action]").on("click", (event) => {
      event.preventDefault();
      const source = event.currentTarget as HTMLElement | null;
      if (!source) {
        return;
      }

      this.syncDraftFromForm();
      const action = source.dataset.action ?? "";
      const mappingIndex = Number(source.dataset.mappingIndex);
      const formRefIndex = Number(source.dataset.formRefIndex);
      const mappingId = asString(source.dataset.mappingId, "");

      if (action === "add-mapping") {
        this.draftConfig.mappings.push(createDefaultMapping(this.draftConfig.mappings.length));
      } else if (action === "remove-mapping" && Number.isInteger(mappingIndex)) {
        const mapping = this.draftConfig.mappings[mappingIndex];
        if (mapping?.id) {
          this.collapsedMappingIds.delete(mapping.id);
        }
        this.draftConfig.mappings.splice(mappingIndex, 1);
      } else if (action === "toggle-mapping" && mappingId.length > 0) {
        if (this.collapsedMappingIds.has(mappingId)) {
          this.collapsedMappingIds.delete(mappingId);
        } else {
          this.collapsedMappingIds.add(mappingId);
        }
      } else if (action === "add-permission-editor") {
        this.draftConfig.permissions.playerOverrideEditors.push("");
      } else if (action === "remove-permission-editor" && Number.isInteger(formRefIndex)) {
        this.draftConfig.permissions.playerOverrideEditors.splice(formRefIndex, 1);
      } else if (action === "add-form-ref" && Number.isInteger(mappingIndex)) {
        const mapping = this.draftConfig.mappings[mappingIndex];
        if (mapping) {
          mapping.formRefs.push(createDefaultFormRef());
        }
      } else if (action === "add-whitelist-entry" && Number.isInteger(mappingIndex)) {
        const mapping = this.draftConfig.mappings[mappingIndex];
        if (mapping) {
          mapping.defaultFilters.whitelist.push("");
        }
      } else if (
        action === "remove-whitelist-entry" &&
        Number.isInteger(mappingIndex) &&
        Number.isInteger(formRefIndex)
      ) {
        const mapping = this.draftConfig.mappings[mappingIndex];
        if (mapping) {
          mapping.defaultFilters.whitelist.splice(formRefIndex, 1);
        }
      } else if (action === "add-blacklist-entry" && Number.isInteger(mappingIndex)) {
        const mapping = this.draftConfig.mappings[mappingIndex];
        if (mapping) {
          mapping.defaultFilters.blacklist.push("");
        }
      } else if (action === "add-form-ability-entry" && Number.isInteger(mappingIndex)) {
        const mapping = this.draftConfig.mappings[mappingIndex];
        if (mapping) {
          if (!Array.isArray(mapping.formAbilityUuids)) {
            mapping.formAbilityUuids = [];
          }
          mapping.formAbilityUuids.push("");
        }
      } else if (
        action === "remove-blacklist-entry" &&
        Number.isInteger(mappingIndex) &&
        Number.isInteger(formRefIndex)
      ) {
        const mapping = this.draftConfig.mappings[mappingIndex];
        if (mapping) {
          mapping.defaultFilters.blacklist.splice(formRefIndex, 1);
        }
      } else if (
        action === "remove-form-ability-entry" &&
        Number.isInteger(mappingIndex) &&
        Number.isInteger(formRefIndex)
      ) {
        const mapping = this.draftConfig.mappings[mappingIndex];
        if (mapping && Array.isArray(mapping.formAbilityUuids)) {
          mapping.formAbilityUuids.splice(formRefIndex, 1);
        }
      } else if (
        action === "remove-form-ref" &&
        Number.isInteger(mappingIndex) &&
        Number.isInteger(formRefIndex)
      ) {
        const mapping = this.draftConfig.mappings[mappingIndex];
        if (mapping) {
          mapping.formRefs.splice(formRefIndex, 1);
        }
      }

      this.render(true);
    });

    html.on("keydown input", "input[name$='.trigger.value']", (event) => {
      const input = event.currentTarget as HTMLInputElement | null;
      if (!input) {
        return;
      }
      this.refreshMappingTitle(input);
    });

    html.on("keydown input", "input[name*='.formRefs.'][name$='.value']", (event) => {
      const input = event.currentTarget as HTMLInputElement | null;
      if (!input) {
        return;
      }
      this.refreshFormRefConfirmation(input);
    });

    html.on("change", "select[name*='.formRefs.'][name$='.mode']", (event) => {
      const select = event.currentTarget as HTMLSelectElement | null;
      if (!select) {
        return;
      }
      const row = select.closest(".ws-form-ref-row--form-ref");
      if (!row) {
        return;
      }
      const input = row.querySelector<HTMLInputElement>("input[name*='.formRefs.'][name$='.value']");
      if (!input) {
        return;
      }
      this.refreshFormRefConfirmation(input);
    });

    html.on("keydown input", "input[name*='.formAbilityUuids.'][name$='.value']", (event) => {
      const input = event.currentTarget as HTMLInputElement | null;
      if (!input) {
        return;
      }
      void this.refreshFormAbilityConfirmation(input);
    });

    // Refresh persisted UUID mappings on render so resolved status matches runtime transform behavior.
    html
      .find("input[name*='.formAbilityUuids.'][name$='.value']")
      .each?.((_index: number, element: unknown) => {
        const input = element as HTMLInputElement | null;
        if (!input) {
          return;
        }
        void this.refreshFormAbilityConfirmation(input);
      });
  }

  protected override async _updateObject(
    _event: Event,
    formData: Record<string, unknown>
  ): Promise<void> {
    const expanded = foundry.utils.expandObject(formData) as Record<string, unknown>;
    const nextConfig = buildGlobalConfigFromEditorData(expanded, this.draftConfig);

    await setGlobalConfig(nextConfig);
    this.draftConfig = cloneGlobalConfig(nextConfig);
    ui.notifications?.info("Wildshape global config saved.");
  }

  private syncDraftFromForm(): void {
    const form = this.form;
    if (!form) {
      return;
    }

    const expanded = foundry.utils.expandObject(
      readFormValues(form as HTMLFormElement)
    ) as Record<string, unknown>;
    this.draftConfig = parseGlobalConfigDraftFromEditorData(expanded, this.draftConfig);
  }

  private refreshMappingTitle(input: HTMLInputElement): void {
    const card = input.closest(".ws-mapping-card");
    if (!card) {
      return;
    }
    const titleElement = card.querySelector<HTMLElement>("[data-role='mapping-title']");
    if (!titleElement) {
      return;
    }
    titleElement.textContent = normalizeString(input.value) || "Unnamed Ability";
  }

  private applyMatchBadge(statusElement: HTMLElement, matchFound: boolean, title: string): void {
    statusElement.classList.toggle("is-match", matchFound);
    statusElement.classList.toggle("is-missing", !matchFound);
    statusElement.title = title;
    const icon = statusElement.querySelector("i");
    if (!icon) {
      return;
    }
    icon.classList.toggle("fa-check", matchFound);
    icon.classList.toggle("fa-times", !matchFound);
  }

  private refreshFormRefConfirmation(input: HTMLInputElement): void {
    const row = input.closest(".ws-form-ref-row--form-ref");
    if (!row) {
      return;
    }

    const modeSelect = row.querySelector<HTMLSelectElement>("select[name*='.formRefs.'][name$='.mode']");
    const status = row.querySelector<HTMLElement>(".ws-entry-status");
    if (!modeSelect || !status) {
      return;
    }

    const formRef: FormRef = {
      mode: asFormRefMode(modeSelect.value, "name"),
      value: input.value,
    };
    const matchFound = Boolean(resolveFormRefMatch(formRef, getWorldActors()));
    this.applyMatchBadge(
      status,
      matchFound,
      matchFound ? "Matching actor found" : "No matching actor found"
    );
  }

  private async refreshFormAbilityConfirmation(input: HTMLInputElement): Promise<void> {
    const row = input.closest<HTMLElement>(".ws-form-ref-row--ability-ref");
    if (!row) {
      return;
    }
    const status = row.querySelector<HTMLElement>(".ws-entry-status");
    const label = row.querySelector<HTMLElement>("[data-role='ability-name']");
    if (!status || !label) {
      return;
    }

    const validationToken = String(++this.liveValidationCounter);
    row.dataset.validationToken = validationToken;
    const match = await resolveFormAbilityMatch(input.value, getWorldActors());
    if (row.dataset.validationToken !== validationToken) {
      return;
    }

    this.applyMatchBadge(
      status,
      match.matchFound,
      match.matchFound ? "Matching ability found" : "No matching ability found"
    );
    label.textContent = match.abilityName ?? "Unknown ability";
  }
}

export function registerGlobalConfigMenu(): void {
  (game as Game).settings.registerMenu(MODULE_ID, SETTINGS_KEYS.GLOBAL_CONFIG_MENU, {
    name: "WILDSHAPE.settings.globalConfig.menu.name",
    hint: "WILDSHAPE.settings.globalConfig.menu.hint",
    label: "WILDSHAPE.settings.globalConfig.menu.label",
    icon: "fas fa-paw",
    type: GlobalConfigMenu,
    restricted: true,
  });
}
