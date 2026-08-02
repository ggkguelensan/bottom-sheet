# Shell Sheet: общая архитектура и целевое состояние реализации

Статус документа: нормативное описание целевой версии v1.

Этот документ определяет, зачем существует Shell Sheet, кто управляет его
состоянием, как должны координироваться анимации и какие изменения необходимо
внести в текущую реализацию.

## 1. Назначение

Shell Sheet — не просто drawer, modal или набор React-слотов. Его основная
задача — визуально непрерывно представлять переходы между внешне заданными
состояниями интерфейса.

Обязательные свойства:

1. Shell Sheet появляется с анимацией и сразу имеет высоту целевого состояния.
2. Shell Sheet исчезает с анимацией; текущий контент сохраняется до её конца.
3. При смене состояния геометрия Shell Sheet изменяется с анимацией.
4. Старый и новый контент изменившегося региона временно существуют
   одновременно и переходят друг в друга через opacity, небольшой spatial
   offset и blur.
5. Header, Body и Footer являются независимыми регионами. Неизменившийся
   регион не дублируется, не размывается и не теряет DOM-состояние.
6. Целевой snap point выбирает внешний источник истины. Shell Sheet не выводит
   бизнес-решение о следующем состоянии из высоты контента.
7. Gesture и imperative API формируют запросы. В controlled-режиме они не
   присваивают authoritative state напрямую.

