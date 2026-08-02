# Shell Sheet

A framework-agnostic TypeScript shell-sheet engine with optional DOM, Motion,
Effector and React adapters.

## Specification source of truth

[`specs/README.md`](./specs/README.md) is the single normative source of truth
for repository structure, architecture, module contracts and release gates.
Changes follow `spec → tests → implementation → demo evidence`.

- [Architecture and transition protocol](./specs/architecture.md)
- [Repository structure and dependency boundaries](./specs/repository-structure.md)
- [Base UI-shaped styling contract](./specs/styling.md)
- [Module specifications](./specs/modules)
- [Lovecraft conformance demo](./specs/examples/lovecraft.md)
- [Quality and release gates](./specs/quality.md)

Files in `docs/` are non-normative guides or compatibility links.

## Packages

| Package | Responsibility | Runtime dependencies |
| --- | --- | --- |
| `@shell-sheet/core` | Controller, controlled/uncontrolled state, snap algorithms | none |
| `@shell-sheet/dom` | DOM measurement, pointer gestures, viewport, focus, inert, scroll lock | core |
| `@shell-sheet/motion` | Animation driver using `motion/mini` | dom, motion |
| `@shell-sheet/effector` | Optional direct controlled binding | core; Effector peer |
| `@shell-sheet/react` | Thin portal/refs adapter and measured keyed-content transitions | core, dom; React peers |

There is no `motion/react` import anywhere in the repository. The Motion driver
imports only `animate` from `motion/mini`. The React adapter remains a thin
DOM/refs layer over the same controller.

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
import { createShellSheetController } from "@shell-sheet/core";
import { bindShellSheetToDom } from "@shell-sheet/dom";
import { createMotionAnimationDriver } from "@shell-sheet/motion";

const controller = createShellSheetController({
  snapPoints: [
    { id: "collapsed", size: { type: "ratio", value: 0.6 } },
    { id: "expanded", size: { type: "ratio", value: 0.996 } },
  ],
});

const binding = bindShellSheetToDom(
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
const controller = createShellSheetController({
  snapPoints: [
    { id: "content", size: { type: "content", maxRatio: 0.996 } },
  ],
});

bindShellSheetToDom(controller, elements, {
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
import { createShellSheetController } from "@shell-sheet/core";
import { createShellSheetBinding } from "@shell-sheet/effector";

const controller = createShellSheetController({
  controlled: true,
  snapPoints: [
    { id: "collapsed", size: { type: "ratio", value: 0.6 } },
    { id: "expanded", size: { type: "ratio", value: 0.996 } },
  ],
});

const sheet = createShellSheetBinding({
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

## React + Effector demo

The subject-independent library is exercised by a subject-specific Lovecraft
atlas in [`examples/lovecraft-react`](./examples/lovecraft-react). It covers
measured content changes, internal scrolling, compact/expanded content,
edge-to-edge media, drag snapping and live `sheet ↔ dialog` presentation.

```sh
npm run dev:lovecraft
```

The example owns all location/screen types and CSS theme tokens. No demo domain
is exported by a library package.

## Development

```sh
npm install
npm run typecheck
npm run typecheck:demo
npm test
npm run build
npm run build:lovecraft
npm run dev:vanilla
```
