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
| Core controller и snap algorithms | Partial | Нет atomic target identity и sequence-safe terminal results |
| DOM binding | Partial | Нет единого coordinator для трёх regions и drag-area registry |
| Motion driver | Partial | Cancel result ещё не нормализован в общий lifecycle |
| Effector adapter | Partial | Текущий convenience binding создаёт собственный `$state`; нужен adapter к производному `$shellTarget` приложения |
| React adapter | Prototype | Монолитный API вместо целевого compound API; transition существует только для одного content region |
| Lovecraft demo | Prototype | Нет полного async stale-result showcase и всех conformance states |
| Quality gates | Partial | Есть unit/type/build checks; нужны contract, accessibility, SSR и browser interaction tests |

`Partial` и `Prototype` означают, что public package ещё не считается v1-ready.

## Изменение спецификаций

- Изменение public API MUST обновить module spec и compatibility notes.
- Изменение package boundary MUST обновить `repository-structure.md`.
- Изменение сквозного transition/state protocol MUST обновить
  `architecture.md` до реализации.
- Новая предметная demo-сущность MUST оставаться в `examples/` и не попадать в
  package specs, кроме описания проверяемой capability.
- Superseded-решение удаляется или превращается в явно ненормативную заметку;
  противоречащие варианты не сохраняются как равноправные.
