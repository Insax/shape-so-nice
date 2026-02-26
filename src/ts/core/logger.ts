import { MODULE_ID, SETTINGS_KEYS } from "../constants";
import { isGlobalConfig } from "../config/validation";

type LogPayload = Record<string, unknown> | undefined;

function write(level: "log" | "warn" | "error", event: string, payload?: LogPayload): void {
  const prefix = `[${MODULE_ID}] ${event}`;
  if (payload) {
    console[level](prefix, payload);
    return;
  }
  console[level](prefix);
}

function canReadDebugSetting(): boolean {
  return Boolean(
    (game as Game).settings?.settings?.has(
      `${MODULE_ID}.${SETTINGS_KEYS.GLOBAL_CONFIG}`
    )
  );
}

function isDebugEnabled(): boolean {
  if (!canReadDebugSetting()) {
    return false;
  }

  const rawConfig = (game as Game).settings.get(
    MODULE_ID,
    SETTINGS_KEYS.GLOBAL_CONFIG
  );
  if (!isGlobalConfig(rawConfig)) {
    return false;
  }
  return rawConfig.ui.showDebugLogs;
}

function getUiNotifications():
  | {
      info?: (message: string) => void;
      warn?: (message: string) => void;
      error?: (message: string) => void;
    }
  | null {
  const uiRef = (globalThis as {
    ui?: {
      notifications?: {
        info?: (message: string) => void;
        warn?: (message: string) => void;
        error?: (message: string) => void;
      };
    };
  }).ui;
  return uiRef?.notifications ?? null;
}

export function logInfo(event: string, payload?: LogPayload): void {
  write("log", event, payload);
}

export function logWarning(event: string, payload?: LogPayload): void {
  write("warn", event, payload);
}

export function logError(event: string, payload?: LogPayload): void {
  write("error", event, payload);
}

export function logDebug(event: string, payload?: LogPayload): void {
  if (!isDebugEnabled()) {
    return;
  }
  write("log", event, payload);
}

export function debugAlert(message: string): void {
  if (!isDebugEnabled()) {
    return;
  }
  getUiNotifications()?.info?.(`[${MODULE_ID}] ${message}`);
}
