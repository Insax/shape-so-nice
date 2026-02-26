import { NimbleAdapter } from "./nimbleAdapter";
import type { WildshapeAdapter } from "./types";

export class AdapterRegistry {
  private readonly adapters: WildshapeAdapter[] = [];

  public register(adapter: WildshapeAdapter): void {
    this.adapters.push(adapter);
  }

  public getActiveAdapter(): WildshapeAdapter | null {
    return this.adapters.find((adapter) => adapter.detect()) ?? null;
  }
}

export function createAdapterRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register(new NimbleAdapter());
  return registry;
}
