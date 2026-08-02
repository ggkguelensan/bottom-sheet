# Lovecraft demo: product design and conformance scenarios

## 1. Boundary

The library is subject-independent. Names such as `cinema`, `theatre`,
`stadium`, `noSeating`, `p2p`, `Lovecraft`, `location` or `ticket` must not
appear in `packages/core`, `packages/dom`, `packages/motion`,
`packages/effector` or `packages/react`.

Those packages expose only presentation mechanics:

- target-driven open/closed lifecycle;
- content, pixel and ratio snap points;
- pointer drag, velocity and snap selection;
- modal and non-modal DOM behavior;
- `sheet` and centered `dialog` presentation in the React adapter;
- measured transitions between keyed pieces of content;
- focus, inert background, scroll lock, viewport and safe-area handling;
- an imperative API ref and an optional Effector binding.

Every subject, route, screen union, image and piece of product copy belongs to
an application or an example.

Reference application монтирует ровно один `ShellSheet.Root` в app shell layout.
Route/location clicks изменяют Effector target/content этого экземпляра, а не
создают новую modal component на каждый экран.

## 2. Package architecture

```text
application state (Effector is optional)
             ⇅ sync / requested events
@shell-sheet/core
             ⇅ targets, requests and facts
@shell-sheet/dom ── native or motion/mini driver
             ⇅ refs
@shell-sheet/react
```

`core` is TypeScript without React, DOM, Motion or application concepts. The
React package renders the DOM contract, binds refs to the existing controller,
and exposes the controller through `ShellSheetApi`. It does not own durable
product state.

## 3. Lovecraft atlas is an example, not a preset

`examples/lovecraft-start` is a subject-specific TanStack Start test bench
built with React, Effector, Router and Query. Its location and screen types are
deliberately local to the example. The same component could be driven by
tickets, commerce, navigation or any other content without changing a library
package.

The map offers five independent entrances. They are not steps of one product
flow:

| Entrance | Capability under test |
| --- | --- |
| Arkham archive | A content-sized non-draggable modal journey without Handle; Exit, Back and Forward change keyed content and geometry |
| Innsmouth pier | A partial sheet that can be pulled to the expanded snap point; expanded content scrolls internally |
| Dunwich cellar | Content taller than the viewport; the surface stays bounded and its viewport scrolls |
| Antarctic gate | Media is flush with the surface top while the handle overlays it |
| Dreamlands gate | The compact and expanded snap points render different, space-appropriate content |

A regular location click always opens a simple non-modal information sheet.
Clicking the location entrance opens the specialized scenario.

## 4. Presentation and modality

Presentation and modality are related but separate concepts:

- `presentation: "sheet"` anchors the surface to the bottom edge;
- `presentation: "dialog"` centers and constrains the same surface;
- `modality: "modal"` dims/inerts the application, locks page scrolling and
  traps focus;
- `modality: "non-modal"` keeps the application available outside the surface.

The demo maps dialog to modal and sheet to non-modal. This is a demo policy,
not a rule in core. On desktop the segmented control changes presentation while
the same Popup remains open. On small screens the application/Effector
projection chooses `presentation: "sheet"`; CSS does not visually contradict a
`dialog` target. The first post-hydration media correction is instant, later
responsive changes use the normal measured morph.

## 5. Content transition contract

A content change is a state transition, not a DOM replacement:

1. Keep the currently presented screen mounted.
2. Render the requested screen in a second layer.
3. Measure outgoing and incoming geometry.
4. Animate the isolated content wrapper from the old measured height to the new
   height.
5. Crossfade the layers with an 8–12 px directional offset and at most 2 px of
   blur.
6. Remove the outgoing layer only after the transition settles.
7. If a new request arrives, cancel the previous completion and transition to
   the latest requested key.

Motion follows the installed Emil Kowalski design rules:

- entrance and drawer movement use a strong ease-out curve;
- changes already on screen use a strong ease-in-out curve;
- no interaction uses ease-in;
- active buttons scale to `0.97` for 120 ms;
- hover motion is gated by fine-pointer capability;
- reduced motion keeps a short opacity transition but removes spatial blur and
  movement;
- animated height is an intentional, contained exception because measured
  adaptive geometry is the behavior under test. The surface uses layout/paint
  containment so it does not reflow the scene.

For content taller than the selected snap point, only the panel viewport
scrolls. The document remains fixed when modality requests scroll lock.

## 6. Effector ownership

The example model owns:

- a discriminated-union state machine with exhaustive `kind` variants and a
  separately typed `uiContext` for every variant;
- preferred/current presentation;
- navigation direction;
- one authoritative `ShellSheetTarget` with open/snap/presentation/modality,
  region keys and transition intent through the optional Effector binding.

The Arkham journey also contains a deterministic async branch:

```text
B.1/B.2 → C.loading → C.1.success
                     ↘ C.1.fail → Retry
          ↘ Back → exact previous B.1/B.2 state
```

Every load has a request token and an AbortController. Leaving `C.loading`
requests abort, while matching the current `kind` and token prevents a late
success or failure from navigating away from B. This is application logic and
must stay inside the example; Shell Sheet only visualizes each resulting
target.

Core owns semantic visual lifecycle; DOM owns per-frame animation and gesture
state. One release request travels from DOM through the controller to Effector
and back through `controller.sync()`. Pointer moves do not travel through
Effector. The API ref is a command/event port, not a second store.

## 7. CSS token contract

The React adapter is unstyled and follows the Base UI-shaped public hooks in
[`../styling.md`](../styling.md). The example assigns its own CSS Module classes
and PostCSS output to parts; those class names belong to the demo and are not
library API.

The example supplies all visual decisions through theme variables such as
`--surface`, `--ink`, `--accent`, `--line`, `--panel-duration` and easing
tokens. Mechanic selectors use public `data-open`, `data-starting-style`,
`data-ending-style`, `data-swiping` and `--drawer-*` values. Shell-specific
region transitions use only the documented `data-region/data-layer` and
`--shell-sheet-*` extensions. Consumers can replace the entire stylesheet
without changing the controller.

## 8. Prototype variants

The example includes three intentionally different scene compositions behind
the standard prototype picker:

- **Field notes** — editorial archive and asymmetric evidence grid;
- **Cartographic** — dense coordinate map with spatially positioned nodes;
- **Nocturne** — image-first horizontal exploration rail.

The picker is harness chrome, not part of the product component. Number keys,
arrow keys, URL `?v=`, and replay follow the prototype-skill contract.

## 9. Acceptance criteria

- Domain strings are absent from all library packages.
- Clicking any location opens its information sheet.
- Every entrance opens the scenario listed in the matrix.
- Arkham opens at its content height, renders no Handle and cannot be resized by
  dragging.
- Journey navigation updates copy, controls and measured surface height without
  an instantaneous replacement.
- The async journey demonstrates loading, success, failure, retry, Back during
  loading, physical abort and rejection of stale completion events.
- Returning from loading restores the exact previous compact/expanded snap
  state rather than a generic B default.
- Long content scrolls inside the bounded surface.
- Innsmouth and Dreamlands react to the snap point requested by handle drag.
- The Antarctic image touches the visual top of the surface.
- Desktop presentation can morph the same Popup between bottom sheet and
  centered dialog while open, without remount or text scale.
- Modal semantics, non-modal pointer access, Escape, focus restoration,
  reduced-motion and gesture behavior stay covered by automated tests.
