# `@shell-sheet/core`

Статус: нормативный target contract v1.

## 1. Назначение и граница

Core — platform-agnostic TypeScript engine. Он определяет:

- атомарный visual target Shell Sheet;
- request/target/fact protocol;
- identity и фазу visual transition;
- чистые snap resolution, release selection и rubber-band algorithms;
- immutable external-store snapshot.

Core MUST работать без DOM, browser globals, React, Motion, Effector, timers и
application domain. Он не измеряет элементы, не анимирует и не решает
бизнес-переходы.

Controller всегда **target-driven**. Отдельного authoritative uncontrolled
state в core нет. Convenience `defaultOpen`/`defaultSnapPoint` в React adapter
может владеть локальным target и передавать его тем же `sync()` protocol.

## 2. Public surface

Целевой export surface:

- `createShellSheetController(initialTarget?)`;
- `resolveSnapPoints(definitions, metrics)`;
- `selectReleaseDestination(input)`;
- `applyRubberBand(input)`;
- `assertShellSheetTarget(target)` и `assertSnapPoints(definitions)`;
- public types, перечисленные в этом документе.

Snap и region keys generic, чтобы literal unions сохранялись до application
boundary:

```ts
type ShellSheetController<
  TSnap extends string = string,
  TRegionKey extends string = string,
> = { /* ... */ };
```

Public API не экспортирует mutable internal collections и не требует class
inheritance.

## 3. Atomic target

Приложение передаёт одно discriminated union, а не набор независимо
синхронизируемых props:

```ts
type ShellTransitionDirection =
  | "forward"
  | "backward"
  | "replace"
  | "snap"
  | "none";

type ShellTransitionIntent = {
  readonly cause:
    | "open"
    | "close"
    | "navigate"
    | "snap"
    | "content"
    | "presentation"
    | "hydrate"
    | "api";
  readonly direction: ShellTransitionDirection;
  readonly motion: "auto" | "instant";
};

type ShellRegionTarget<TKey extends string> = {
  readonly key: TKey;
  readonly transition: "preserve" | "crossfade" | "replace";
};

type ShellSheetClosedTarget = {
  readonly targetId: string;
  readonly open: false;
  readonly transition: ShellTransitionIntent;
  readonly causeRequestId?: number;
};

type ShellSheetOpenTarget<
  TSnap extends string,
  TRegionKey extends string,
> = {
  readonly targetId: string;
  readonly open: true;
  readonly snapPoints: readonly ShellSheetSnapPoint<TSnap>[];
  readonly snapPoint: TSnap;
  readonly presentation: "sheet" | "dialog";
  readonly modality: "modal" | "non-modal";
  readonly draggable: boolean;
  readonly snapToSequentialPoints?: boolean;
  readonly contentResizeBehavior:
    | "animate"
    | "immediate"
    | "keep-snap-and-scroll";
  readonly regions: {
    readonly header: ShellRegionTarget<TRegionKey>;
    readonly body: ShellRegionTarget<TRegionKey>;
    readonly footer: ShellRegionTarget<TRegionKey>;
  };
  readonly transition: ShellTransitionIntent;
  readonly causeRequestId?: number;
};

type ShellSheetTarget<
  TSnap extends string = string,
  TRegionKey extends string = string,
> =
  | ShellSheetClosedTarget
  | ShellSheetOpenTarget<TSnap, TRegionKey>;
```

`snapPoints` и выбранный `snapPoint` принадлежат одному update: экран не может
быть временно сопоставлен definitions от прошлого экрана. DOM-only tuning
(gesture threshold, deceleration, insets, animation driver) target не хранит.

### `targetId`

- `targetId` — semantic identity всего target, а не только контента.
- Любое observable изменение target получает новый `targetId`.
- Повторная синхронизация того же `targetId` и того же object reference — no-op.
- Тот же `targetId` с другим object reference — programmer error; development
  build MUST сообщить descriptive error, production MAY оставить первый target
  как безопасный no-op.
- `causeRequestId` позволяет сопоставить принятый request, но не является
  обязательным: внешний store может перейти по другой причине.

