# Quality and release gates

## 1. Обязательные проверки

Перед merge/release MUST проходить:

```sh
npm run typecheck
npm run typecheck:demo
npm test
npm run build
npm run build:lovecraft
```

`git diff --check` не должен находить whitespace errors.

## 2. Test pyramid

### Pure unit

- core state transitions;
- snap resolution/selection;
- request/target/fact identity;
- stale transition и async operation guards.

### Adapter contract

- native и Motion animation drivers;
- DOM binding с fake environment;
- Effector global/forked scope;
- React compound parts и SSR.
- Base UI-shaped default tags, function styling props, state, data attributes
  и CSS variables.

### Browser interaction

- touch drag на реальном viewport;
- nested Body scroll arbitration;
- VisualViewport/software keyboard;
- focus trap/restore и inert;
- pointer cancel/lost capture;
- rapid open/close/retarget.

### Visual conformance

- открытие и закрытие;
- A→B.1 geometry + independent blur regions;
- compact↔expanded;
- sheet↔dialog;
- reduced motion;
- mobile safe areas и desktop constraints.

## 3. Determinism

Unit/contract tests используют injected clock, measurements and viewport. Они
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
- Per-frame gesture mechanics обновляют только Popup/Backdrop public mechanics
  styles and variables; React render и Effector event на каждом frame
  запрещены.
- Layout animation изолирована Popup containment.
- ResizeObserver work коалесцируется.
- `@shell-sheet/core` не имеет runtime dependencies.
- Motion driver target budget: 3 kB minified+gzip.
- React adapter не импортирует `motion/react`.
- React adapter не импортирует bundled/default CSS.

Bundle budgets MUST измеряться CI-инструментом на tree-shaken consumer fixture.
README не публикует неподтверждённые размеры.

## 6. Compatibility matrix

Перед v1 фиксируются и тестируются поддерживаемые версии:

- TypeScript;
- React/ReactDOM peer range;
- Effector peer range;
- Motion runtime range;
- browser baseline для Pointer Events, ResizeObserver, VisualViewport, inert и
  WAAPI либо documented fallback.

## 7. Release definition

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
