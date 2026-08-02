# Platform, TypeScript and integration contract

Статус: нормативный platform contract v1.

Этот документ фиксирует среду, в которой Shell Sheet разрабатывается,
проверяется и используется. Publishable packages остаются независимыми от
application stack; reference application доказывает совместимость с реальным
стеком владельца проекта.

## 1. TypeScript-first policy

- Все handwritten source, tests, examples и tool configuration, где tool
  поддерживает TypeScript, MUST использовать `.ts` или `.tsx`.
- JavaScript consumer API, JSDoc typing, CommonJS examples и отдельные JS
  compatibility fixtures находятся вне scope.
- `allowJs` и `checkJs` MUST оставаться выключенными.
- Public functions и exported contracts имеют явные signatures. Локальные
  значения и промежуточные derivations используют inference.
- Domain/config tables SHOULD использовать `as const satisfies`, когда нужно
  одновременно сохранить literal unions и проверить contract.
- `any`, non-null assertions и type assertions запрещены в public logic, кроме
  документированной platform boundary после runtime validation.
- Recoverable outcomes выражаются discriminated unions. `throw` сохраняется
  для programmer errors, нарушенных invariants и использования API после
  destroy.
- Strict compiler options включают `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax` и
  `isolatedDeclarations`.
- Package projects используют `target: "ES2022"`, `module/moduleResolution:
  "NodeNext"` и `.js` specifiers в source imports. `core` компилируется только
  с `lib: ["ES2022"]`; DOM/React adapters отдельно добавляют `DOM`/
  `DOM.Iterable`. Так случайный browser global в core становится compile error.
- Public unions и `as const satisfies` tables предпочтительнее runtime enums.
  `useUnknownInCatchVariables`, `noImplicitOverride` и
  `noPropertyAccessFromIndexSignature` SHOULD быть включены, если third-party
  declarations не блокируют migration.

Runtime distribution неизбежно содержит скомпилированные ESM `.js` files и
`.d.ts`; это build artifacts, а не поддержка handwritten JavaScript.

## 2. Reference application stack

Главный conformance demo MUST работать на следующем стеке:

- TanStack Start с Vite и full-document SSR;
- TanStack Router как владелец URL/navigation;
- TanStack Query как владелец remote server state и cache;
- Effector `23+` как application state machine и владелец `$shellTarget`;
- React/ReactDOM `18.3.x` как primary runtime;
- Base UI для остальных headless controls, но не как реализация Shell Sheet;
- CSS Modules + PostCSS;
- application design tokens через CSS custom properties;
- Node `22.12+` для reference Start toolchain.

Точные versions reference application фиксирует lockfile. CI дополнительно
проверяет React/ReactDOM 19 как forward-compatibility fixture; primary behavior
и types не могут зависеть от React 19-only API.

TanStack Start, Router, Query, Effector, Base UI, PostCSS и CSS Modules не
попадают в dependency graph publishable packages, кроме Effector как peer
dependency `@shell-sheet/effector`.

## 3. Ownership in the reference application

| Layer | Authoritative responsibility |
| --- | --- |
| TanStack Router | route, validated search params, browser history, deep links |
| TanStack Query | request/cache lifecycle, remote payload, invalidation, transport cancellation |
| Effector | discriminated-union flow, history, active operation identity, projection to `$shellTarget` |
| Shell Sheet core | request/target/fact protocol and visual lifecycle identity |
| DOM adapter | measured geometry, animation coordination, gestures, modality and focus |
| React adapter | compound composition, Portal and region registration |
| CSS Modules/PostCSS | theme, layout recipes and mapping application tokens to public hooks |

Remote payload не копируется в отдельный Shell Sheet store. Effector MAY
ссылаться на Query state или проецировать нужный `uiContext`, но Query остаётся
владельцем cache. Late Query/effect completion изменяет flow только при
совпадении current `kind` и operation token.

URL содержит только состояния, которым приложение сознательно даёт deep-link
semantics. Внутренняя навигация Header/Body/Footer не становится route state
автоматически.

## 4. Package build contract

- Publishable packages собираются TypeScript project references через
  `tsc -b`; отдельный bundler не используется без доказанной необходимости.
- Output — ESM only с `.js`, `.d.ts`, declaration maps и source maps.
- Source imports используют корректные `.js` specifiers для Node ESM output.
- Package `exports` содержит explicit `types` и `import` conditions.
- Каждый package публикует только `dist` и объявляет `sideEffects: false`.
- CommonJS, UMD, bundled React, bundled Effector и bundled theme CSS запрещены.
- `@shell-sheet/core` не имеет runtime dependencies.
- `@shell-sheet/dom` зависит только от core.
- `@shell-sheet/react` использует React/ReactDOM как peers.
- `@shell-sheet/motion` является единственным package с runtime dependency на
  `motion` и импортирует только `motion/mini`.

