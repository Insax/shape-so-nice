// Do not remove this import. If you do Vite will think your styles are dead
// code and not include them in the build output.
import "../styles/style.scss";
import { createAdapterRegistry } from "./adapters/registry";
import type { WildshapeAdapter } from "./adapters/types";
import { MODULE_ID } from "./constants";
import { registerGlobalConfigMenu } from "./config/globalConfigMenu";
import { registerPlayerOverrideMenu } from "./config/playerOverrideMenu";
import { registerGlobalSettings } from "./config/settings";
import { registerWildshapeHooks } from "./core/hooks";
import { logInfo, logWarning } from "./core/logger";
import { handleWildshapeItemUse } from "./core/triggerHandler";
import type { WildshapeModule } from "./types";

const adapterRegistry = createAdapterRegistry();
let activeAdapter: WildshapeAdapter | null = null;

Hooks.once("init", () => {
  registerGlobalSettings();
  registerGlobalConfigMenu();
  registerPlayerOverrideMenu();

  const moduleData = (game as Game).modules.get(MODULE_ID) as
    | WildshapeModule
    | undefined;
  if (!moduleData) {
    logWarning("wildshape.module.missing", { moduleId: MODULE_ID });
    return;
  }

  moduleData.api = {
    getActiveAdapter: () => activeAdapter,
    handleItemUse: (item: Item, targetUser?: User) =>
      handleWildshapeItemUse(item, activeAdapter, targetUser),
  };
  logInfo("wildshape.init.completed", { moduleId: MODULE_ID });
});

Hooks.once("ready", () => {
  activeAdapter = adapterRegistry.getActiveAdapter();
  if (!activeAdapter) {
    logWarning("wildshape.adapter.notFound", { systemId: (game as Game).system.id });
    return;
  }

  logInfo("wildshape.adapter.selected", {
    adapterId: activeAdapter.id,
    systemId: (game as Game).system.id,
  });

  registerWildshapeHooks(() => activeAdapter);
});
