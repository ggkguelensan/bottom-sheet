import {
  createEffect,
  createEvent,
  createStore,
  sample,
} from "effector";
import type {
  ShellSheetCloseReason,
  ShellSheetControlledState,
  ShellSheetController,
} from "@shell-sheet/core";
import type {
  ShellSheetControllerEventPayload,
  ShellSheetEffectorBinding,
  ShellSheetEffectorOptions,
} from "./types.js";

export function createShellSheetBinding(
  options: ShellSheetEffectorOptions,
): ShellSheetEffectorBinding {
  const validateState = options.validateState ?? (() => true);

  if (!validateState(options.initialState)) {
    throw new Error("Invalid initial ShellSheet state.");
  }

  const openRequested = createEvent<void>("shellSheet.openRequested");
  const closeRequested = createEvent<ShellSheetCloseReason | void>(
    "shellSheet.closeRequested",
  );
  const snapRequested = createEvent<string>("shellSheet.snapRequested");
  const stateReplaced = createEvent<ShellSheetControlledState>(
    "shellSheet.stateReplaced",
  );
  const controllerAttached = createEvent<ShellSheetController>(
    "shellSheet.controllerAttached",
  );
  const controllerDetached = createEvent<void>(
    "shellSheet.controllerDetached",
  );
  const controllerEventReceived =
    createEvent<ShellSheetControllerEventPayload>(
      "shellSheet.controllerEventReceived",
    );

  const $controller = createStore<ShellSheetController | null>(null, {
    name: "shellSheet.$controller",
    serialize: "ignore",
  })
    .on(controllerAttached, (_, controller) => controller)
    .reset(controllerDetached);

  const $state = createStore<ShellSheetControlledState>(
    options.initialState,
    { name: "shellSheet.$state" },
  )
    .on(openRequested, (state) =>
      state.open ? state : { ...state, open: true },
    )
    .on(closeRequested, (state) =>
      state.open ? { ...state, open: false } : state,
    )
    .on(snapRequested, (state, snapPoint) => {
      const next = { ...state, snapPoint };
      if (!validateState(next)) return state;
      return state.snapPoint === snapPoint ? state : next;
    })
    .on(stateReplaced, (state, next) => {
      if (!validateState(next)) return state;
      return state.open === next.open && state.snapPoint === next.snapPoint
        ? state
        : next;
    })
    .on(controllerEventReceived, (state, { event }) => {
      switch (event.type) {
        case "open-requested":
          return state.open ? state : { ...state, open: true };
        case "close-requested":
          return state.open ? { ...state, open: false } : state;
        case "snap-requested": {
          const next = { ...state, snapPoint: event.snapPoint };
          return validateState(next) && state.snapPoint !== event.snapPoint
            ? next
            : state;
        }
        default:
          return state;
      }
    });

  const $open = $state.map((state) => state.open);
  const $snapPoint = $state.map((state) => state.snapPoint);
  const $snapshot = createStore<
    ShellSheetControllerEventPayload["snapshot"] | null
  >(null, {
    name: "shellSheet.$snapshot",
    serialize: "ignore",
  })
    .on(controllerEventReceived, (_, payload) => payload.snapshot)
    .reset(controllerDetached);
  const $lastCloseReason = createStore<ShellSheetCloseReason | null>(null, {
    name: "shellSheet.$lastCloseReason",
  })
    .on(closeRequested, (_, reason) => reason || "api")
    .on(controllerEventReceived, (reason, { event }) =>
      event.type === "close-requested" ? event.reason : reason,
    );

  const syncControllerFx = createEffect<
    {
      controller: ShellSheetController;
      state: ShellSheetControlledState;
    },
    void,
    Error
  >({
    name: "shellSheet.syncControllerFx",
    handler: ({ controller, state }) => controller.sync(state),
  });

  sample({
    clock: $state,
    source: $controller,
    filter: (controller) => controller !== null,
    fn: (controller, state) => ({ controller: controller!, state }),
    target: syncControllerFx,
  });

  sample({
    clock: controllerAttached,
    source: $state,
    fn: (state, controller) => ({ controller, state }),
    target: syncControllerFx,
  });

  return {
    $state,
    $open,
    $snapPoint,
    $controller,
    $snapshot,
    $lastCloseReason,
    openRequested,
    closeRequested,
    snapRequested,
    stateReplaced,
    controllerAttached,
    controllerDetached,
    controllerEventReceived,
    syncControllerFx,
    attach(controller) {
      const unsubscribe = controller.subscribe((snapshot, event) => {
        controllerEventReceived({ controller, snapshot, event });
      });

      controllerAttached(controller);

      return () => {
        unsubscribe();
        controllerDetached();
      };
    },
  };
}
