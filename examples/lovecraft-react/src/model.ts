import { combine, createEvent, createStore, sample } from "effector";
import { createShellSheetBinding } from "@shell-sheet/effector";
import type { ShellSheetPresentation } from "@shell-sheet/react";
import type { LocationId } from "./locations";
import { journeyLocationIds, locationById } from "./locations";

export type DemoScreen =
  | { kind: "empty" }
  | { kind: "location-info"; locationId: LocationId }
  | { kind: "journey"; step: number }
  | { kind: "long-scroll"; locationId: "dunwich" }
  | { kind: "image-flush"; locationId: "antarctica" }
  | { kind: "progressive-reveal"; locationId: "innsmouth" }
  | { kind: "content-swap"; locationId: "dreamlands" };

export function createLovecraftDemoModel() {
  const sheet = createShellSheetBinding({
    initialState: { open: false, snapPoint: "content" },
    validateState: ({ snapPoint }) =>
      snapPoint === "peek" ||
      snapPoint === "content" ||
      snapPoint === "expanded",
  });

  const locationSelected = createEvent<LocationId>("demo.locationSelected");
  const entranceOpened = createEvent<LocationId>("demo.entranceOpened");
  const nextRequested = createEvent<void>("demo.nextRequested");
  const previousRequested = createEvent<void>("demo.previousRequested");
  const exitRequested = createEvent<void>("demo.exitRequested");
  const presentationChanged = createEvent<ShellSheetPresentation>(
    "demo.presentationChanged",
  );
  const screenChanged = createEvent<DemoScreen>("demo.screenChanged");
  const journeyStepChanged = createEvent<number>("demo.journeyStepChanged");
  const directionChanged = createEvent<"forward" | "backward" | "neutral">(
    "demo.directionChanged",
  );

  const $screen = createStore<DemoScreen>({ kind: "empty" }, {
    name: "demo.$screen",
  })
    .on(screenChanged, (_, screen) => screen)
    .on(journeyStepChanged, (_, step) => ({ kind: "journey", step }));
  const $preferredPresentation = createStore<ShellSheetPresentation>(
    "dialog",
    { name: "demo.$preferredPresentation" },
  ).on(presentationChanged, (_, presentation) => presentation);
  const $presentation = createStore<ShellSheetPresentation>("sheet", {
    name: "demo.$presentation",
  }).on(presentationChanged, (_, presentation) => presentation);
  const $direction = createStore<"forward" | "backward" | "neutral">(
    "neutral",
    { name: "demo.$direction" },
  ).on(directionChanged, (_, direction) => direction);

  sample({
    clock: locationSelected,
    fn: (locationId): DemoScreen => ({ kind: "location-info", locationId }),
    target: screenChanged,
  });
  sample({
    clock: locationSelected,
    fn: () => ({ open: true, snapPoint: "content" }),
    target: sheet.stateReplaced,
  });
  sample({
    clock: locationSelected,
    fn: () => "sheet" as const,
    target: $presentation,
  });
  sample({
    clock: locationSelected,
    fn: () => "neutral" as const,
    target: directionChanged,
  });

  sample({
    clock: entranceOpened,
    fn: (locationId): DemoScreen => {
      const behavior = locationById[locationId].behavior;
      switch (behavior) {
        case "journey":
          return { kind: "journey", step: 0 };
        case "progressive-reveal":
          return { kind: "progressive-reveal", locationId: "innsmouth" };
        case "long-scroll":
          return { kind: "long-scroll", locationId: "dunwich" };
        case "image-flush":
          return { kind: "image-flush", locationId: "antarctica" };
        case "content-swap":
          return { kind: "content-swap", locationId: "dreamlands" };
      }
    },
    target: screenChanged,
  });
  sample({
    clock: entranceOpened,
    fn: (locationId) => ({
      open: true,
      snapPoint:
        locationId === "innsmouth" || locationId === "dreamlands"
          ? "peek"
          : locationId === "dunwich"
            ? "expanded"
            : "content",
    }),
    target: sheet.stateReplaced,
  });
  sample({
    clock: entranceOpened,
    source: $preferredPresentation,
    fn: (preferred, locationId) =>
      locationId === "arkham" || locationId === "dunwich"
        ? preferred
        : ("sheet" as const),
    target: $presentation,
  });
  sample({
    clock: entranceOpened,
    fn: () => "forward" as const,
    target: directionChanged,
  });

  sample({
    clock: nextRequested,
    source: $screen,
    filter: (screen): screen is Extract<DemoScreen, { kind: "journey" }> =>
      screen.kind === "journey" &&
      screen.step < journeyLocationIds.length - 1,
    fn: (screen) =>
      (screen as Extract<DemoScreen, { kind: "journey" }>).step + 1,
    target: journeyStepChanged,
  });
  sample({
    clock: previousRequested,
    source: $screen,
    filter: (screen): screen is Extract<DemoScreen, { kind: "journey" }> =>
      screen.kind === "journey" && screen.step > 0,
    fn: (screen) =>
      (screen as Extract<DemoScreen, { kind: "journey" }>).step - 1,
    target: journeyStepChanged,
  });
  sample({
    clock: journeyStepChanged,
    fn: (step) => (step === journeyLocationIds.length - 1 ? "expanded" : "content"),
    target: sheet.snapRequested,
  });
  sample({
    clock: nextRequested,
    fn: () => "forward" as const,
    target: directionChanged,
  });
  sample({
    clock: previousRequested,
    fn: () => "backward" as const,
    target: directionChanged,
  });
  sample({
    clock: exitRequested,
    fn: () => "exit",
    target: sheet.closeRequested,
  });

  const $screenKey = combine(
    $screen,
    sheet.$snapPoint,
    (screen, snapPoint) => {
      switch (screen.kind) {
        case "empty":
          return "empty";
        case "location-info":
          return `info:${screen.locationId}`;
        case "journey":
          return `journey:${screen.step}`;
        case "progressive-reveal":
        case "content-swap":
          return `${screen.kind}:${screen.locationId}:${snapPoint}`;
        case "long-scroll":
        case "image-flush":
          return `${screen.kind}:${screen.locationId}`;
      }
    },
  );

  return {
    sheet,
    $screen,
    $screenKey,
    $presentation,
    $preferredPresentation,
    $direction,
    locationSelected,
    entranceOpened,
    nextRequested,
    previousRequested,
    exitRequested,
    presentationChanged,
  };
}

export type LovecraftDemoModel = ReturnType<typeof createLovecraftDemoModel>;
