# Shell Sheet specifications

Статус: **единственный нормативный источник истины (SSOT)** для репозитория.

Каталог `specs/` определяет целевую структуру, публичные контракты, поведение,
границы модулей и критерии готовности Shell Sheet. Код и тесты реализуют эти
спецификации. Если текущее поведение расходится со spec, это implementation
gap, а не повод молча переписать spec под существующий код.

## Нормативный язык

- **MUST / должен** — обязательное требование.
- **MUST NOT / не должен** — запрещённое поведение.
- **SHOULD / следует** — default, отклонение требует зафиксированного решения.
- **MAY / может** — разрешённое расширение.

## Карта спецификаций

| Документ | Нормативная область |
| --- | --- |
| [`architecture.md`](./architecture.md) | Цель продукта, state ownership, transition protocol, layout, gestures, accessibility и Definition of Done |
| [`repository-structure.md`](./repository-structure.md) | Структура monorepo, dependency graph, exports и границы каталогов |
| [`platform.md`](./platform.md) | TypeScript-first policy, target stack, build, SSR/hydration и browser baseline |
| [`styling.md`](./styling.md) | Base UI Drawer-shaped styling API, states, attributes и CSS variables |
| [`modules/core.md`](./modules/core.md) | Framework-agnostic state/controller и snap algorithms |
| [`modules/dom.md`](./modules/dom.md) | DOM binding, measurements, coordinator, gestures, viewport и accessibility |
| [`modules/motion.md`](./modules/motion.md) | `motion/mini` animation driver |
| [`modules/effector.md`](./modules/effector.md) | Прямой Effector adapter без React и без второго SSOT |
| [`modules/react.md`](./modules/react.md) | Compound React API, Portal, regions, refs, SSR и Base UI-shaped composition |
| [`examples/lovecraft.md`](./examples/lovecraft.md) | Предметно-независимый conformance showcase через Lovecraft domain |
| [`quality.md`](./quality.md) | Test matrix, performance, bundle, accessibility и release gates |

`docs/` содержит только ненормативные пояснения или ссылки на `specs/`.
Требование, существующее только в README, комментарии, issue или demo, не
считается частью контракта до внесения в соответствующий spec.

## Порядок приоритетов

При конфликте применяются правила:

1. Явное новое решение владельца проекта.
2. Этот governance-документ.
3. `architecture.md` для сквозных инвариантов.
4. Более узкий module/example spec для локальных деталей.
5. Tests и implementation как доказательство соответствия, но не как источник
   новых требований.

Обнаруженный конфликт MUST быть устранён изменением specs в той же ветке. Нельзя
оставлять два нормативных описания одного поведения.

## Spec-driven workflow

Каждое изменение выполняется в порядке:

```text
intent
  → spec change
  → acceptance/contract tests
  → implementation
  → demo evidence
  → verification
```

1. Изменить минимальный набор specs и отметить новые invariants.
2. Добавить или обновить tests, которые наблюдают публичное поведение.
3. Реализовать изменение в модуле-владельце, не дублируя ответственность.
4. Обновить conformance demo, если поведение визуальное или интеграционное.
5. Запустить release gates из `quality.md`.
6. В commit/PR перечислить изменённые specs и доказательства соответствия.

Рефакторинг без изменения observable contract MAY не менять spec. Если
рефакторинг обнаруживает неописанный invariant, invariant сначала добавляется
в spec.

## Текущее соответствие целевой версии

Состояние на 2026-08-02:

| Область | Статус | Главный gap |
| --- | --- | --- |
| Core controller и snap algorithms | Partial | Текущий controller не реализует target union, immutable target/settled snapshot, tokenized lifecycle и projected release |
| DOM binding | Partial | Текущий binding смешивает старый controller protocol с DOM mechanics; нет transaction scheduler, region registry/coordinator и measured presentation morph |
| Motion driver | Partial | Cancel result ещё не нормализован в общий lifecycle |
| Effector adapter | Partial | Текущий convenience binding создаёт собственный `$state`; нужен adapter к производному `$shellTarget` приложения |
| React adapter | Prototype | Монолитный API вместо целевого compound API; transition существует только для одного content region |
| Styling compatibility | Specified | Base UI-shaped contract зафиксирован; implementation и conformance tests ещё не выполнены |
| Platform/SSR/build | Specified | Target stack и package contract зафиксированы; Start demo, SSR fixtures и packed-package gates ещё не реализованы |
| Lovecraft demo | Prototype | Нет полного async stale-result showcase и всех conformance states |
| Quality gates | Partial | Есть unit/type/build checks; нужны contract, accessibility, SSR и browser interaction tests |

