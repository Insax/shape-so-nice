import { ModuleData } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/packages.mjs";
import type { WildshapeAdapter } from "./adapters/types";

export interface WildshapeApi {
  getActiveAdapter(): WildshapeAdapter | null;
  handleItemUse(item: Item, targetUser?: User): Promise<boolean>;
}

export interface WildshapeModule extends Game.ModuleData<ModuleData> {
  api: WildshapeApi;
}