V1 compatibility ranges:

- `react`/`react-dom`: `^18.3.0 || ^19.0.0` peers;
- `effector`: `^23.0.0` peer в Effector adapter;
- `motion`: `^12.0.0` runtime dependency Motion adapter;
- TypeScript `>=5.7` для consumer declarations; workspace pin фиксирует
  фактическую compiler version.

Перед release каждый packed tarball проверяется через Node ESM import,
TypeScript consumer compilation, `publint`, `@arethetypeswrong/cli` и
tree-shaken Vite consumer build.

### 4.1. Test toolchain

- Vitest выполняет pure/controller/adapter contracts.
- React DOM tests используют jsdom только для composition semantics, не для
  доказательства layout/gesture behavior.
- Playwright запускает Chromium, Firefox и WebKit browser contracts.
- Accessibility automation использует `axe-core`/Playwright и дополняется
  keyboard/screen-reader walkthrough.
- Fake DOM environment детерминированно управляет ResizeObserver,
  VisualViewport, animation frames и driver completions.

## 5. SSR and hydration

- Import любого package MUST быть side-effect free и не читать `window`,
  `document`, `HTMLElement`, `matchMedia`, `ResizeObserver` или
  `VisualViewport` на module evaluation.
- Core и Effector adapter работают на сервере без условных shims.
- DOM environment создаётся только явным browser-side `bind`.
- React adapter использует immutable cached snapshots и
  `useSyncExternalStore(..., getServerSnapshot)`.
- Server snapshot и первый hydration snapshot MUST быть семантически и
  структурно одинаковыми.
- Initial serializable `ShellSheetTarget` и `targetId` детерминированы из
  hydrated application state; server/client не генерируют их через
  `Date.now()`/random во время render.
- Controller/DOM binding/HTMLElement/visual snapshot не сериализуются в
  Effector scope или TanStack payload. Сервер и клиент создают собственные
  controller instances из одного serializable application target.
- Effector scope и QueryClient создаются per request; singleton server state
  между запросами запрещён.

Portal v1 является client-attached surface:

1. Server render и первый hydration render не создают portaled subtree без
   реального `container`.
2. После hydration `keepMounted` создаёт скрытый singleton subtree.
3. DOM binding регистрирует parts и измеряет authoritative open target.
4. Первый visible frame уже имеет target geometry; затем выполняется normal
   opening lifecycle.

Следствие: изначально открытый Portal content не является SEO/SSR content v1.
Если продукту понадобится indexable inline surface, это будет отдельный
presentation/adapter contract, а не скрытый special case Portal.

Responsive presentation выбирает application state. Server и первый client
render используют одинаковый fallback. Первая неизвестная серверу media
correction выполняется с `motion: "instant"`; последующие changes получают
обычный interruptible `sheet ↔ dialog` transition.

## 6. Styling integration

- React package остаётся unstyled и не импортирует CSS.
- Reference demo использует только CSS Modules для component styles и PostCSS
  для transformations/tooling.
- Цвета, typography, spacing, radius, shadows, z-index и motion tokens задаются
  application CSS variables.
- Library пишет inline styles только для измеренной mechanics, перечисленной в
  `styling.md`; theme values принадлежат consumer.
- Base UI components в demo используют те же application tokens, поэтому Shell
  Sheet не требует отдельной theme layer.

## 7. Browser baseline

V1 ориентирован на modern evergreen browsers с native Pointer Events,
ResizeObserver, VisualViewport, `inert` и WAAPI. Reference Browserslist:

```text
last 2 Chrome versions
last 2 Edge versions
last 2 Firefox versions
last 2 Safari versions
last 2 ios_saf versions
not dead
```

Library не поставляет polyfills. Capabilities проверяются runtime при DOM bind,
а browser suite запускается в Chromium, Firefox и WebKit.

Mobile interaction MUST проверяться в iOS Safari/WebKit и Chromium Android,
потому что VisualViewport, software keyboard, scroll lock и pointer
cancellation невозможно доказать только jsdom tests.

## 8. Explicit non-goals

- handwritten JavaScript and JavaScript-only consumers;
- CommonJS and legacy bundlers;
- React Server Components API in v1;
- framework-specific runtime imports inside publishable packages;
- automatic Router/Query/Effector state ownership inside Shell Sheet;
- server-rendered Portal content without an explicit future inline contract.

## 9. Primary references

- [TanStack Start overview](https://tanstack.com/start/latest/docs/framework/react/overview)
- [TanStack Start execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model)
- [TanStack Query SSR](https://tanstack.com/query/latest/docs/framework/react/guides/ssr)
- [React `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore)
- [Base UI platform support](https://base-ui.com/react/overview/about)