Core не deep-compare target и arbitrary application data: `uiContext` и React
nodes не входят в target. Их identity выражается region keys. Application
SHOULD memoize target object на время жизни `targetId`; target ids уникальны
внутри lifecycle controller и не переиспользуются позже.

Target types глубоко readonly по public contract. Core не мутирует, не
deep-clone и не deep-freeze consumer target на hot path; runtime mutation после
`sync()` является нарушением caller contract. Development validation MAY
freeze собственные derived snapshot wrappers, но не должна менять входной
object.

## 4. Snapshot model

Snapshot содержит target и визуально подтверждённый факт, не второй
authoritative store:

```ts
type ShellSheetPhase =
  | "closed"
  | "preparing"
  | "opening"
  | "open"
  | "dragging"
  | "transitioning"
  | "closing"
  | "destroyed";

type ShellSheetSnapshot<
  TSnap extends string = string,
  TRegionKey extends string = string,
> = {
  readonly authoritativeTarget: ShellSheetTarget<TSnap, TRegionKey> | null;
  readonly settledTarget: ShellSheetOpenTarget<TSnap, TRegionKey> | null;
  readonly phase: ShellSheetPhase;
  readonly transitionId: number | null;
  readonly interaction: null | {
    readonly interactionId: number;
    readonly origin: "handle" | "drag-area";
  };
};
```

Derived selectors MAY предоставлять `open`, `targetSnapPoint`,
`settledSnapPoint`, `targetPresentation` и `settledPresentation`, но не хранят
их как независимо изменяемое состояние.

Snapshot:

- immutable и referentially stable, пока observable state не изменился;
- cached, чтобы соответствовать `useSyncExternalStore`;
- не содержит `HTMLElement`, измерений, pointer coordinates, per-frame offset
  или velocity samples;
- не сериализуется как application state.

`settledTarget` означает последний полностью отображённый open target. При
closing он сохраняется до terminal result. После settled close становится
`null`.

## 5. Controller protocol

```ts
type ShellRequestOrigin =
  | "trigger"
  | "api"
  | "gesture"
  | "keyboard"
  | "backdrop"
  | "close-button";

type ShellCloseReason =
  | "escape"
  | "backdrop"
  | "gesture"
  | "close-button"
  | "api"
  | "route-change";

type ShellTransitionCancelReason =
  | "destroyed"
  | "driver-cancelled"
  | "registry-lost";

type ShellInteractionCancelReason =
  | "pointer-cancelled"
  | "capture-lost"
  | "visibility-lost"
  | "target-changed"
  | "destroyed";

type ShellGestureRelease = {
  readonly interactionId: number;
  readonly distance: number;
  readonly velocity: number;
  readonly projectedHeight: number;
};

type ShellCloseRequestDetails = {
  readonly origin: ShellRequestOrigin;
  readonly release?: ShellGestureRelease;
};

type ShellSnapRequestDetails = {
  readonly origin: ShellRequestOrigin;
  readonly release?: ShellGestureRelease;
};
```

Минимальный controller API:

```ts
type ShellSheetController<TSnap extends string, TRegionKey extends string> = {
  sync(target: ShellSheetTarget<TSnap, TRegionKey>): void;

  requestOpen(origin?: ShellRequestOrigin): number;
  requestClose(reason: ShellCloseReason, details?: ShellCloseRequestDetails): number;
  requestSnap(snapPoint: TSnap, details: ShellSnapRequestDetails): number;

  beginTransition(targetId: string): number;
  settleTransition(transitionId: number): void;
  cancelTransition(transitionId: number, reason: ShellTransitionCancelReason): void;

  beginInteraction(origin: "handle" | "drag-area"): number;
  endInteraction(interactionId: number): void;
  cancelInteraction(interactionId: number, reason: ShellInteractionCancelReason): void;

  getSnapshot(): ShellSheetSnapshot<TSnap, TRegionKey>;
  subscribe(listener: ShellSheetListener<TSnap, TRegionKey>): () => void;
  destroy(): void;
};
```

Эти method names, ownership и token semantics составляют public v1 contract;
изменение требует обновления spec до implementation.

