# Shell Sheet

Framework-agnostic TypeScript engine for an adaptive surface that can animate
open/close, keyed Header/Body/Footer changes, snap points and a same-Popup
`sheet ↔ dialog` presentation morph.

## Specification source of truth

[`specs/README.md`](./specs/README.md) is the single normative source of truth.
Implementation follows:

```text
spec → contract test → implementation → demo evidence → verification
```

Start here:

- [Architecture and target state](./specs/architecture.md)
- [Core contract](./specs/modules/core.md)
- [DOM contract](./specs/modules/dom.md)
- [Platform, TypeScript, build and SSR](./specs/platform.md)
- [Repository structure](./specs/repository-structure.md)
- [Base UI-shaped styling contract](./specs/styling.md)
- [Lovecraft conformance application](./specs/examples/lovecraft.md)
- [Quality and release gates](./specs/quality.md)

The current packages and demo are a partial prototype. Their existing API is
not the v1 contract; the exact implementation gaps are tracked in
[`specs/README.md`](./specs/README.md#текущее-соответствие-целевой-версии).

## Target packages

| Package | Responsibility | Runtime dependencies |
| --- | --- | --- |
| `@shell-sheet/core` | Atomic target/request/fact lifecycle and pure snap/release algorithms | none |
| `@shell-sheet/dom` | Measurements, transitions, gestures, viewport, modality and accessibility | core |
| `@shell-sheet/motion` | `motion/mini` animation-driver adapter | dom, motion |
| `@shell-sheet/effector` | Direct application-owned target binding | core; Effector peer |
| `@shell-sheet/react` | Compound composition, Portal and DOM registrations | core, dom; React peers |

Business `kind`, `uiContext`, routes, queries, copy, images and demo scenarios
never enter publishable packages.

## Current development commands

```sh
npm install
npm run typecheck
npm run typecheck:demo
npm test
npm run build
npm run build:lovecraft
npm run dev:vanilla
```

The target reference application will migrate from the current Vite prototype
to TanStack Start as specified in [`specs/platform.md`](./specs/platform.md).
