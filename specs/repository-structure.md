# Repository structure

## 1. Целевая структура

```text
shell-sheet/
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.base.json
├── tsconfig.json
├── vitest.config.ts
├── specs/
│   ├── README.md
│   ├── architecture.md
│   ├── repository-structure.md
│   ├── platform.md
│   ├── styling.md
│   ├── quality.md
│   ├── modules/
│   │   ├── core.md
│   │   ├── dom.md
│   │   ├── motion.md
│   │   ├── effector.md
│   │   └── react.md
│   └── examples/
│       └── lovecraft.md
├── docs/                       # ненормативные guides и compatibility links
├── packages/
│   ├── core/
│   ├── dom/
│   ├── motion/
│   ├── effector/
│   └── react/
└── examples/
    ├── vanilla/
    └── lovecraft-start/        # TanStack Start reference/conformance app
```

Новые runtime-модули создаются только при появлении самостоятельной
ответственности и dependency boundary. Вспомогательный файл внутри пакета не
является основанием для нового npm package.

## 2. Dependency graph

```text
@shell-sheet/motion ──→ @shell-sheet/dom ──→ @shell-sheet/core
          │
          └────────────→ motion/mini

@shell-sheet/react ───→ @shell-sheet/dom ──→ @shell-sheet/core
          └────────────→ react + react-dom (peer)

@shell-sheet/effector ─────────────────────→ @shell-sheet/core
          └────────────→ effector (peer)
```

Разрешённые runtime dependencies:

| Package | Разрешено | Запрещено |
| --- | --- | --- |
| `core` | ничего | DOM, React, Motion, Effector, demo domain |
| `dom` | `core` | React, Effector, demo domain |
| `motion` | `dom`, `motion` | `motion/react`, React, Effector |
| `effector` | `core`; Effector как peer | DOM/React mechanics, business `kind/uiContext` |
| `react` | `core`, `dom`; React peers | Effector, `motion/react`, demo domain |

Examples MAY depend on all packages and application libraries. Ни один package
не зависит от `examples/`.

## 3. Package layout

Каждый publishable package MUST иметь:

```text
packages/<name>/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts
└── test/
```

- `src/index.ts` является единственным public export surface.
- Public surface использует named exports; default exports запрещены.
- Type-only contracts экспортируются через `export type`, чтобы
  `verbatimModuleSyntax` сохранял runtime graph честным.
- Внутренние файлы не считаются API и не импортируются потребителями через
  deep path, если subpath export не описан отдельным spec.
- ESM output и declarations создаются TypeScript project references.
- Handwritten source/tests/configuration, где tool поддерживает TS, используют
  только `.ts`/`.tsx`; runtime `.js` существует только как compiled ESM.
- Package name использует scope `@shell-sheet/*`.
- React, ReactDOM и Effector являются peer dependencies соответствующих
  adapters.
- `motion` является runtime dependency только `@shell-sheet/motion`.

## 4. Ownership

Изменение должно происходить в самом нижнем подходящем слое:

- чистый state/snap invariant → `core`;
- HTMLElement, PointerEvent, ResizeObserver, focus → `dom`;
- конкретный animation engine → `motion`;
- Effector events/stores/scope binding → `effector`;
- JSX, Portal, refs, compound composition → `react`;
- `kind`, `uiContext`, маршруты, тексты и изображения → application/example.

Adapter MUST переиспользовать нижний слой и не копировать его алгоритм. React
не выбирает snap point; Motion не измеряет DOM; Effector не рассчитывает
gesture velocity.

## 5. Root scripts

Root package остаётся private workspace coordinator. Обязательные команды:

| Command | Contract |
| --- | --- |
| `npm run typecheck` | Проверяет все packages через project references |
| `npm run typecheck:demo` | Проверяет Lovecraft application types |
| `npm test` | Запускает unit/contract/example model tests |
| `npm run build` | Собирает все publishable packages |
| `npm run build:lovecraft` | Выполняет production build главного demo |
| `npm run dev:vanilla` | Минимальный DOM smoke harness |
| `npm run dev:lovecraft` | TanStack Start React/Effector conformance app |

## 6. Non-goals v1

В структуру v1 не добавляются отдельные packages для domain state machine,
Lovecraft theme, Base UI runtime или `motion/react`. Возможные future adapters
не должны менять dependency direction существующих модулей.

Build, SSR и exact reference stack определяет
[`platform.md`](./platform.md). `examples/lovecraft-react` является текущим
prototype path и MUST быть мигрирован/переименован в `lovecraft-start`; два
параллельных главных demo после миграции не сохраняются.