Подход к движению следует принципам
[Emil Kowalski design engineering](https://github.com/emilkowalski/skills):
motion объясняет изменение, остаётся отзывчивым и допускает прерывание.

## 2. Владелец состояния

### 2.1. Доменная state machine

В controlled-режиме единственным источником истины является приложение:
Effector, другой state manager или состояние React. Прикладной flow описывается
discriminated union, а не комбинацией независимых nullable-полей и boolean
flags.

`kind` однозначно определяет состояние и компонент, который нужно отобразить.
`uiContext` содержит строго типизированные данные именно этого состояния.

```ts
type RequestId = string & { readonly __requestId: unique symbol };

type AState = {
  kind: "A";
  uiContext: {
    locationId: string;
    summary: string;
  };
};

type BState =
  | {
      kind: "B.1";
      uiContext: {
        locationId: string;
        selectedEntryId: string | null;
      };
    }
  | {
      kind: "B.2";
      uiContext: {
        locationId: string;
        selectedEntryId: string | null;
      };
    };

type CLoadingState = {
  kind: "C.loading";
  uiContext: {
    locationId: string;
  };
  operation: {
    requestId: RequestId;
  };
  returnTo: BState;
};

type FlowState =
  | AState
  | BState
  | CLoadingState
  | {
      kind: "C.1.success";
      uiContext: {
        locationId: string;
        details: LocationDetails;
      };
    }
  | {
      kind: "C.1.fail";
      uiContext: {
        locationId: string;
        error: LoadLocationError;
        canRetry: boolean;
      };
    };
```

Renderer обязан делать exhaustive match по `kind`. Поэтому `C.loading`,
`C.1.success` и `C.1.fail` не могут случайно получить несовместимый
`uiContext`. Служебные `operation` и `returnTo` остаются частью state machine,
но не передаются контентному компоненту как UI props.

Имена состояний, `uiContext` и их бизнес-смысл не входят в
`@shell-sheet/core`. Библиотека получает только React content, controlled
open/snap target и ключи визуальных регионов.

### 2.2. Atomic target

`FlowState` проецируется в визуальный target исчерпывающей чистой функцией.
Контент, snap point и ключи регионов должны изменяться одной прикладной
транзакцией. Нельзя сначала переключить контент на B, а затем отдельным
несвязанным обновлением выбрать `b.compact`.

```ts
type ShellTransitionIntent = {
  cause:
    | "open"
    | "close"
    | "forward"
    | "backward"
    | "replace"
    | "snap"
    | "resize";
  direction: "forward" | "backward" | "none";
  motion: "auto" | "instant";
};

type ShellRegionTarget = {
  key: string;
  behavior: "preserve" | "crossfade" | "replace";
};

type ShellTarget = {
  /** Идентичность одной атомарной доменной транзакции. */
  targetId: string;
  open: boolean;
  snapPoint: "a.content" | "b.compact" | "b.expanded" | "c.content";
  presentation: "sheet" | "dialog";
  transition: ShellTransitionIntent;
  regions: {
    header: ShellRegionTarget;
    body: ShellRegionTarget;
    footer: ShellRegionTarget;
  };
};

function projectShellTarget(state: FlowState): ShellTarget {
  switch (state.kind) {
    case "A":
      return targetForA(state.uiContext);
    case "B.1":
      return targetForBCompact(state.uiContext);
    case "B.2":
      return targetForBExpanded(state.uiContext);
    case "C.loading":
      return targetForCLoading(state.uiContext);
    case "C.1.success":
      return targetForCSuccess(state.uiContext);
    case "C.1.fail":
      return targetForCFail(state.uiContext);
    default:
      return assertNever(state);
  }
}

const $shellTarget = $flow.map(projectShellTarget);
```

Effector решает, будет следующим состоянием B.1, B.2 или C.loading. Shell
Sheet только визуализирует уже выбранный target. Проекция через один store
гарантирует, что React не увидит промежуточную комбинацию нового `kind` со
старым snap point.

`transition` тоже является бизнес-решением. Shell Sheet не выводит направление
из высоты или порядка snap points: B → C.loading может быть `forward`, Back —
`backward`, loading → success — `replace`, а B.1 → B.2 — `snap`.

`targetId` создаётся приложением для каждого принятого доменного перехода.
Внутренний `transitionId` создаёт Shell Sheet для каждой попытки визуально
достичь target. Lifecycle events содержат оба идентификатора, поэтому
завершение старой анимации нельзя ошибочно принять за достижение нового
доменного состояния.

### 2.3. Асинхронные состояния и отмена

Переход в `C.loading` создаёт уникальный `requestId`. Возврат из него в B
выполняет две операции:

1. восстанавливает сохранённый `BState` из `returnTo`;
2. запрашивает физическую отмену соответствующего `AbortController`.

Abort является оптимизацией расхода ресурсов, но не гарантией корректности:
ответ может уже находиться в очереди событий или транспорт может не
поддерживать отмену. Поэтому `done/fail` дополнительно проходят state guard.

```ts
const backFromCLoading = sample({
  clock: backRequested,
  source: $flow,
  filter: (state): state is CLoadingState => state.kind === "C.loading",
});

sample({
  clock: backFromCLoading,
  fn: ({ operation }) => operation.requestId,
  target: cancelCRequestFx,
});

sample({
  clock: backFromCLoading,
  fn: ({ returnTo }) => returnTo,
  target: flowReplaced,
});

sample({
  clock: loadCFx.done,
  source: $flow,
  filter: (state, { params }): state is CLoadingState =>
    state.kind === "C.loading" &&
    state.operation.requestId === params.requestId,
  fn: (state, { result }) => ({
    kind: "C.1.success" as const,
    uiContext: {
      locationId: state.uiContext.locationId,
      details: result,
    },
  }),
  target: flowReplaced,
});
```

Для `fail` действует тот же guard. `AbortError` не создаёт `C.1.fail`, если
пользователь сознательно покинул loading state. Любой поздний result с
устаревшим `requestId` игнорируется, поэтому переход B → C.loading → Back → B
никогда не может самопроизвольно завершиться в C.1.success или C.1.fail.

Для нескольких параллельных ресурсов вместо одного `requestId` используется
типизированная таблица operation tokens в служебном поле `operation`; правило
совпадения активного состояния и token остаётся тем же.

### 2.4. Команды и запросы

В controlled-режиме:

```text
Effector state → React props → целевое состояние Shell Sheet
Effector event → ShellSheetApi → запрос на действие
Shell Sheet event → subscribe/onChange → Effector event
```

Например, `api.snapTo("b.expanded")` публикует `snap-requested`. Новое состояние
появляется только после того, как внешний store вернёт
`snapPoint: "b.expanded"`.

Ephemeral pointer state — текущий offset, velocity samples и pointer capture —
остаётся в controller/DOM слое и не проходит через Effector на каждом кадре.

### 2.5. Authoritative target и visual snapshot

Две snap points требуют явной двусторонней синхронизации, но не двух
источников истины.

- `$flow` и производный `$shellTarget` хранят желаемые `open/snapPoint`.
- Shell Sheet хранит только временное визуальное состояние перехода.
- `onSnapPointChange` и gesture release отправляют proposal в Effector.
- Effector принимает proposal, выбирает другой target или отклоняет его.
- Новый controlled target возвращается через props/`controller.sync()`.
- `subscribe()` сообщает Effector фактические lifecycle events для аналитики,
  оркестрации и тестов, но они не переписывают domain state автоматически.

Наблюдаемый snapshot должен различать settled и target значения:

```ts
type ShellSheetVisualSnapshot = {
  targetId: string | null;
  phase:
    | "closed"
    | "opening"
    | "open"
    | "dragging"
    | "transitioning"
    | "closing";
  settledSnapPoint: string | null;
  targetSnapPoint: string | null;
  transitionId: number;
};
```

Во время B.1 → B.2 Effector уже хранит B.2 как target, пока visual snapshot
ещё сообщает `settledSnapPoint: "b.compact"` и
`targetSnapPoint: "b.expanded"`. После `transition-settled` оба значения
совпадают.

Если Effector отклонил drag proposal, DOM binding анимирует поверхность от
текущей pointer geometry обратно к последнему authoritative snap point. Для
этого изменение controlled prop не требуется: reconciliation после release
всегда читает актуальный snapshot controller. Если Effector синхронно принял
другой target, та же анимация сразу retargeted к нему.

Например, выбор snap point жестом становится обычным переходом доменной
машины, а не внутренней мутацией компонента:

```ts
const bSnapRequested = createEvent<"b.compact" | "b.expanded">();

$flow.on(bSnapRequested, (state, snapPoint): FlowState => {
  if (state.kind !== "B.1" && state.kind !== "B.2") {
    return state;
  }

  return {
    kind: snapPoint === "b.expanded" ? "B.2" : "B.1",
    uiContext: state.uiContext,
  };
});
```

После этого `$shellTarget` синхронно проецирует B.1 в `b.compact`, а B.2 в
`b.expanded`. Так TypeScript state machine, Effector и фактическая геометрия
используют одну и ту же смысловую пару состояний.

Полный protocol состоит из трёх разных сущностей:

```text
request → proposal от gesture/API
target  → принятое Effector authoritative состояние
fact    → наблюдаемый visual lifecycle Shell Sheet
```

Request получает собственный `requestId` и причину (`drag`, `handle`, `api`,
`keyboard`). Target ссылается на новый `targetId`. Visual fact содержит
`targetId` и `transitionId`. Imperative method не должен возвращать Promise,
создающий впечатление, что proposal уже принят: принятие видно только по новому
controlled target, а завершение — по `transition-settled`.

## 3. Модель перехода

Shell Sheet использует один transition coordinator на весь экземпляр.
Header, Body и Footer не запускают несвязанные таймеры самостоятельно.

### 3.1. Фазы

```text
idle → preparing → animating → settling → idle
```

- `idle`: отображается одно settled-состояние.
- `preparing`: старое состояние остаётся видимым, новое смонтировано скрытым и
  измеряется.
- `animating`: геометрия и изменившиеся регионы переходят одновременно.
- `settling`: фиксируются target styles, outgoing-слои удаляются.

Каждый переход получает sequence token. Завершение отменённой анимации не
может вызвать `settle()` для более нового состояния.

### 3.2. Алгоритм A → B.1

1. Внешний store атомарно публикует `screen: B`, `snapPoint: b.compact` и новые
   region keys.
2. React коммитит incoming-слои изменившихся регионов, не удаляя outgoing.
3. Incoming-слои находятся вне обычного layout flow или скрыты визуально, но
   доступны для измерения.
4. Coordinator получает natural heights следующего Header, Body и Footer.
5. DOM-слой вычисляет высоту `b.compact` с учётом viewport, insets и maxHeight.
6. В отдельном подготовительном кадре фиксируются начальные geometry и region
   styles.
7. В следующем кадре одновременно запускаются:
   - изменение высоты Popup от A к B.1;
   - outgoing → transparent/blurred для изменившихся регионов;
   - incoming → opaque/sharp для изменившихся регионов.
8. После завершения outgoing-слои удаляются, target становится settled.

Высота рассчитывается для B.1, а не просто для «контента B»:

```text
targetHeight = resolve(
  targetSnapPoint,
  nextHeaderHeight + nextBodyNaturalHeight + nextFooterHeight,
  viewportMetrics,
)
```

### 3.3. Независимость регионов

Каждый регион получает собственный `transitionKey`.

| Переход | Header | Body | Footer | Геометрия |
| --- | --- | --- | --- | --- |
| A → B.1, меняется только Body | остаётся одним DOM-слоем | blur/crossfade | остаётся одним DOM-слоем | анимируется |
| B.1 → B.2, меняется Body | без перехода | blur/crossfade | без перехода | анимируется к B.2 |
| A → C, меняются Body и Footer | без перехода | blur/crossfade | blur/crossfade | анимируется |
| Snap point меняется, keys прежние | без перехода | без перехода | без перехода | анимируется |

Одинаковый key означает сознательное требование сохранить регион. Такой
регион не теряет focus, scroll-independent DOM state и не проходит через blur.

Если children изменились, но key остался прежним, React обновляет их обычно,
без transition. Ответственность за изменение key несёт внешний view model.

### 3.4. Opening

При `closed → A` нет outgoing-контента, поэтому blur/crossfade между экранами
не запускается.

1. Singleton Portal и Popup уже существуют в DOM или монтируются скрыто.
2. Контент A коммитится и измеряется.
3. Popup получает точную целевую высоту A до первого видимого кадра.
4. Sheet presentation появляется снизу через transform; backdrop появляется
   через opacity.
5. Dialog presentation появляется по своей пространственной модели, но
   использует те же lifecycle phases.
6. После `finished` controller переходит из `opening` в `open`.

Пользователь никогда не должен видеть Popup с нулевой, предыдущей или
неизмеренной высотой.

### 3.5. Closing

При `A → closed`:

1. Контент A, Header и Footer остаются смонтированы.
2. Popup и Backdrop проигрывают exit animation.
3. Только после `finished` root становится hidden или Portal размонтируется.
4. Focus, inert и scroll lock восстанавливаются после визуального закрытия.

### 3.6. Прерывание

Новый target может прийти до окончания текущего перехода.

- Предыдущие animation controls отменяются.
- Текущая вычисленная геометрия становится началом нового перехода.
- Старый completion callback инвалидируется sequence token.
- Не допускается прыжок назад к исходной высоте предыдущей анимации.
- Pointer down на разрешённой drag-области начинает жест от текущей видимой
  высоты, а не от последнего settled snap point.

### 3.7. Готовность и позднее изменение контента

Incoming-регион не считается готовым только потому, что внешний state уже
изменился. React commit, Suspense, декодирование изображения, загрузка шрифта и
асинхронный child layout могут отложить появление измеряемой геометрии.

- Пока incoming layer не готов к измерению, outgoing layer остаётся видимым.
- Loading является явным доменным `kind`, а не неявным fallback внутри Shell
  Sheet.
- Скрытый measurement layer не использует `display: none`.
- Coordinator начинает переход только после commit и валидного measurement.
- ResizeObserver после старта либо retargets текущую геометрию, либо оставляет
  дополнительный рост внутри scrollable Body — согласно policy.

```ts
type ContentResizeBehavior =
  | "animate"
  | "immediate"
  | "keep-snap-and-scroll";
```

`animate` подходит для редких смысловых изменений размера, `immediate` — для
незаметных корректировок, `keep-snap-and-scroll` — для потокового или длинного
контента. Resize events коалесцируются, чтобы ResizeObserver не создавал
feedback loop.

### 3.8. Результат transition

Отмена и замена являются штатным lifecycle, а не ошибкой приложения:

```ts
type ShellTransitionResult =
  | { status: "settled"; targetId: string; transitionId: number }
  | {
      status: "replaced";
      targetId: string;
      transitionId: number;
      replacedBy: number;
    }
  | {
      status: "cancelled";
      targetId: string;
      transitionId: number;
      reason: "closed" | "destroyed" | "reduced-motion" | "driver-cancelled";
    };
```

Animation driver нормализует rejected `finished` после cancel и не допускает
unhandled rejection. Для каждого `transitionId` публикуется ровно один terminal
result.

## 4. Motion contract

Рекомендованные defaults:

| Motion | Duration | Easing | Properties |
| --- | ---: | --- | --- |
| Open | 280 ms | `cubic-bezier(0.32, 0.72, 0, 1)` | transform, backdrop opacity |
| Close | 220 ms | `cubic-bezier(0.32, 0.72, 0, 1)` | transform, backdrop opacity |
| Snap/geometry | 260–280 ms | strong ease-in-out/drawer curve | isolated Popup height |
| Region transition | 220 ms | strong ease-in-out | opacity, transform 6–12 px, blur 2 px |
| Button active | 120–160 ms | ease-out | scale 0.97 |

Анимация высоты является сознательным исключением из GPU-only правила:
реальная высота нужна для scroll layout и закреплённого Footer. Layout impact
должен быть изолирован `contain: layout paint`, анимируется только Popup.

При `prefers-reduced-motion`:

- spatial transform регионов и blur отключаются;
- open/close используют короткий opacity transition до 120 ms;
- geometry принимает target без продолжительного пространственного движения;
- смысл перехода и порядок focus/inert lifecycle сохраняются.

## 5. Layout contract

```css
.shell-sheet-popup {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
  contain: layout paint;
}

.shell-sheet-body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

- Header закреплён у верхней границы Popup.
- Footer закреплён у нижней границы Popup/экрана.
- Прокручивается только Body.
- Header и Footer участвуют в natural content measurement.
- При росте bottom sheet нижняя граница и Footer остаются на месте, верхняя
  граница движется вверх.
- В dialog presentation Header и Footer закреплены к границам dialog Popup.

## 6. Drag contract

- По умолчанию Header содержит Handle.
- При `draggable={false}` стандартный Handle не рендерится и место под него не
  резервируется.
- Любой DOM-элемент может стать drag initiator через `ShellSheet.DragArea`.
- Допускается несколько DragArea.
- Custom DragArea начинает drag, но обычный click не переключает snap point.
- Standard Handle поддерживает drag и доступное click/keyboard переключение.
- Интерактивные descendants и `data-shell-sheet-drag-ignore` не начинают drag.
- Pointer capture, single-pointer protection, velocity и boundary damping
  реализуются в DOM adapter.
- В controlled-режиме drag release публикует snap request. Внешний store может
  принять запрос, заменить target или оставить прежний snap point.

Open, close и snap являются отменяемыми requests, а не безусловными командами.
Они содержат `requestId` и причину:

```ts
type ShellCloseReason =
  | "escape"
  | "backdrop"
  | "gesture"
  | "close-button"
  | "api"
  | "route-change";
```

Effector может принять close, отклонить его, сначала перейти в confirmation
state или интерпретировать Back как внутреннюю навигацию вместо закрытия.

## 7. Целевой React API

API следует общей анатомии Base UI Drawer, но runtime-зависимости от Base UI
нет. Header/Body/Footer/Handle/DragArea и region transitions являются
расширениями Shell Sheet.

```tsx
<ShellSheet.Root
  targetId={view.targetId}
  open={view.open}
  snapPoints={snapPoints}
  snapPoint={view.snapPoint}
  transition={view.transition}
  contentResizeBehavior="animate"
  onOpenChange={openRequested}
  onSnapPointChange={snapRequested}
  onTransitionStatusChange={shellTransitionObserved}
  presentation={presentation}
  draggable={draggable}
  apiRef={shellSheetApiRef}
>
  <ShellSheet.Trigger />

  <ShellSheet.Portal keepMounted>
    <ShellSheet.Backdrop />

    <ShellSheet.Viewport>
      <ShellSheet.Popup>
        <ShellSheet.Content>
          <ShellSheet.Header
            transitionKey={view.regions.header.key}
            behavior={view.regions.header.behavior}
          >
            {header}
          </ShellSheet.Header>

          <ShellSheet.Body
            transitionKey={view.regions.body.key}
            behavior={view.regions.body.behavior}
          >
            {body}
          </ShellSheet.Body>

          <ShellSheet.Footer
            transitionKey={view.regions.footer.key}
            behavior={view.regions.footer.behavior}
          >
            {footer}
          </ShellSheet.Footer>
        </ShellSheet.Content>
      </ShellSheet.Popup>
    </ShellSheet.Viewport>
  </ShellSheet.Portal>
</ShellSheet.Root>
```

Правила:

- `Root` не создаёт DOM и владеет context/coordinator.
- `Portal keepMounted` сохраняет singleton DOM между открытиями.
- `Popup` является единственной анимируемой поверхностью.
- `Content` сохраняет Base UI Drawer container semantics и содержит три
  Shell-specific layout regions.
- `Header`, `Body`, `Footer` регистрируют current/incoming measurements.
- Default Handle остаётся вне transition-layer Header, чтобы не дублироваться
  при изменении только header content.
- `ShellSheetApi` является imperative port, но не источником истины.
- `onTransitionStatusChange`/`api.subscribe()` отдают observed visual state;
  authoritative target по-прежнему приходит только через controlled props.
- Все DOM primitives поддерживают Base UI-shaped `render`, function
  `className/style`, стабильные `data-*` attributes и ref forwarding.
- Uncontrolled mode остаётся доступным для простых случаев.

Demo получает `FlowState` и `ShellTarget` одним React render. `kind` выбирает
компонент, а в него передаётся только соответствующий `uiContext`:

```tsx
<ShellSheet.Body
  transitionKey={shellTarget.regions.body.key}
  behavior={shellTarget.regions.body.behavior}
>
  {renderFlowBody(flow)}
</ShellSheet.Body>
```

`renderFlowBody()` содержит exhaustive switch; Shell Sheet не принимает и не
интерпретирует `kind` или `uiContext`.

## 8. Ответственность пакетов

### `@shell-sheet/core`

- framework-agnostic controller;
- controlled/uncontrolled open и snap state;
- snap point resolution и selection;
- request events и snapshots;
- sequence-safe transition lifecycle;
- без DOM, React, Motion, Effector и demo-сценариев.

### `@shell-sheet/dom`

- измерения Header, Body, Footer и viewport;
- transition coordinator geometry phase;
- Pointer Events, drag velocity, damping, snap request;
- scroll/drag arbitration;
- ResizeObserver и VisualViewport;
- focus, inert, scroll lock и restore focus;
- DOM attributes и CSS variables;
- подключаемый animation driver.

### `@shell-sheet/motion`

- только `motion/mini`;
- реализация animation driver;
- никакого `motion/react`, JSX drag или React motion values.

### `@shell-sheet/effector`

- подключение application-owned `$shellTarget` к controller;
- typed request и visual fact events;
- controller attach/detach для использования без React;
- отсутствие второго authoritative `$state` в default binding;
- отсутствие бизнес-сценариев в пакете.

### `@shell-sheet/react`

- compound primitives и accessibility composition;
- Portal и singleton refs;
- independent keyed region layers;
- координация React commit с DOM measurements;
- controlled props и `ShellSheetApi`;
- React/ReactDOM только peer dependencies.

## 9. Сквозные проектные инварианты

### 9.1. Accessibility двух visual layers

Outgoing и incoming DOM могут одновременно существовать ради crossfade, но в
accessibility tree активен только один смысловой слой.

- Неактивный layer получает `aria-hidden` и `inert`.
- В каждый момент существует одна доступная Title/Description association.
- Если focus находился в outgoing-регионе, coordinator переносит его в явно
  заданную target или в безопасный fallback внутри Popup.
- Modal presentation удерживает focus, делает background inert, обрабатывает
  Escape и восстанавливает focus после визуального закрытия.
- Non-modal presentation не объявляет background недоступным.
- Loading announcements принадлежат приложению; библиотека не добавляет
  неожиданный live region автоматически.

### 9.2. React, SSR и singleton lifecycle

- Core возвращает immutable и referentially stable snapshots.
- React adapter подписывается на внешний controller через
  `useSyncExternalStore` и предоставляет `getServerSnapshot`.
- Server render не обращается к `window`, `document` или DOM measurements.
- Hydration не показывает открытый Popup до получения валидной client
  geometry.
- StrictMode attach/detach идемпотентны и не уничтожают живой controller после
  промежуточного development cleanup.
- Portal container можно передать явно.
- `keepMounted` сохраняет singleton DOM; `destroy()` выполняется только при
  реальном завершении lifecycle владельца.

### 9.3. Детерминированное окружение

Драйверы внешней среды внедряются и имеют contract tests:

```ts
type ShellSheetEnvironment = {
  animation: ShellSheetAnimationDriver;
  measurements: ShellSheetMeasurementDriver;
  clock: ShellSheetClock;
  viewport: ShellSheetViewportDriver;
};
```

Unit tests не ждут реальные 220–280 ms. Fake clock и fake measurements должны
детерминированно воспроизводить interruption, ResizeObserver, drag release,
viewport resize и late completion. Один набор contract tests запускается для
native и Motion animation drivers.

### 9.4. Публичный headless styling contract

Полный normative contract находится в [`styling.md`](./styling.md).

- React primitives unstyled и не импортируют theme CSS.
- Common parts повторяют Base UI Drawer signatures для
  `render/className/style`, common state, `data-*` и `--drawer-*` variables.
- `data-starting-style`/`data-ending-style` используются и для open/close, и
  для incoming/outgoing region layers.
- Shell-specific Header/Body/Footer hooks используют отдельный
  `--shell-sheet-*` namespace и не меняют смысл Base-compatible hooks.
- `data-base-ui-swipe-ignore` поддерживается наряду с Shell-specific alias.
- Internal `.shell-sheet-*` classes не являются обязательным public API.
- Dev mode предупреждает о неизвестном snap point, дублирующихся region keys,
  отсутствующем Title и конфликтующем controlled/uncontrolled API.

### 9.5. Граница домена

Shell Sheet не предоставляет универсальную бизнес-state-machine и не знает о
`kind`, `uiContext`, history, request cancellation или маршрутах. Effector
adapter принимает производный `$shellTarget` и публикует typed requests/facts.
Доменная machine и exhaustive renderer остаются в приложении или demo.

## 10. Изменения относительно текущей реализации

| Сейчас | Целевое изменение | Причина |
| --- | --- | --- |
| Один монолитный `<ShellSheet>` | Compound `Root/Portal/Viewport/Popup/...` | Composition и Base UI-shaped API |
| Один `ShellSheetContentTransition` внутри Body | Три keyed региона под единым coordinator | Независимые Header/Body/Footer transitions |
| Content transition сам управляет timer и height | Coordinator запускает region и geometry motion вместе | A → B.1 должен быть одной транзакцией |
| Footer вложен в scroll content demo | Footer — отдельная grid row | Footer остаётся у нижней границы |
| Handle рендерится всегда | Handle отсутствует при `draggable=false` | Content-only состояние нельзя тянуть |
| DOM binding слушает один Handle | Registry стандартного Handle и custom DragArea | Любая деталь может стать drag initiator |
| `settle()` не принимает transition token | Sequence-safe completion | Старый promise не завершает новый переход |
| Header/Footer/dragAreas объявлены в DOM types, но не измеряются | Реальное binding и ResizeObserver подключение | Correct content target height |
| Demo передаёт `draggable` всегда | Screen policy из Effector view state | Бизнес-логика выбирает поведение |
| Snap и content могут обновляться разными путями | Atomic external target | Исключение промежуточных неверных кадров |
| Прикладной flow можно выразить несвязанными полями | Exhaustive discriminated union с `kind` и typed `uiContext` | Невозможные состояния исключаются на уровне TypeScript |
| Async completion может пережить экран | Abort + обязательная проверка current `kind/requestId` | Устаревший result не выполняет скрытую навигацию |
| Snapshot сообщает одно значение snap point | Отдельные `settledSnapPoint` и `targetSnapPoint` | Effector видит цель и фактическую фазу, не создавая второй source of truth |
| Направление transition выводится неявно | Typed `ShellTransitionIntent` из domain target | Forward, Back, replace и snap имеют разный смысл |
| Нет identity доменной транзакции | Внешний `targetId` + внутренний `transitionId` | Requests, targets и visual facts можно точно сопоставить |
| Incoming DOM считается сразу готовым | Readiness и `ContentResizeBehavior` | Suspense/media/font load не создают скачок геометрии |
| Два crossfade-слоя доступны assistive technology | Только один active accessibility layer | Исключаются дублированные controls и labels |
| Cancelled animation может завершиться rejected Promise | Нормализованный terminal `settled/replaced/cancelled` | Прерывание является обычным сценарием |
| Тесты зависят от real DOM time | Injected clock/measurement/viewport drivers | Race conditions воспроизводятся детерминированно |

## 11. Acceptance criteria

### Lifecycle

- Closed → A: Shell Sheet появляется с motion и с первого видимого кадра имеет
  высоту A.
- A → closed: контент A остаётся до завершения exit motion.
- Повторные open/close не пересоздают controller или DOM binding.

### Coordinated state transitions

- A → B.1: target height соответствует B.1, outgoing/incoming Body одновременно
  присутствуют во время blur transition.
- Если Header/Footer keys не изменились, в DOM существует по одному экземпляру
  этих регионов и blur на них отсутствует.
- B.1 → B.2 с тем же region key анимирует только геометрию.
- Изменение Footer key анимирует Footer независимо от Body.
- Rapid A → B.1 → C не вызывает возврата к высоте A или B.1.

### Controlled authority

- Imperative `snapTo` не меняет controlled snap point самостоятельно.
- Gesture release публикует request, который можно отклонить во внешнем store.
- Effector может атомарно выбрать B.1 или B.2 вместе с region keys.
- Snapshot различает `settledSnapPoint` и `targetSnapPoint` во время движения.
- Отклонённый drag proposal возвращает Popup к authoritative snap point, даже
  если значение controlled prop не изменилось.
- `transition-settled` содержит `transitionId` и не принимается за domain event
  более нового перехода.

### Async domain flow

- B → C.loading создаёт новый request token и отображает loading content.
- C.loading → C.1.success/fail возможен только при совпадении текущего `kind` и
  `requestId`.
- Back из C.loading возвращает точный сохранённый B.1/B.2 state и отменяет
  запрос, если transport поддерживает abort.
- Поздние success/fail после Back не меняют B и не открывают Shell Sheet.
- Новый C.loading для того же ресурса получает другой token; результат старой
  операции игнорируется.

### Layout and gestures

- Footer остаётся у нижней границы во время snap и drag.
- Body получает внутренний scroll при превышении доступной высоты.
- `draggable=false` удаляет Handle и блокирует все drag initiators.
- Custom DragArea поддерживает pointer capture и не получает click-toggle
  semantics стандартного Handle.

### Accessibility and motion

- Modal focus trap, inert, scroll lock, Escape и focus restoration сохраняются.
- Non-modal presentation не блокирует background content.
- Reduced motion исключает spatial/blur эффекты, но сохраняет понятный lifecycle.
- Title/Description корректно связываются с dialog semantics.
- Во время crossfade только active layer доступен screen reader и keyboard.
- Focus внутри заменяемого региона переносится предсказуемо до удаления
  outgoing layer.

### Readiness, interruption and environment

- Suspended/unmeasured incoming content не скрывает outgoing content.
- Late media/font resize выполняет выбранный `ContentResizeBehavior`.
- Для каждого `transitionId` существует ровно один terminal result.
- Cancelled driver promise не создаёт unhandled rejection.
- SSR не требует DOM, hydration не показывает промежуточную геометрию.
- Один deterministic contract suite проходит для native и Motion drivers.

## 12. Граница v1

В v1 поддерживается Base UI-compatible common anatomy и props для bottom-sheet
сценария. Не являются обязательными для первого релиза:

- horizontal drawers;
- nested drawer stack;
- Indent/IndentBackground;
- edge SwipeArea для открытия;
- VirtualKeyboardProvider как отдельный React primitive;
- detached trigger payload API.

Эти возможности не должны усложнять главный A → B.x transition protocol до
его стабилизации.

## 13. Definition of Done

Целевая версия готова, когда все acceptance criteria представлены
автоматическими unit/integration tests, а demo визуально демонстрирует:

1. Animated open и close.
2. A → B.1 с одновременным geometry и Body blur transition.
3. B.1 → B.2, выбранный Effector, с корректным snap motion.
4. Неизменившийся Footer без blur и без remount.
5. Изменившийся Footer с независимым transition.
6. Content-only недраггабельное состояние без Handle.
7. Draggable compact → expanded состояние с внутренним Body scroll.
8. Sheet → dialog transition без remount.
9. B → C.loading → Back → B с физическим abort и игнорированием позднего
   success/fail.
10. B → C.loading → C.1.success с coordinated geometry/region transition.
11. B → C.loading → C.1.fail → Retry с новым request token.
12. Suspended/late-measured incoming Body без исчезновения outgoing Body.
13. Focus и accessibility tree во время независимых region crossfades.
14. Rapid replace/cancel с одним terminal result на transition.
15. SSR/hydration и React StrictMode attach/detach.

## 14. Нормативные и проектные источники

- [Emil Kowalski design engineering](https://github.com/emilkowalski/skills) —
  motion purpose, interruptibility, blur transition и interaction polish.
- [Base UI Drawer](https://base-ui.com/react/components/drawer) — compound
  anatomy, controlled state и headless composition conventions.
- [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) —
  focus, inert background, accessible name, Escape и focus restoration.
- [React `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore) —
  подписка React adapter на внешний controller и server snapshot.
- [Web Animations API `cancel()`](https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel) —
  cancellation semantics и rejected `finished` promise.