`beginTransition` атомарно terminal-replaces предыдущий active transition (если
он есть), создаёт новый id и затем публикует `transition-started`. Поэтому
coordinator не может забыть закрыть старый token и не вызывает отдельный
public `replaceTransition`.

`beginTransition` принимает только id текущего `authoritativeTarget`; unknown
или previous target id — programmer error. Повторная visual attempt того же
current target id разрешена для rejected proposal reconciliation и content
resize.

### `sync(target)`

`sync` MUST:

1. runtime-валидировать structural invariants и выбранный snap id;
2. атомарно заменить `authoritativeTarget`;
3. опубликовать `target-synced` после обновления snapshot;
4. не объявлять target settled до terminal signal coordinator;
5. оставить решение о начале измерения/animation DOM coordinator;
6. при новом target во время transition позволить coordinator заменить старую
   попытку от текущей visual geometry.

При сравнении с предыдущим open target `regions.*.transition: "preserve"`
требует тот же region key; changed key с preserve — programmer error. Same key
с `crossfade/replace` вызывает development warning, не создаёт второй layer и
фактически сводится к preserve, потому что identity не изменилась.

После `sync()` нового `targetId` terminal settle старого active transition не
принимается, даже если DOM ещё не успел вызвать следующий `beginTransition`.
Старый token остаётся pending-invalid и получает `replaced` при следующем
begin либо `cancelled` при destroy; поздний driver completion — no-op.

Отклонённый gesture proposal не требует нового target. DOM reconciles текущую
геометрию к уже имеющемуся `authoritativeTarget`; это отдельная visual attempt
с новым transition token, но не новый бизнес-target.

## 6. Requests, facts и ordering

Requests — предложения внешнему владельцу state:

- `open-requested`;
- `close-requested`;
- `snap-requested`.

```ts
type ShellSheetRequest<TSnap extends string> =
  | {
      readonly type: "open-requested";
      readonly sequence: number;
      readonly requestId: number;
      readonly origin: ShellRequestOrigin;
    }
  | {
      readonly type: "close-requested";
      readonly sequence: number;
      readonly requestId: number;
      readonly origin: ShellRequestOrigin;
      readonly reason: ShellCloseReason;
      readonly release?: ShellGestureRelease;
    }
  | {
      readonly type: "snap-requested";
      readonly sequence: number;
      readonly requestId: number;
      readonly origin: ShellRequestOrigin;
      readonly snapPoint: TSnap;
      readonly release?: ShellGestureRelease;
    };
```

Каждое event получает общий monotonic `sequence`; каждый request дополнительно
получает monotonic `requestId`, `origin`, reason/proposal и для
snap MAY включать release summary: distance, velocity, projected height и
предложенный snap id. Request никогда сам не меняет target.

`requestSnap` для id, которого нет в текущем open authoritative target, —
programmer error. Остальные requests публикуются даже если target уже выглядит
соответствующим: application может интерпретировать intent как navigation или
analytics и самостоятельно решить no-op.

Facts описывают случившееся:

- `target-synced`;
- `transition-started`;
- `transition-settled`;
- `transition-replaced`;
- `transition-cancelled`;
- `interaction-started`;
- `interaction-ended`;
- `interaction-cancelled`;
- `destroyed`.

```ts
type ShellSheetFact<TSnap extends string, TRegionKey extends string> =
  | {
      readonly type: "target-synced";
      readonly sequence: number;
      readonly target: ShellSheetTarget<TSnap, TRegionKey>;
    }
  | {
      readonly type: "transition-started";
      readonly sequence: number;
      readonly targetId: string;
      readonly transitionId: number;
    }
  | {
      readonly type: "transition-settled";
      readonly sequence: number;
      readonly targetId: string;
      readonly transitionId: number;
    }
  | {
      readonly type: "transition-replaced";
      readonly sequence: number;
      readonly targetId: string;
      readonly transitionId: number;
      readonly replacedBy: number;
    }
  | {
      readonly type: "transition-cancelled";
      readonly sequence: number;
      readonly targetId: string;
      readonly transitionId: number;
      readonly reason: ShellTransitionCancelReason;
    }
  | {
      readonly type: "interaction-started" | "interaction-ended";
      readonly sequence: number;
      readonly interactionId: number;
      readonly origin: "handle" | "drag-area";
    }
  | {
      readonly type: "interaction-cancelled";
      readonly sequence: number;
      readonly interactionId: number;
      readonly origin: "handle" | "drag-area";
      readonly reason: ShellInteractionCancelReason;
    }
  | {
      readonly type: "destroyed";
      readonly sequence: number;
    };
```