`Partial` и `Prototype` означают, что public package ещё не считается v1-ready.

## Зафиксированные архитектурные решения v1

- Core всегда target-driven; uncontrolled convenience существует только в
  adapter и использует тот же `sync()` path.
- Business owner атомарно выбирает closed/open target, snap definitions и
  snap point, presentation/modality и region identities.
- Core публикует semantic requests/facts; per-frame pointer geometry остаётся
  только в DOM.
- DOM выполняет coalesced `measure → mutate → next-frame animate → settle`
  transaction и один tokenized coordinator для geometry/regions/presentation.
- `sheet ↔ dialog` меняет layout того же Popup без remount и scale текста.
- Header/Footer pinned, Body — единственный scroll viewport; Handle входит в
  Header measurement и при `draggable=false` отсутствует полностью.
- Пакеты и reference application TypeScript-first; package imports SSR-safe,
  Portal v1 client-attached.

Эти решения считаются финализированным target v1. Их изменение требует
явного spec decision до изменения implementation.

### Реестр целевых архитектурных решений

Все пять Strong-кандидатов архитектурного аудита приняты в target v1. Названия
кандидатов из отчёта ненормативны; нормативны идентификаторы и контракты ниже.
Каждое решение имеет ровно один module owner и проверяется через публичный
seam, а не через структуру private helper-файлов.

| ID | Принятое решение | Module owner и public seam | Запрещённая утечка | Нормативное доказательство |
| --- | --- | --- | --- | --- |
| `ARCH-CORE-01` | Core является глубоким semantic engine | `@shell-sheet/core`: atomic `sync(target)`, requests/facts, cached snapshot, pure geometry algorithms | DOM elements, browser clock, live drag pixels, React/Effector state | [`modules/core.md`](./modules/core.md), core contract tests |
| `ARCH-DOM-01` | Вся browser mechanics скрыта за одним binding | `@shell-sheet/dom`: `bind/register/setInsets/refresh/destroy` | React-owned measurements/timers, прямые lifecycle writes из adapters, несколько несвязанных animation clocks | [`modules/dom.md`](./modules/dom.md), fake-environment и browser contract tests |
| `ARCH-GESTURE-01` | Hot pointer loop остаётся DOM-local | DOM gesture session + один semantic release request через Core | per-frame Core facts, Effector events или React renders | [`modules/dom.md`](./modules/dom.md#10-gesture-session), performance/browser tests |
| `ARCH-REACT-01` | React является registration/composition adapter | `@shell-sheet/react`: compound parts, refs, region registration, Portal lifecycle | snap/gesture algorithms, DOM measurements, animation timers, business `kind/uiContext` | [`modules/react.md`](./modules/react.md), React/SSR contract tests |
| `ARCH-EFFECTOR-01` | Effector binding транспортирует application-owned target | `@shell-sheet/effector`: attach/detach, atomic target sync, typed request/fact delivery | adapter-owned generic `$state`, `$open`, `$snapPoint` или domain transitions | [`modules/effector.md`](./modules/effector.md), global/forked-scope contract tests |

Изменение, нарушающее столбец «Запрещённая утечка», является архитектурной
регрессией даже при сохранении текущего визуального поведения. Изменить один
из этих seams можно только одновременным изменением этого реестра,
`architecture.md`, module spec и соответствующего contract test.

## Изменение спецификаций

- Изменение public API MUST обновить module spec и compatibility notes.
- Изменение package boundary MUST обновить `repository-structure.md`.
- Изменение сквозного transition/state protocol MUST обновить
  `architecture.md` до реализации.
- Новая предметная demo-сущность MUST оставаться в `examples/` и не попадать в
  package specs, кроме описания проверяемой capability.
- Superseded-решение удаляется или превращается в явно ненормативную заметку;
  противоречащие варианты не сохраняются как равноправные.
