# `@shell-sheet/core`

## 1. Назначение

Core — framework-agnostic TypeScript state/controller engine. Он хранит
authoritative controlled target, публикует requests/facts и содержит чистые
snap algorithms. Core MUST работать без DOM, React, Motion и Effector.

## 2. Public surface

Целевой public surface включает:

- `createShellSheetController()`;
- `resolveSnapPoints()`;
- `selectSnapPoint()`;
- `clampSheetHeight()`;
- `assertSnapPoints()`;
- типы controller, target, snapshot, requests, facts, transition intent и snap
  point definitions.

Snap point id SHOULD быть generic string type, чтобы application могла
сохранить union (`"b.compact" | "b.expanded"`) до adapter boundary.

## 3. State planes

Core различает:

1. **Request** — proposal от API/gesture.
2. **Authoritative target** — последнее значение `sync()` приложения.
3. **Visual lifecycle** — opening/transitioning/closing/settled и identity
   выполняемой попытки.
4. **Ephemeral interaction** — drag offset и velocity samples.

Controlled command MUST NOT мутировать authoritative target. Uncontrolled mode
MAY принять request локально через тот же `sync` transition path.

Snapshot immutable и referentially stable между изменениями. Минимальные поля:

```ts
type ShellSheetSnapshot<TSnap extends string = string> = {
  targetId: string | null;
  open: boolean;
  phase:
    | "closed"
    | "opening"
    | "open"
    | "dragging"
    | "transitioning"
    | "closing";
  settledSnapPoint: TSnap | null;
  targetSnapPoint: TSnap | null;
  dragOffset: number;
  transitionId: number;
};
```

## 4. Target synchronization

`sync(target)` MUST:

- валидировать target snap point;
- принимать `targetId`, open, target snap и transition intent атомарно;
- ничего не публиковать для того же immutable target;
- создавать новый `transitionId` для нового visual attempt;
- retarget незавершённый transition от текущего visual state;
- не считать target settled до terminal signal DOM coordinator;
- игнорировать terminal signal с устаревшим `transitionId`.

Отклонённый gesture request возвращается к последнему authoritative target,
даже если приложение не изменило controlled value.

## 5. Requests и facts

Request events содержат `requestId`, origin/reason и proposal. Facts содержат
`targetId`/`transitionId` и описывают уже случившееся.

Обязательная taxonomy:

- `open-requested`;
- `close-requested`;
- `snap-requested`;
- `target-synced`;
- `transition-started`;
- `transition-settled`;
- `transition-replaced`;
- `transition-cancelled`;
- `drag-started/updated/ended/cancelled`;
- `destroyed`.

Для каждого `transitionId` MUST существовать ровно один terminal fact.

## 6. Snap algorithms

Поддерживаются размеры:

- ratio `(0, 1]` доступной viewport height;
- non-negative pixels;
- natural content с optional `maxRatio`.

Resolution учитывает viewport, top/bottom inset, Header, Body, Footer, min/max
height. Результат сортируется по физической высоте независимо от declaration
order. Duplicate/empty ids и invalid sizes вызывают descriptive errors.

Snap selection учитывает nearest height и velocity direction. Boundary drag
использует configurable rubber-band coefficient. Эти функции чистые и не
читают время или DOM.

## 7. Lifecycle и destroy

- API после `destroy()` бросает descriptive error, кроме повторного destroy.
- Subscribe возвращает idempotent unsubscribe.
- Listener iteration безопасна при unsubscribe во время publish.
- Cancel/replaced являются штатными terminal results.
- Core не ждёт реальные timers и не импортирует animation driver.

## 8. Tests

Contract tests MUST покрывать controlled rejection, same-target no-op,
interruption A→B→C, stale settle, invalid snap ids, velocity selection,
rubber-band boundaries, idempotent destroy и immutable snapshot identity.
