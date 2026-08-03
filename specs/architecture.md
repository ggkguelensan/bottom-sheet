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
   одновременно и переходят друг в друга через opacity. Отдельная blur-surface
   лежит поверх обоих слоёв и достигает максимального blur ровно в середине
   перехода.
5. Header, Body и Footer являются независимыми регионами. Неизменившийся
   регион не дублируется, не размывается и не теряет DOM-состояние.
6. Целевой snap point выбирает внешний источник истины. Shell Sheet не выводит
   бизнес-решение о следующем состоянии из высоты контента.
7. Gesture и imperative API формируют запросы. Они никогда не присваивают
   authoritative target напрямую.

Подход к движению следует принципам
[Emil Kowalski design engineering](https://github.com/emilkowalski/skills):
motion объясняет изменение, остаётся отзывчивым и допускает прерывание.

## 2. Владелец состояния

### 2.1. Доменная state machine

Единственным источником истины является приложение: Effector, другой state
manager или локальный owner React adapter. Прикладной flow описывается
discriminated union, а не комбинацией независимых nullable-полей и boolean
flags.

`kind` однозначно определяет состояние и компонент, который нужно отобразить.
`uiContext` содержит строго типизированные данные именно этого состояния.

```ts
type RequestId = string & { readonly __requestId: unique symbol };

type ClosedState = {
  kind: "closed";
  uiContext: Record<never, never>;
};

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
  | ClosedState
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
`@shell-sheet/core`. Библиотека получает только атомарный visual target и ключи
визуальных регионов; React content регистрирует React adapter.

### 2.2. Atomic target

`FlowState` проецируется в визуальный target исчерпывающей чистой функцией.
Контент, snap point и ключи регионов должны изменяться одной прикладной
транзакцией. Нельзя сначала переключить контент на B, а затем отдельным
несвязанным обновлением выбрать `b.compact`.

```ts
import type { ShellSheetTarget } from "@shell-sheet/core";

type DemoSnapPoint =
  | "a.content"
  | "b.compact"
  | "b.expanded"
  | "c.content";

type DemoRegionKey =
  | "navigation"
  | "location-summary"
  | "location-details"
  | "loading"
  | "primary-actions";

type ShellTarget = ShellSheetTarget<DemoSnapPoint, DemoRegionKey>;

function projectShellTarget(state: FlowState): ShellTarget {
  switch (state.kind) {
    case "closed":
      return targetForClosed();
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
из высоты или порядка snap points: B → C.loading может иметь
`cause: "navigate", direction: "forward"`, Back — `backward`, loading →
success — `replace`, а B.1 → B.2 — `snap`.

Open target атомарно включает snap definitions, выбранный snap, presentation,
modality, draggable policy, content-resize policy и три region targets. Closed
target не притворяется открытым target с `snapPoint: null`. Полный normative
union находится в [`modules/core.md`](./modules/core.md#3-atomic-target).

`targetId` создаётся приложением для каждого принятого доменного перехода.
Внутренний `transitionId` создаёт Shell Sheet для каждой попытки визуально
достичь target. Lifecycle events содержат оба идентификатора, поэтому
завершение старой анимации нельзя ошибочно принять за достижение нового
доменного состояния.

В reference application `targetId` строится из scope-local monotonic domain
revision и serializable state identity, а не из wall clock/random во время
render. Это сохраняет SSR/hydration determinism.

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

В reference stack `loadCFx` является typed bridge к
`queryClient.fetchQuery()`/observer, а `cancelCRequestFx` — к
`queryClient.cancelQueries()`. TanStack Query остаётся владельцем remote cache,
retry и transport AbortSignal; Effector владеет только flow/operation identity
и решением, можно ли результату изменить экран. Payload не зеркалируется в
ещё один бесконтрольный cache store.

### 2.4. Команды и запросы

В application-owned режиме:

```text
Effector state → React props → целевое состояние Shell Sheet
Effector event → ShellSheetApi → запрос на действие
Shell Sheet event → subscribe/onChange → Effector event
```

Например, `api.snapTo("b.expanded")` публикует `snap-requested`. Новое состояние
появляется только после того, как внешний store вернёт
`snapPoint: "b.expanded"`.

Ephemeral pointer state — текущий offset, velocity samples и pointer capture —
остаётся только в DOM слое и не проходит через core subscribers, Effector или
React на каждом кадре.

### 2.5. Authoritative target и visual snapshot

Две snap points требуют явной двусторонней синхронизации, но не двух
источников истины.

- `$flow` и производный `$shellTarget` хранят желаемые `open/snapPoint`.
- Shell Sheet хранит только временное визуальное состояние перехода.
- `onSnapPointChange` и gesture release отправляют proposal в Effector.
- Effector принимает proposal, выбирает другой target или отклоняет его.
- Новый authoritative target возвращается через props/`controller.sync()`.
- `subscribe()` сообщает Effector фактические lifecycle events для аналитики,
  оркестрации и тестов, но они не переписывают domain state автоматически.

Наблюдаемый snapshot различает authoritative и settled targets:

```ts
type ShellSheetVisualSnapshot = {
  authoritativeTarget: ShellTarget | null;
  settledTarget: Extract<ShellTarget, { open: true }> | null;
  phase:
    | "closed"
    | "preparing"
    | "opening"
    | "open"
    | "dragging"
    | "transitioning"
    | "closing"
    | "destroyed";
  transitionId: number | null;
};
```

Во время B.1 → B.2 `authoritativeTarget.snapPoint` уже равен `b.expanded`, пока
`settledTarget.snapPoint` ещё равен `b.compact`. После
`transition-settled` settled target становится authoritative. Удобные
`targetSnapPoint`/`settledSnapPoint` MAY быть derived selectors, но не отдельные
изменяемые ячейки.

Если Effector отклонил drag proposal, DOM binding анимирует поверхность от
текущей pointer geometry обратно к последнему authoritative snap point. Для
этого изменение target prop не требуется: reconciliation после release
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
authoritative target, а завершение — по `transition-settled`.

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
может вызвать tokenized settle для более нового состояния. Каждый started
token получает ровно один terminal fact.

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
   - outgoing opacity `1 → 0` для изменившихся регионов;
   - incoming opacity `0 → 1` для изменившихся регионов;
   - отдельная transition-surface поверх обоих слоёв проходит
     `blur(0) → blur(2px) → blur(0)` с пиком на `offset: 0.5`.
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
      reason: "destroyed" | "driver-cancelled" | "registry-lost";
    };
```

Animation driver нормализует rejected `finished` после cancel и не допускает
unhandled rejection. Для каждого `transitionId` публикуется ровно один terminal
result.

## 4. Motion contract

V1 driver defaults (consumer меняет их documented CSS timing tokens):

| Motion | Duration | Easing | Properties |
| --- | ---: | --- | --- |
| Open | 280 ms | `cubic-bezier(0.32, 0.72, 0, 1)` | transform, backdrop opacity |
| Close | 220 ms | `cubic-bezier(0.32, 0.72, 0, 1)` | transform, backdrop opacity |
| Snap/geometry | 260–280 ms | strong ease-in-out/drawer curve | isolated Popup height |
| Region transition | 220 ms | strong ease-in-out | layer opacity + overlay backdrop blur 0→2→0 px |

Driver — единственный clock для geometry, Backdrop progress и region motion.
Consumer CSS задаёт target appearance/timing tokens, но не запускает вторую CSS
transition тех же mechanic properties.

Default spatial models:

- sheet opening/closing перемещает Popup по Y от/к полностью скрытой нижней
  позиции, Backdrop меняет opacity;
- dialog opening/closing использует opacity + 12 px vertical offset без scale
  текста;
- `replace` не придумывает navigation direction, `snap` с неизменными keys не
  трогает regions;
- `motion: "instant"` — единственный application-requested путь без animation;
  reduced motion применяет отдельную policy ниже.

Анимация высоты является сознательным исключением из GPU-only правила:
реальная высота нужна для scroll layout и закреплённого Footer. Layout impact
должен быть изолирован `contain: layout paint`, анимируется только Popup.

При `prefers-reduced-motion`:

- blur-surface отключается, короткий opacity crossfade сохраняется;
- open/close используют короткий opacity transition до 120 ms;
- geometry принимает target без продолжительного пространственного движения;
- смысл перехода и порядок focus/inert lifecycle сохраняются.

Reduced motion применяет и settles target обычным terminal success. Это не
`cancelled` transition.

## 5. Layout contract

```css
.shell-sheet-popup {
  min-height: 0;
  overflow: hidden;
  contain: layout paint;
}

.shell-sheet-content {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  block-size: 100%;
  min-height: 0;
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

### 5.1. Sheet ↔ dialog

`sheet` и `dialog` — два presentation одного singleton Popup. Они не
реализуются условным mount двух разных поверхностей.

- Application выбирает реальный target presentation; CSS media query не может
  молча показать `dialog` target как sheet.
- DOM coordinator измеряет текущий и целевой rect, применяет target layout и
  анимирует translate + inline/block size без scale текста.
- Geometry, computed radius/backdrop и изменившиеся regions начинаются одной
  transaction.
- Header/Footer остаются pinned, Body остаётся единственным scroll viewport.
- Interruption начинает новый morph от текущего visual rect.
- Modality lifecycle синхронизируется с morph: protections приобретаются до
  первого modal frame и снимаются только после terminal non-modal/close frame.

Детальный measurement/FLIP-like protocol находится в
[`modules/dom.md`](./modules/dom.md#8-sheet--dialog-morph).

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
- V1 начинает drag только с registered Handle/DragArea. Body сохраняет native
  vertical scroll и не обещает mid-gesture handoff в Sheet; DragArea не должен
  охватывать native Body scroller.
- Drag release публикует snap request. Внешний store может
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
  target={shellTarget}
  onRequest={shellRequestReceived}
  onFact={shellFactReceived}
  apiRef={shellSheetApiRef}
>
  <ShellSheet.Trigger />

  <ShellSheet.Portal keepMounted>
    <ShellSheet.Backdrop />

    <ShellSheet.Viewport>
      <ShellSheet.Popup>
        <ShellSheet.Content>
          <ShellSheet.Header>
            {header}
          </ShellSheet.Header>

          <ShellSheet.Body>
            {body}
          </ShellSheet.Body>

          <ShellSheet.Footer>
            {footer}
          </ShellSheet.Footer>
        </ShellSheet.Content>
      </ShellSheet.Popup>
    </ShellSheet.Viewport>
  </ShellSheet.Portal>
</ShellSheet.Root>
```

Правила:

- `Root` не создаёт DOM nodes и владеет только React context, composition и
  lifecycle binding; единственный visual coordinator принадлежит DOM adapter.
- `Portal keepMounted` сохраняет singleton DOM между открытиями.
- `Popup` является единственной анимируемой поверхностью.
- `Content` сохраняет Base UI Drawer container semantics и содержит три
  Shell-specific layout regions.
- `Header`, `Body`, `Footer` регистрируют current/incoming measurements.
- Default Handle остаётся вне transition-layer Header, чтобы не дублироваться
  при изменении только header content.
- `ShellSheetApi` является imperative port, но не источником истины.
- `onTransitionStatusChange`/`api.subscribe()` отдают observed visual state;
  authoritative target по-прежнему приходит только через `target`.
- Все DOM primitives поддерживают Base UI-shaped `render`, function
  `className/style`, стабильные `data-*` attributes и ref forwarding.
- Base-shaped `open/defaultOpen` convenience mode остаётся доступным для
  простых случаев, но React adapter проецирует его в тот же core target
  protocol. Core не получает второго uncontrolled state path.

Demo получает `FlowState` и `ShellTarget` одним React render. `kind` выбирает
компонент, а в него передаётся только соответствующий `uiContext`:

```tsx
<ShellSheet.Body>
  {renderFlowBody(flow)}
</ShellSheet.Body>
```

`renderFlowBody()` содержит exhaustive switch; Shell Sheet не принимает и не
интерпретирует `kind` или `uiContext`.

## 8. Ответственность пакетов

### `@shell-sheet/core`

- framework-agnostic controller;
- всегда target-driven authoritative synchronization;
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
- atomic target/Base-shaped convenience props и `ShellSheetApi`;
- React/ReactDOM только peer dependencies.

### 8.1. Два разрешённых runtime loop

Архитектура разделяет низкочастотный semantic loop и покадровый visual loop.
Они встречаются только на release/target boundary:

```text
semantic loop
application $flow → $shellTarget → Core sync → DOM coordinator
application $flow ← request handler ← Core request ← DOM release/API
application analytics ← Core visual fact ← DOM terminal lifecycle

hot visual loop
PointerEvent → DOM gesture session → coalesced rAF → mechanic styles
                                      └─ release ─→ one Core request
```

Нормативные правила seam:

- Core является единственной границей identity/order для requests, targets и
  facts; adapters не пересылают друг другу скрытые lifecycle callbacks.
- DOM является единственным владельцем mutable visual state, measurements,
  pointer samples и mechanic DOM writes.
- Animation driver исполняет переданные keyframes и сообщает result, но не
  измеряет DOM, не выбирает target и не вызывает Core самостоятельно.
- React регистрирует DOM parts/layers и отображает application content, но не
  запускает собственный visual transition.
- Effector синхронизирует полный target и принимает semantic requests/facts,
  но не наблюдает каждый pointer frame.
- Ни один adapter не может обойти `controller.sync()` и непосредственно
  объявить proposal authoritative target.

Это разделение реализует `ARCH-CORE-01`…`ARCH-EFFECTOR-01` из
[`README.md`](./README.md#реестр-целевых-архитектурных-решений). Любой новый
public callback или store должен быть отнесён к одному из двух loop до
добавления в API.

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

Nondeterministic browser capabilities внедряются только через DOM binding:

```ts
bindShellSheetToDom(controller, {
  environment,
  animation,
  scrollLock,
  backgroundIsolation,
});
```

`ShellSheetDomEnvironment` инкапсулирует animation-frame scheduling, computed
style, ResizeObserver, VisualViewport, matchMedia и document visibility.
Animation и optional modality drivers являются отдельными ports: они не
маскируются универсальным `clock`/`measurements` abstraction и не получают
доступ к controller. Exact interface принадлежит
[`modules/dom.md`](./modules/dom.md#2-public-binding-surface).

Unit tests не ждут реальные 220–280 ms. Fake environment и controlled driver
completions должны детерминированно воспроизводить interruption,
ResizeObserver, drag release, viewport resize и late completion. Один набор
animation contract tests запускается для native и Motion drivers.

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
- Dev mode предупреждает о неизвестном snap point, повторно использованном
  `targetId`, дублирующихся region keys, отсутствующем Title и конфликтующем
  target/Base-convenience API.

### 9.5. Граница домена

Shell Sheet не предоставляет универсальную бизнес-state-machine и не знает о
`kind`, `uiContext`, history, request cancellation или маршрутах. Effector
adapter принимает производный `$shellTarget` и публикует typed requests/facts.
Доменная machine и exhaustive renderer остаются в приложении или demo.

### 9.6. Глубина модулей и TypeScript implementation rules

Core controller и DOM binding проектируются как deep modules: маленький public
interface скрывает scheduling, registries, measurements и browser mechanics.
Внутренние файлы — не новые public seams.

- Tests наблюдают public module interface и DOM contract, а не private helpers.
- Внешние dependencies принимаются на реальных seams. Animation driver имеет
  две реализации (native/Motion), browser environment нужен deterministic
  tests; гипотетические adapters без второго consumer не добавляются.
- Immutable public targets/snapshots сочетаются с локальной essential mutation
  внутри controller queue, DOM registry и hot pointer loop. Mutation не
  протекает наружу и не заменяется allocation-heavy spreads ради стиля.
- Exported functions, contracts и discriminated unions типизированы явно;
  intermediate values используют inference.
- Config/domain tables используют `as const satisfies`, когда нужны literal
  unions и проверка shape; avoidable `as`/`any` не являются design shortcut.
- Recoverable request/driver outcomes выражаются tagged data. Programmer errors
  и нарушенные invariants fail fast.
- Implementation выполняется вертикальными red→green slices по заранее
  определённым seams, а не одним горизонтальным слоем tests и затем code.

Эти правила адаптируют
[Matt Pocock codebase-design/TDD](https://github.com/mattpocock/skills) и
[declaratify-ts](https://github.com/ggkguelensan/declaratify/tree/main/skills/declaratify-ts)
к hot-path требованиям DOM/gesture engine: понятность не должна создавать
лишние allocations или ухудшать runtime cost.

## 10. Изменения относительно текущей реализации

| Сейчас | Целевое изменение | Причина |
| --- | --- | --- |
| Один монолитный `<ShellSheet>` | Compound `Root/Portal/Viewport/Popup/...` | Composition и Base UI-shaped API |
| Один `ShellSheetContentTransition` внутри Body | Три keyed региона под единым coordinator | Независимые Header/Body/Footer transitions |
| Content transition сам управляет timer и height | Coordinator запускает region и geometry motion вместе | A → B.1 должен быть одной транзакцией |
| Footer вложен в scroll content demo | Footer — отдельная grid row | Footer остаётся у нижней границы |
| Handle рендерится всегда | Handle отсутствует при `draggable=false` | Content-only состояние нельзя тянуть |
| DOM binding слушает один Handle | Registry стандартного Handle и custom DragArea | Любая деталь может стать drag initiator |
| `settle()` не принимает transition token | Sequence-safe begin/settle/replace/cancel | Старый promise не завершает новый переход |
| Header/Footer/dragAreas объявлены в DOM types, но не измеряются | Реальное binding и ResizeObserver подключение | Correct content target height |
| Handle height измеряется отдельно от Header | Handle является частью Header measurement | Исключается double count content height |
| Pointer move публикует core `drag-updated` | Per-frame state остаётся DOM-local | Effector/React не обновляются на каждом кадре |
| Velocity выбирает только соседнюю точку по threshold | Projected endpoint + optional sequential mode | Release сохраняет momentum, а sequential policy остаётся явной |
| Boundary damping линейный | Progressive bounded rubber band | Длинный overscroll не выглядит неограниченным |
| DOM writes смешаны с measurements | Coalesced measure → mutate → next-frame animate | Нет layout thrash/ResizeObserver feedback |
| Presentation меняется options/CSS | Measured same-Popup `sheet ↔ dialog` morph | Семантика target и visual layout совпадают без remount |
| Scroll lock/focus принадлежат одному binding без ownership | Document-scoped reference-counted modality manager | StrictMode и несколько overlays не восстанавливают страницу преждевременно |
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

### 10.1. Bottom-up implementation order

Имплементация MUST идти по dependency direction и не начинаться с переписывания
demo:

1. **Public types and contract fixtures** — atomic target, snapshot,
   requests/facts, animation result и compile-time generic unions.
2. **Pure core algorithms** — strict validation, resolution, projected release,
   sequential policy и rubber band.
3. **Core controller** — cached snapshots, FIFO publication, tokenized lifecycle,
   destroy semantics; без DOM fake abstractions.
4. **DOM foundation** — injectable environment, stable registry, fractional
   measurements и measure/mutate scheduler.
5. **DOM visual coordinator** — open/close, geometry и independent regions;
   затем interruption и content resize.
6. **DOM interactions/platform** — gestures/native scroll isolation,
   modality/focus,
   VisualViewport и measured sheet↔dialog morph.
7. **Drivers/adapters** — normalized native/Motion drivers, direct Effector
   binding, compound React API.
8. **Reference application** — TanStack Start migration и все conformance
   scenarios, затем browser/a11y/packaging gates.

Каждый номер завершается соответствующими tests до перехода выше. Допускается
ранний минимальный vertical smoke через vanilla DOM, но верхний adapter не
копирует отсутствующую lower-layer механику как временную постоянную
реализацию.

В первой implementation итерации current public API MAY быть временно
несовместим: package ещё не v1. Предпочтительнее один явно мигрированный target
contract, чем compatibility branches, которые сохраняют старый controller как
второй источник поведения.

## 11. Acceptance criteria

### Lifecycle

- Closed → A: Shell Sheet появляется с motion и с первого видимого кадра имеет
  высоту A.
- A → closed: контент A остаётся до завершения exit motion.
- Повторные open/close не пересоздают controller или DOM binding.

### Coordinated state transitions

- A → B.1: target height соответствует B.1, outgoing/incoming Body одновременно
  присутствуют во время opacity crossfade, а отдельная Body blur-surface
  перекрывает их и достигает пика в середине transition.
- Если Header/Footer keys не изменились, в DOM существует по одному экземпляру
  этих регионов и blur на них отсутствует.
- B.1 → B.2 с тем же region key анимирует только геометрию.
- Изменение Footer key анимирует Footer независимо от Body.
- Rapid A → B.1 → C не вызывает возврата к высоте A или B.1.

### Target authority

- Imperative `snapTo` не меняет authoritative snap point самостоятельно.
- Gesture release публикует request, который можно отклонить во внешнем store.
- Effector может атомарно выбрать B.1 или B.2 вместе с region keys.
- Snapshot различает `settledSnapPoint` и `targetSnapPoint` во время движения.
- Отклонённый drag proposal возвращает Popup к authoritative snap point, даже
  если значение target prop не изменилось.
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
- Native Body scroll не превращается неявно в sheet drag на boundary.
- `draggable=false` удаляет Handle и блокирует все drag initiators.
- Custom DragArea поддерживает pointer capture и не получает click-toggle
  semantics стандартного Handle.
- Pointer move не публикует core/Effector/React event на каждом frame.
- Release выбирает projected snap destination; sequential policy ограничивает
  движение одной соседней физической точкой.

### Accessibility and motion

- Modal focus trap, inert, scroll lock, Escape и focus restoration сохраняются.
- Non-modal presentation не блокирует background content.
- Reduced motion отключает region blur-surface, но сохраняет короткий opacity
  crossfade и понятный lifecycle.
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
- `sheet ↔ dialog` использует тот же Popup, не масштабирует текст и может быть
  прерван новым target без visual jump.

## 12. Граница v1

В v1 поддерживается Base UI-compatible common anatomy и props для bottom-sheet
сценария. Не являются обязательными для первого релиза:

- horizontal drawers;
- nested drawer stack;
- Indent/IndentBackground;
- edge SwipeArea для открытия;
- native Body-scroll → sheet-drag handoff в одном touch gesture;
- VirtualKeyboardProvider как отдельный React primitive;
- detached trigger payload API.

Также v1 сознательно принимает компромиссы:

- Portal client-attached и не является indexable SSR content;
- `motion/mini` не обещает velocity-continuous physical spring;
- styling/common anatomy совместимы с Base UI Drawer, но полный behavioral
  drop-in (nested/indent/swipe-area) не заявляется;
- default modality manager не координирует чужой overlay stack без injected
  application driver;
- modern browser APIs используются без bundled polyfills.

Эти возможности не должны усложнять главный A → B.x transition protocol до
его стабилизации.

## 13. Definition of Done

Целевая версия готова, когда все acceptance criteria представлены
автоматическими unit/integration tests, а demo визуально демонстрирует:

1. Animated open и close.
2. A → B.1 с одновременным geometry, Body opacity crossfade и отдельной
   midpoint-peaked Body blur-surface.
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
