import {
  createEffect,
  createEvent,
  createStore,
  sample,
} from "effector";
import type {
  BottomSheetCloseReason,
  BottomSheetControlledState,
  BottomSheetController,
} from "@adaptive-bottom-sheet/core";
import type {
  BottomSheetControllerEventPayload,
  BottomSheetEffectorBinding,
  BottomSheetEffectorOptions,
} from "./types.js";

export function createBottomSheetBinding(
  options: BottomSheetEffectorOptions,
): BottomSheetEffectorBinding {
  const validateState = options.validateState ?? (() => true);

  if (!validateState(options.initialState)) {
    throw new Error("Invalid initial BottomSheet state.");
  }

  const openRequested = createEvent<void>("bottomSheet.openRequested");
  const closeRequested = createEvent<BottomSheetCloseReason | void>(
    "bottomSheet.closeRequested",
  );
  const snapRequested = createEvent<string>("bottomSheet.snapRequested");
  const stateReplaced = createEvent<BottomSheetControlledState>(
    "bottomSheet.stateReplaced",
  );
  const controllerAttached = createEvent<BottomSheetController>(
    "bottomSheet.controllerAttached",
  );
  const controllerDetached = createEvent<void>(
    "bottomSheet.controllerDetached",
  );
  const controllerEventReceived =
    createEvent<BottomSheetControllerEventPayload>(
      "bottomSheet.controllerEventReceived",
    );

  const $controller = createStore<BottomSheetController | null>(null, {
    name: "bottomSheet.$controller",
    serialize: "ignore",
  })
    .on(controllerAttached, (_, controller) => controller)
    .reset(controllerDetached);

  const $state = createStore<BottomSheetControlledState>(
    options.initialState,
    { name: "bottomSheet.$state" },
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
    BottomSheetControllerEventPayload["snapshot"] | null
  >(null, {
    name: "bottomSheet.$snapshot",
    serialize: "ignore",
  })
    .on(controllerEventReceived, (_, payload) => payload.snapshot)
    .reset(controllerDetached);
  const $lastCloseReason = createStore<BottomSheetCloseReason | null>(null, {
    name: "bottomSheet.$lastCloseReason",
  })
    .on(closeRequested, (_, reason) => reason || "api")
    .on(controllerEventReceived, (reason, { event }) =>
      event.type === "close-requested" ? event.reason : reason,
    );

  const syncControllerFx = createEffect<
    {
      controller: BottomSheetController;
      state: BottomSheetControlledState;
    },
    void,
    Error
  >({
    name: "bottomSheet.syncControllerFx",
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