`ShellSheetEvent = ShellSheetRequest | ShellSheetFact`; listener получает
`(snapshot, event)` после атомарного snapshot update. Adapter MAY разделить
этот stream на `requestReceived` и `visualFactReceived`, не меняя ordering.

Per-pointer-move `drag-updated` public fact запрещён. Покадровая geometry живёт
в DOM adapter, чтобы подписка Effector/React не вызывалась на каждом frame.

Ordering invariants:

- sequence/request/transition/interaction ids монотонны внутри controller;
- internal ids используют counters, а не wall clock, `Date.now()` или random;
- каждый `transition-started` имеет ровно один terminal fact: settled,
  replaced или cancelled;
- stale terminal token — no-op и не меняет snapshot;
- accepted gesture публикует `interaction-started`; release сначала публикует
  `interaction-ended`, затем ровно один snap/close request с тем же
  `interactionId`; cancelled gesture request не публикует;
- snapshot обновлён до вызова listeners;
- reentrant commands ставятся в внутреннюю FIFO queue и исполняются после
  текущей публикации;
- unsubscribe во время dispatch безопасен;
- исключение одного listener не должно ломать ordering или cleanup остальных;
  после dispatch оно MAY быть rethrown/reported по documented error policy.

## 7. Snap point model

```ts
type ShellSheetSnapPoint<TSnap extends string> =
  | {
      readonly id: TSnap;
      readonly size: { readonly type: "ratio"; readonly value: number };
    }
  | {
      readonly id: TSnap;
      readonly size: { readonly type: "pixels"; readonly value: number };
    }
  | {
      readonly id: TSnap;
      readonly size: {
        readonly type: "content";
        readonly maxRatio?: number;
      };
    };

type ShellSheetMetrics = {
  readonly viewportHeight: number;
  readonly insetTop: number;
  readonly insetBottom: number;
  readonly headerHeight: number;
  readonly bodyNaturalHeight: number;
  readonly footerHeight: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
};

type ResolvedShellSheetSnapPoint<TSnap extends string> = {
  readonly id: TSnap;
  readonly height: number;
  readonly declarationIndex: number;
};
```

Handle находится внутри Header mechanics и **не прибавляется отдельно**.
Natural content height:

```text
headerHeight + bodyNaturalHeight + footerHeight
```

`insetTop/insetBottom` означают external reserved space вне Popup. Safe-area
padding, который находится внутри Header/Footer, уже входит в их measurement и
не передаётся второй раз как inset.

Validation rejects empty/duplicate ids, `NaN`, infinities, ratio outside
`(0, 1]`, negative pixels/insets/region sizes, invalid min/max и content
`maxRatio` outside `(0, 1]`.

Все numeric dimensions/velocity используют CSS pixels и milliseconds, а не
device pixels.

`resolveSnapPoints()` возвращает
`readonly ResolvedShellSheetSnapPoint<TSnap>[]` и не мутирует definitions или
metrics.

Resolution:

- работает в fractional CSS pixels и не округляет результат;
- вычисляет `available = max(0, viewportHeight - insetTop - insetBottom)`;
- raw ratio равен `available * value`, pixels равен `value`, content равен
  natural height с optional clamp `available * maxRatio`;
- upper bound равен `min(available, maxHeight ?? available)`, lower bound —
  `min(upperBound, minHeight ?? 0)`, после чего raw height clamp-ится между
  bounds. Конфигурационный `minHeight > maxHeight` invalid, но уменьшение
  viewport ниже min корректно даёт available upper bound;
- возвращает declaration index вместе с resolved physical height;
- сортирует navigation order по physical height, затем declaration order;
- допускает разные ids с одинаковой clamped physical height, но navigation и
  release MUST пропускать физически эквивалентные точки;
