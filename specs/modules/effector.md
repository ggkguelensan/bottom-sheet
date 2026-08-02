# `@shell-sheet/effector`

## 1. Назначение

Effector adapter соединяет application-owned domain state machine с core
controller без React. Он не создаёт второй источник истины и не знает о
предметных `kind`/`uiContext`.

## 2. Ownership

Application владеет:

- `$flow: Store<DomainState>`;
- exhaustive projection `$shellTarget`;
- обработкой open/close/snap requests;
- async effects, AbortController, request tokens и history;
- решением принять или отклонить proposal.

Adapter владеет только attach/detach, доставкой target в `controller.sync()` и
переводом controller events в Effector events.

## 3. Target API

Целевой adapter принимает существующие units приложения:

```ts
createShellSheetBinding<TSnapPoint, TRegionKey>({
  $target,
  requestReceived,
  visualFactReceived,
});
```

Он предоставляет:

- `controllerAttached` / `controllerDetached`;
- `$controller`, сериализация отключена;
- `$visualSnapshot`, сериализация отключена;
- `syncControllerFx`;
- `attach(controller)` для global scope;
- scope-safe helper или документированный `scopeBind` flow для forked scope.

Convenience model с собственным `$state` MAY существовать отдельным export, но
не является default binding и не используется приложением с `$flow`.

При совместном использовании React application создаёт controller на уровне
app/scope lifecycle, attach-ит его к binding и передаёт тот же instance в
`<ShellSheet.Root controller={controller}>`. Root работает в external
controller mode и не выполняет второй target sync. Без React тот же controller
передаётся напрямую в DOM binding.

## 4. Synchronization

```text
$flow → $shellTarget → controller.sync(target)
controller request → requestReceived → domain transition/rejection
controller fact → visualFactReceived → optional $shellVisual
```

Snap proposal не изменяет `$shellTarget` автоматически. Domain reducer
переводит B.1↔B.2 или возвращает прежнее состояние. Visual fact никогда не
переписывает `$flow` без явного application sample.

Один target update передаёт complete `ShellSheetTarget`: closed union либо
open union с `targetId`, snap definitions/selection, presentation, modality,
regions и transition intent. Adapter не раскладывает target на независимые
stores перед `controller.sync()`.

Controller request/fact delivery низкочастотна. Pointer move/velocity samples
не проходят через Effector; adapter получает interaction start/end и один
release proposal.

## 5. Async business flow

Adapter не отменяет application effects. Demo/application обязаны:

- создать operation token при входе в loading state;
- abort transport при выходе, если возможно;
- проверять current `kind` и token на done/fail;
- игнорировать late result.

Эти поля не добавляются в core snapshot.

## 6. Tests

Tests MUST покрывать attach/detach, initial sync, atomic target sync, proposal
accept/reject, visual fact forwarding, no feedback loop, forked scope isolation
и отсутствие сериализации controller/DOM snapshots. Отдельный performance
test доказывает отсутствие Effector event на pointer move.
