import type { WildshapeAdapter } from "../adapters/types";
import { resolveMappedFormsForItemName } from "./formResolver";
import { debugAlert } from "./logger";
import { getModuleWildshapeActorState } from "./state";
import { applyWildshapeForm, revertWildshapeForm } from "./transform";

export type WildshapeChoice =
  | {
      kind: "original";
      label: string;
    }
  | {
      kind: "form";
      label: string;
      formActor: Actor;
    };

function buildButtons(
  choices: WildshapeChoice[],
  onSelect: (choice: WildshapeChoice) => void
): Dialog.Data["buttons"] {
  const buttons: Dialog.Data["buttons"] = {};
  choices.forEach((choice, index) => {
    buttons[`choice_${index}`] = {
      label: choice.label,
      callback: () => onSelect(choice),
    };
  });
  return buttons;
}

export function buildWildshapeChoices(actor: Actor, formActors: Actor[]): WildshapeChoice[] {
  const state = getModuleWildshapeActorState(actor);
  const currentFormActorId = state?.isShaped ? state.currentFormActorId : null;

  const formChoices: WildshapeChoice[] = formActors
    .filter((formActor) => formActor.id && formActor.id !== currentFormActorId)
    .map((formActor) => ({
      kind: "form" as const,
      label: formActor.name || "Unnamed Form",
      formActor,
    }));

  if (state?.isShaped) {
    return [{ kind: "original", label: "Original Form" }, ...formChoices];
  }

  return formChoices;
}

export async function openWildshapeChooser(input: {
  actor: Actor;
  item: Item;
  adapter: WildshapeAdapter;
  targetUser?: User;
}): Promise<boolean> {
  const itemName = input.item.name ?? "";
  const formActors = resolveMappedFormsForItemName(itemName, input.targetUser);
  debugAlert(`chooser resolved ${formActors.length} forms for "${itemName}"`);
  const choices = buildWildshapeChoices(input.actor, formActors);

  if (choices.length === 0) {
    debugAlert(`chooser aborted: no choices for "${itemName}"`);
    ui.notifications?.warn("No mapped wildshape forms are currently available.");
    return false;
  }

  const dialogCtor = (globalThis as { Dialog?: typeof Dialog }).Dialog;
  if (typeof dialogCtor !== "function") {
    ui.notifications?.error("Wildshape chooser could not open because Dialog is unavailable.");
    debugAlert("chooser failed: Dialog API unavailable");
    return false;
  }

  debugAlert(`chooser opening with ${choices.length} options for "${itemName}"`);
  const dialog = new dialogCtor({
    title: "Wildshape",
    content: `
      <div class="wildshape-chooser-content">
        <p>Select a wildshape form.</p>
      </div>
    `,
    buttons: buildButtons(choices, (choice) => {
      if (choice.kind === "original") {
        void revertWildshapeForm({
          actor: input.actor,
          adapter: input.adapter,
        });
        return;
      }

      void applyWildshapeForm({
        actor: input.actor,
        formActor: choice.formActor,
        adapter: input.adapter,
        itemName,
        targetUser: input.targetUser,
      });
    }),
    default: "choice_0",
  }, {
    classes: ["shape-so-nice", "wildshape-chooser"],
  });
  dialog.render(true);
  return true;
}