- при равной distance сохраняет active id, затем declaration order.

## 8. Release selection и rubber band

Release destination выбирается чистой функцией из current visible height,
velocity, resolved points и config:

```ts
type ShellSheetReleaseDestination<TSnap extends string> =
  | { readonly type: "snap"; readonly snapPoint: TSnap }
  | { readonly type: "close" };
```

Velocity измеряется в CSS px/ms; положительное значение направлено вниз
(поверхность уменьшается), отрицательное — вверх. Default projection time
constant — `180ms`, то есть интеграл exponential velocity decay даёт
`projected = currentHeight - velocity * 180`. Значение configurable и finite.

Default algorithm:

1. Проецирует endpoint по configurable exponential deceleration.
2. Выбирает ближайшую физически отличающуюся snap point к projected endpoint.
3. Возвращает close, только если caller разрешил close, release направлен ниже
   lowest snap и выполнен хотя бы один default threshold: downward velocity
   `>= 0.7 px/ms` либо drag distance ниже lowest `>= min(96px, 25% lowest)`.
4. При `snapToSequentialPoints=true` ограничивает результат одной соседней
   физической точкой в направлении движения.
5. При недостаточном direction/distance сохраняет nearest/active point.

Core не читает часы: velocity и samples вычисляет DOM и передаёт числа.
Config values finite и runtime-validated.

Overscroll использует прогрессивное, ограниченное сопротивление с default
constant `0.55` и dimension, равным available viewport, например:

```ts
const resisted =
  (overshoot * dimension * constant) /
  (dimension + constant * Math.abs(overshoot));
```

Линейный multiplier не является v1 default: при длинном drag он выглядит
неограниченным. Pure algorithm сохраняет знак, непрерывен около нуля и не
возвращает non-finite result.

## 9. Error and destroy policy

- Programmer/configuration errors throw synchronously с descriptive message.
- Отклоняемые open/close/snap действия являются request data, не exceptions.
- `destroy()` идемпотентен и публикует `destroyed` один раз.
- Первый destroy terminal-cancels active interaction/transition в этом порядке,
  затем публикует `destroyed`; terminal invariants сохраняются.
- После destroy `sync`, request и lifecycle mutation methods throw; повторный
  destroy безопасен.
- `getSnapshot()` после destroy возвращает stable snapshot с
  `phase: "destroyed"`, null targets/transition/interaction, чтобы controller
  не удерживал application target graph.
- `subscribe` возвращает idempotent unsubscribe.
- Core не создаёт timers, promises animation driver или environment listeners.

Reduced motion не считается cancellation: DOM применяет target мгновенно и
завершает обычным `transition-settled`.

## 10. Implementation shape

Рекомендуемые внутренние модули:

```text
src/
├── controller.ts             # queue, ids, snapshot, request/fact protocol
├── target.ts                 # validation and identity invariants
├── snap-points.ts            # validation and resolution
├── release-selection.ts      # projection and destination
├── rubber-band.ts            # boundary resistance
├── types.ts                  # public contracts
└── index.ts                  # intentional exports only
```

State transitions SHOULD быть pure reducer-like functions вокруг одной
mutable private cell; наружу выдаются frozen/cached values. Не следует вводить
общую event-bus abstraction или конечный автомат-фреймворк ради нескольких
явных фаз.

## 11. Contract tests

До признания core готовым tests MUST покрывать:

- atomic open/closed targets и selected snap validation;
- same-target no-op и conflicting reused `targetId`;
- requests не меняют authoritative target;
- A→B→C interruption и ровно один terminal result на transition;
- stale settle/cancel tokens;
- reentrant listener queue, unsubscribe и listener failure isolation;
- immutable/referentially stable snapshots;
- all non-finite/duplicate/constraint validation cases;
- content height без double-count Handle;
- clamped duplicate heights и deterministic tie-breaking;
- projected release, sequential mode, close proposal и direction changes;
- progressive rubber-band boundaries;
- idempotent destroy и post-destroy errors;
- import в Node SSR environment без browser globals.
