# Nimble Conformance Notes

This addon currently targets Nimble behavior as implemented in:
- `/home/marcusk/Documents/Foundry/Modules/FoundryVTT-Nimble/src/config/registerDocumentConfig.ts`
- `/home/marcusk/Documents/Foundry/Modules/FoundryVTT-Nimble/src/documents/item/base.svelte.ts`
- `/home/marcusk/Documents/Foundry/Modules/FoundryVTT-Nimble/src/documents/item/spell.ts`
- `/home/marcusk/Documents/Foundry/Modules/FoundryVTT-Nimble/src/config.ts`

## Confirmed Runtime Fields

- item type: `item.type`
- object subtype: `item.system.objectType`
- feature subtype: `item.system.featureType`

These fields are used for whitelist/blacklist descriptor matching.

## Confirmed Activation Pattern

- Nimble item activation is implemented on item documents via `item.activate(...)`.
- Nimble does not expose a dedicated `nimble.useItem` hook event in its runtime source.
- To avoid chat-only dependency, this addon wraps Nimble item `activate` methods through adapter-level direct listener registration.
- Chat parsing (`createChatMessage`) remains a configurable fallback (`ui.useChatFallback`).

## Ensured Wildshape Action Payload

Injected wildshape action payload remains Nimble-compatible:
- `type: "feature"`
- `system.featureType: "class"`

This preserves actor sheet integration and activation behavior for reshaping/revert flows.
