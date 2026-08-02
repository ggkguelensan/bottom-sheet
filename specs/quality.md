# Quality and release gates

## 1. Обязательные проверки

Перед merge/release MUST проходить:

```sh
npm run typecheck
npm run typecheck:demo
npm test
npm run build
npm run build:lovecraft
npm run test:ssr
npm run test:browser
npm run check:packages
```

`git diff --check` не должен находить whitespace errors.

## 2. Test pyramid

### Pure unit

- core state transitions;
- snap resolution/selection;
- non-finite validation, clamped duplicate heights, projected/sequential
  release и progressive rubber band;
- request/target/fact identity;
- stale transition и async operation guards.

### Adapter contract

- native и Motion animation drivers;
- DOM binding с fake environment;
- measurement read/write transaction, token-safe registry и modality ownership;
- Effector global/forked scope;
- React compound parts и SSR.
- Base UI-shaped default tags, function styling props, state, data attributes
  и CSS variables.

### Browser interaction

- touch drag на реальном viewport;
- native Body scroll isolation from registered Handle/DragArea gestures;
- VisualViewport/software keyboard;
- focus trap/restore и inert;
- pointer cancel/lost capture;
- rapid open/close/retarget.
- same-Popup sheet↔dialog interruption;
- real iOS/WebKit and Android/Chromium smoke before release candidate.

### Visual conformance

- открытие и закрытие;
- A→B.1 geometry + independent blur regions;
- compact↔expanded;
- sheet↔dialog;
- reduced motion;
- mobile safe areas и desktop constraints.

### Normative test seams

Tests пишутся на заранее зафиксированных interfaces:

1. exported pure core algorithms;
2. public core controller request/target/fact protocol;
3. DOM binding + registered elements через injected environment;
4. shared animation-driver contract;
5. Effector binding units/scopes;
6. React compound DOM/accessibility contract;
7. browser-visible user interaction.

Private helper files не получают собственные coupled tests, если behavior уже
наблюдаем через seam. Implementation ведётся vertical red→green slices: один
failing behavioral test, минимальный проходящий implementation, следующий
slice. Массовый горизонтальный набор tests до первого работающего slice
запрещён.

### Architecture decision gates

Strong-решения из
[`README.md`](./README.md#реестр-целевых-архитектурных-решений) получают
отдельные regression assertions:

| Decision | Обязательное positive proof | Обязательное negative proof |
| --- | --- | --- |
| `ARCH-CORE-01` | atomic target, FIFO events, tokenized terminal lifecycle и pure geometry проходят через public Core API | compile/source boundary не допускает DOM libs/globals и public `updateDrag/setHeight/measure/animate` |
| `ARCH-DOM-01` | fake environment фиксирует `measure → mutate → next-frame animate → settle`, stale-safe registry и interruption | instrumentation не обнаруживает layout read после первого mechanic write одной transaction; adapters не запускают второй lifecycle clock |
| `ARCH-GESTURE-01` | browser test получает ровно один semantic release request с корректной projected destination | серия pointer moves не меняет Core snapshot и не вызывает Core/Effector/React subscriber на frame |
| `ARCH-REACT-01` | compound refs/regions регистрируются token-safe в StrictMode и один Popup переживает transitions | source/behavior checks не находят React-owned measurement, rAF/timeout или animation-driver invocation |
| `ARCH-EFFECTOR-01` | application `$target` атомарно sync-ится в global/forked scope, requests/facts сохраняют order | public binding не экспортирует/создаёт generic `$state`, `$open`, `$snapPoint` и не строит feedback loop из facts |

Negative source-boundary checks дополняют behavioral tests, но не заменяют их:
проверка имени файла или private function сама по себе не доказывает
архитектурный seam.

## 3. Determinism

Unit/contract tests используют injected `ShellSheetDomEnvironment`, fake
measurements/viewport signals и controlled animation-driver completions. Они
не зависят от wall-clock duration и не исправляют гонки увеличением timeout.
Каждый interrupted transition проверяет terminal result и отсутствие позднего
settle.

## 4. Accessibility gate

- Automated checks дополняются keyboard walkthrough.
- В accessibility tree существует один active dialog title/description.
- Outgoing crossfade layers inert/hidden.
- Focus не уходит в background в modal mode.
- Escape и Close доступны, если application не отклонило request.
- Reduced motion не удаляет смысловые state indications.

## 5. Performance и bundle

- Pointer move не вызывает React render или Effector event на каждом frame.
- Pointer move не публикует public core fact на каждом frame.
- Per-frame gesture mechanics обновляют только Popup/Backdrop public mechanics
  styles and variables; React render и Effector event на каждом frame
  запрещены.
- Layout animation изолирована Popup containment.
- ResizeObserver work коалесцируется.
- Measurement transaction выполняет DOM reads до writes; presentation morph
  не масштабирует text subtree.
- `@shell-sheet/core` не имеет runtime dependencies.
- Motion driver target budget: 3 kB minified+gzip.
- React adapter не импортирует `motion/react`.
- React adapter не импортирует bundled/default CSS.

Bundle budgets MUST измеряться CI-инструментом на tree-shaken consumer fixture.
README не публикует неподтверждённые размеры.

## 6. Package, TypeScript and SSR gates

- `tsc -b` проходит с strict options из `platform.md`.
- Source scan не находит handwritten `.js/.jsx/cjs/mjs` вне generated output
  и third-party directories.
- Каждый `npm pack` tarball проходит `publint` и
  `@arethetypeswrong/cli`.
- Node ESM и Vite TypeScript consumer fixtures импортируют только public
  exports.
- Import всех packages в Node SSR environment не читает browser globals.
- TanStack Start server render + hydration не имеет mismatch и не показывает
  unmeasured open Portal.
- React 18.3 является primary fixture, React 19 — compatibility fixture.
- Effector scope и QueryClient изолированы между SSR requests.

## 7. Compatibility matrix

Перед v1 фиксируются и тестируются поддерживаемые версии:

- TypeScript;
- React/ReactDOM peer range;
- Effector peer range;
- Motion runtime range;
- browser baseline для Pointer Events, ResizeObserver, VisualViewport, inert и
  WAAPI либо documented fallback.

## 8. Release definition

Package может считаться v1-ready только когда:

1. В `specs/README.md` соответствующий module больше не отмечен Partial или
   Prototype.
2. Module contract tests существуют и проходят.
3. Public exports совпадают со spec.
4. Lovecraft demo показывает связанные visual/business сценарии.
5. Нет domain strings в publishable packages.
6. Package tarball и declarations проверены consumer fixture.
7. Base UI Drawer styling conformance fixture проходит без зависимости от
   internal `.shell-sheet-*` classes.
