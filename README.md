# Adaptive Bottom Sheet

A framework-agnostic TypeScript bottom-sheet engine. React is intentionally not
part of the first implementation.

The product motivation and widget scenario matrix are documented in
[`docs/product-design.md`](./docs/product-design.md).

## Packages

| Package | Responsibility | Runtime dependencies |
| --- | --- | --- |
| `@adaptive-bottom-sheet/core` | Controller, controlled/uncontrolled state, snap algorithms | none |
| `@adaptive-bottom-sheet/dom` | DOM measurement, pointer gestures, viewport, focus, inert, scroll lock | core |
| `@adaptive-bottom-sheet/motion` | Animation driver using `motion/mini` | dom, motion |
| `@adaptive-bottom-sheet/effector` | Optional direct controlled binding | core; Effector peer |

There is no `motion/react` import anywhere in the repository. The Motion driver
imports only `animate` from `motion/mini`. A future React package should remain a
thin DOM/refs adapter over the same controller.

## Architecture

```text
Effector store (optional source of truth)
        ⇅ sync / requested events
framework-agnostic controller
        ⇅ snapshots and interaction events
DOM binding ─── animation driver (Motion mini or native WAAPI)
```

Stable semantic state (`open`, `snapPoint`) may be controlled by Effector.
Ephemeral pointer state (`dragging`, `dragOffset`, velocity samples) stays in the
controller/DOM layer so every pointer frame does not have to pass through an
application store.

## Vanilla DOM + Motion

```ts
import { createBottomSheetController } from "@adaptive-bottom-sheet/core";
import { bindBottomSheetToDom } from "@adaptive-bottom-sheet/dom";
import { createMotionAnimationDriver } from "@adaptive-bottom-sheet/motion";

const controller = createBottomSheetController({
  snapPoints: [
    { id: "collapsed", size: { type: "ratio", value: 0.6 } },
    { id: "expanded", size: { type: "ratio", value: 0.996 } },
  ],
});

const binding = bindBottomSheetToDom(
  controller,
  {
    root: document.querySelector("#sheet-root")!,
    main: document.querySelector("#sheet-main")!,
    handle: document.querySelector("#sheet-handle")!,
    content: document.querySelector("#sheet-content")!,
    backdrop: document.querySelector("#sheet-backdrop")!,
    inertTarget: document.querySelector("#app")!,
  },
  { animation: createMotionAnimationDriver() },
);

controller.open();
controller.snapTo("expanded");

// Teardown
binding.destroy();
controller.destroy();
```

Use `createNativeAnimationDriver()` from the DOM package instead if Motion is
not wanted.

For the content-sized, non-draggable widget variant use one content snap point:

```ts
const controller = createBottomSheetController({
  snapPoints: [
    { id: "content", size: { type: "content", maxRatio: 0.996 } },
  ],
});

bindBottomSheetToDom(controller, elements, {
  modality: "non-modal", // use "modal" to lock and inert the background
  draggable: false,
  animation: createMotionAnimationDriver(),
});
```

## Direct Effector control

Create the controller with `controlled: true`. Its imperative commands then
publish intent and do not mutate stable state. The Effector model processes that
intent and sends authoritative state back through `controller.sync()`.

```ts
import { createBottomSheetController } from "@adaptive-bottom-sheet/core";
import { createBottomSheetBinding } from "@adaptive-bottom-sheet/effector";

const controller = createBottomSheetController({
  controlled: true,
  snapPoints: [
    { id: "collapsed", size: { type: "ratio", value: 0.6 } },
    { id: "expanded", size: { type: "ratio", value: 0.996 } },
  ],
});

const sheet = createBottomSheetBinding({
  initialState: { open: false, snapPoint: "collapsed" },
  validateState: ({ snapPoint }) =>
    snapPoint === "collapsed" || snapPoint === "expanded",
});

const detach = sheet.attach(controller);

sheet.openRequested();
sheet.snapRequested("expanded");

controller.close("gesture"); // request → Effector → sync({ open: false })
```

`attach()` uses the global Effector scope. For forked scopes, use the exposed
`controllerAttached`, `controllerDetached`, and `controllerEventReceived`
events with `scopeBind`.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev:vanilla
```

The future React adapter must not duplicate the snap algorithm, gesture engine,
viewport handling, or Effector integration. It should render the compound DOM
structure, bind element refs, and expose the existing controller as its API ref.
