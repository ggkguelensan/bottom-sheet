# `@shell-sheet/dom`

Статус: нормативный target contract v1.

## 1. Назначение и граница

DOM adapter связывает `@shell-sheet/core` controller со стабильным HTMLElement
tree. Он является владельцем:

- element registration и visual-layer registry;
- measurements и viewport model;
- geometry/region/presentation transition coordinator;
- pointer gestures, velocity sampling и native scroll isolation;
- modality, focus, inert и scroll lock;
- projection public attributes, CSS variables и mechanic inline styles;
- browser lifecycle и cleanup.

DOM adapter MUST работать без React, Effector и application domain. Он не
решает бизнес-переходы, не хранит `kind/uiContext` и не выбирает новый
authoritative target после request.

## 2. Public binding surface

Public API:

```ts
type ShellSheetDomBinding<TSnap extends string, TRegionKey extends string> = {
  registerPart(part: ShellSheetPart, element: HTMLElement): () => void;
  registerRegionLayer(
    region: "header" | "body" | "footer",
    layer: ShellRegionLayer<TRegionKey>,
    element: HTMLElement,
  ): () => void;
  registerRegionTransitionSurface(
    region: "header" | "body" | "footer",
    element: HTMLElement,
  ): () => void;
  registerDragArea(element: HTMLElement, options?: DragAreaOptions): () => void;
  setInsets(insets: ShellSheetInsets): void;
  refresh(): void;
  getElements(): Readonly<ShellSheetElements>;
  destroy(): void;
};
```

Supporting public types:

```ts
type ShellSheetPart =
  | "portal"
  | "backdrop"
  | "viewport"
  | "popup"
  | "content"
  | "header"
  | "body"
  | "footer"
  | "handle"
  | "inert-target";

type ShellRegionLayer<TKey extends string> = {
  readonly key: TKey;
  readonly layer: "settled" | "outgoing" | "incoming";
};

type DragAreaOptions = {
  readonly id?: string;
};

type ShellSheetInsets = {
  readonly top: number;
  readonly bottom: number;
};

type ShellSheetElements = Readonly<{
  portal: HTMLElement | null;
  backdrop: HTMLElement | null;
  viewport: HTMLElement | null;
  popup: HTMLElement | null;
  content: HTMLElement | null;
  header: HTMLElement | null;
  body: HTMLElement | null;
  footer: HTMLElement | null;
  handle: HTMLElement | null;
  inertTarget: HTMLElement | null;
}>;
```

`bindShellSheetToDom` options содержат stable `animation`, gesture tuning,
optional modality drivers и optional injected `ShellSheetDomEnvironment`.
Production default environment лениво строится из document элемента Portal;
tests передают fake environment. Environment interface оборачивает только
реально nondeterministic browser seams: animation frames, computed style,
ResizeObserver, VisualViewport, matchMedia и document visibility.

Эти names составляют public v1 binding contract. Обязательны:

- маленький binding interface вместо exposed coordinator internals;
- explicit idempotent registration cleanup;
- dynamic registration/insets без полного teardown;
- controller передаётся в `bindShellSheetToDom(controller, options)` и не
  создаётся DOM adapter автоматически.

Browser environment, animation/modality drivers и gesture tuning передаются в
`bind` и стабильны на время binding. Dynamic application insets обновляет
только `setInsets`. Поля target (`presentation`, `modality`, `draggable`, snap
definitions) приходят только через core controller и не дублируются в options.

### 2.1. Единственный mutation owner

Binding является единственным владельцем mechanic DOM mutations экземпляра:
measured sizes/transforms, transition-layer visibility, lifecycle attributes,
pointer mechanics, focus/inert и scroll lock. React primitives и Effector
binding не пишут эти значения параллельно.

Controller subscription, registry cleanup, ResizeObserver, viewport и content
readiness только планируют coalesced transaction. Исключение — hot gesture
frame: он может записать ограниченный набор documented drag CSS variables и
Popup/Backdrop transforms, но не выполняет region swap, target settle или
application state update.

Animation driver получает готовые keyframes/options от coordinator. Он не
читает layout и не пишет stable state после terminal result. Так
`ARCH-DOM-01` сохраняет один transaction clock, а `ARCH-GESTURE-01` — один
локальный 60fps path.

## 3. Stable element anatomy

Binding регистрирует parts:

- Portal host;
- Backdrop;
- Viewport;
- Popup;
- Content/layout container;
- Header host;
- Body scroll viewport;
- Footer host;
- optional standard Handle;
- zero or more custom DragAreas;
- explicit inert target or inert siblings strategy.

`Root`, `Viewport`, `Popup`, region hosts и неизменившиеся region layers MUST
оставаться смонтированными при:

- open/close с `keepMounted`;
- A→B content transition;
- compact↔expanded;
- `sheet ↔ dialog`;
- modal↔non-modal.

Handle по умолчанию находится в Header host, но вне заменяемого Header layer.
Он учитывается в общей высоте Header и не измеряется второй раз. При
`draggable=false` hidden Handle не занимает layout space.

Popup и Content layout:

```css
.Popup {
  overflow: hidden;
  contain: layout paint;
}

.Content {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  block-size: 100%;
  min-block-size: 0;
}
```

Прокручивается только Body. Header и Footer закреплены к соответствующим
границам Popup и остаются там во время drag, snap, content resize и
presentation morph.

Эти Popup/Content/Body declarations являются обязательной mechanic layout,
которую adapter применяет без theme stylesheet. Consumer может стилизовать
поверхность, но override `display/grid rows/overflow/contain` снимает гарантию
pinned regions и считается unsupported customization.

## 4. Registry invariants

Header/Body/Footer независимо регистрируют:

- settled layer;
- outgoing layer;
- incoming layer.

Layer identity включает region key и registration token. Cleanup старой React
effect MUST удалять только элемент с тем же token; он не может снять более
новую регистрацию того же logical slot. Duplicate live registration одного
token/slot — development error.

Standard Handle и каждый DragArea регистрируются отдельно. Pointer session
запоминает фактический current target, а не предполагает один hardcoded Handle.

Coordinator не начинает transition, пока DOM registry не может представить
`authoritativeTarget.regions`. Пока incoming layer не готов, старый visual
target сохраняется и не возникает пустого frame.

Open transition требует Portal, Viewport, Popup, Content, Header, Body и Footer
hosts плюс все target region layers. Backdrop optional для non-modal appearance.
Modal target дополнительно требует Backdrop и explicit inert target/strategy.
Missing required part удерживает initial open hidden или сохраняет outgoing
visual; development mode сообщает actionable registration warning.

## 5. Measurement transaction

### 5.1 Geometry model

Natural content height:

```text
header border-box block-size
+ body natural scroll block-size
+ footer border-box block-size
```

Handle уже входит в Header. Body natural height измеряется без ограничения
текущего snap viewport. Transforms не входят в natural measurements.

Измерения используют fractional CSS pixels без преждевременного `Math.round`.
Для visual current geometry применяется `getBoundingClientRect()`. Для target
natural geometry применяются ResizeObserver `borderBoxSize`, с fallback на
`getBoundingClientRect()`, и `scrollHeight` там, где нужен intrinsic overflow.

Viewport snapshot:

```ts
type ShellSheetViewport = {
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
  scale: number;
};
```

При наличии используется `window.visualViewport`; fallback — layout viewport.
`setInsets` передаёт finite external reserved top/bottom space. Internal
safe-area padding через consumer `env(safe-area-inset-*)` измеряется как часть
Header/Footer и не вычитается повторно. Software keyboard учитывается через
VisualViewport, а не дублирующим bottom inset.

### 5.2 Read/write phases

Каждая visual transaction разделена:

1. **schedule** — controller/registry/observer events только ставят coalesced
   work;
2. **measure** — все DOM reads выполняются до writes;
3. **mutate/prepare** — target attributes, variables и invert styles
   записываются вместе;
4. **animate** — не раньше следующего animation frame запускаются drivers;
5. **settle** — transient styles удаляются, stable state проецируется вместе.

ResizeObserver callback MUST только копировать entries и планировать work. Он
не пишет layout styles. Binding наблюдает border box; изменение transform само
по себе не считается content resize.

Feedback loop предотвращается через transaction generation/origin и geometry
epsilon, а не отключением ResizeObserver на всё время animation. Несколько
events за frame коалесцируются в одно измерение.

Элементы для измерения не используют `display:none`. Hidden preparation
применяет `visibility:hidden`, отсутствие pointer events и/или offscreen
containment так, чтобы target layout был измерим и не мигал.

## 6. Transition coordinator

Один coordinator владеет geometry и всеми region transitions:

```text
idle → preparing → animating → settling → idle
                   ↘ replacing ↗
```

Для каждого visual attempt он:

1. читает latest core target и registry;
2. при interruption считывает current computed visual state, останавливает
   controls и pin-ит считанное значение;
3. вызывает tokenized `beginTransition(targetId)`, который terminal-replaces
   предыдущий active token;
4. измеряет current visible geometry и target geometry;
5. строит один transition plan для Popup, Backdrop и трёх regions;
6. начинает все изменившиеся channels в одном frame;
7. ждёт нормализованные driver results;
8. применяет terminal result только к своему `transitionId`;
9. очищает outgoing/transient state после settle или replacement.

Новый target, resize или presentation change прерывает attempt. Следующий plan
стартует от фактически видимой computed geometry, layer opacity и blur-surface,
а не от старого
settled target. Старый attempt получает ровно один `replaced`; его поздний
completion ничего не меняет.

Opening сначала измеряет open target в hidden preparation state, затем
анимирует из closed geometry. Closing сохраняет settled layers и semantics до
конца exit animation, после чего скрывает Popup. Поэтому mount/unmount никогда
не является самой open/close animation.

`motion: "instant"` и reduced-motion path проходят тот же lifecycle:
prepare → apply target → `transition-settled`. Они не являются cancellation.

## 7. Region transition semantics

Каждый region plan независим:

- `preserve` — key MUST совпадать; существует один и тот же subtree, без
  opacity crossfade и без blur-surface animation;
- `crossfade` — outgoing и incoming одновременно существуют; outgoing меняет
  opacity `1→0`, incoming `0→1`. Отдельная зарегистрированная transition-surface
  располагается поверх обоих слоёв и анимирует `backdrop-filter` по трём
  keyframes: `blur(0)` на 0%, `blur(2px)` на 50%, `blur(0)` на 100%;
- `replace` — outgoing сохраняется, пока incoming измерим; в start frame
  происходит semantic swap без crossfade, geometry Popup MAY анимироваться.

Semantic direction приходит из target intent. DOM не выводит direction из
высоты, declaration order или текста.

Только изменившиеся region keys переходят. Если A→B меняет Body, Header и
Footer остаются теми же DOM nodes и не blur-анимируются. Outgoing/inactive
layers получают `inert`, `aria-hidden="true"` и не участвуют в tab order.
Transition-surface всегда `aria-hidden`, не получает focus, имеет
`pointer-events:none` и не участвует в measurement/layout target. При
interruption новый blur plan стартует с её текущего computed visual state.

Body overflow может появиться после выбора snap. При
`contentResizeBehavior`:

- `animate` — geometry retargets от current visible size к новому content
  target;
- `immediate` — layout применяется мгновенно, lifecycle остаётся coherent;
- `keep-snap-and-scroll` — Popup сохраняет resolved snap height, Body начинает
  внутренний scroll.

## 8. Sheet ↔ dialog morph

Presentation transition использует тот же Popup, а не два условных компонента.
Алгоритм:

1. Прервать/reconcile active pointer drag.
2. Считать current visible Popup rect и computed border radii/backdrop state.
3. В hidden prepare transaction применить target presentation/layout и
   измерить final rect.
4. Инвертировать target layout к current rect через temporary translate и
   старые inline/block sizes. Текст не масштабировать.
5. На следующем frame анимировать translate + inline/block sizes, computed
   radii и Backdrop к target.
6. На settle удалить transient overrides, оставив consumer CSS target state.

Анимация width/height — сознательное contained-layout исключение: Popup имеет
`contain: layout paint`, а transaction batching предотвращает layout thrash.
Scale для контента запрещён из-за искажения typography. Во время morph Header
и Footer продолжают быть pinned, Body остаётся единственным scroll viewport.

На Viewport/Popup доступен target `data-presentation="sheet|dialog"`; на Popup
одновременно доступны `data-from-presentation`,
`data-to-presentation` и `data-transitioning`; exact ownership описан в
[`../styling.md`](../styling.md).

Responsive choice не делается DOM adapter. Application/Effector синхронизирует
реальный `presentation` target. Первая hydration media correction MAY быть
instant по [`../platform.md`](../platform.md); последующие изменения morph с
animation.

## 9. Animation driver contract

DOM package поставляет native WAAPI driver. Общий contract:

```ts
type ShellAnimationResult =
  | { status: "finished" }
  | { status: "cancelled" };

type ShellAnimationControls = {
  finished: Promise<ShellAnimationResult>;
  stop(): void;
};

type ShellAnimationOptions = {
  readonly durationMs: number;
  readonly easing: string;
};

type ShellAnimationDriver = {
  animate(
    element: HTMLElement,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options: ShellAnimationOptions,
  ): ShellAnimationControls;
};
```

- `finished` никогда не reject для штатной cancellation.
- Driver переводит platform cancellation/rejection в `{status:"cancelled"}`;
  programmer error MAY reject/throw до возврата controls.
- `stop()` idempotent.
- Driver не измеряет DOM, не выбирает keyframes/snap point и не публикует core
  facts.
- Coordinator решает, трактовать cancelled result как replacement или
  cancellation текущего transition token.
- Coordinator читает documented timing CSS variables один раз в preparation
  transaction, валидирует time/easing и строит explicit driver options.
- Driver остаётся единственным clock для mechanic properties; concurrent
  consumer CSS transition этих properties является contract violation.
- Native/Motion adapters удерживают final keyframe только до coordinator
  settle; затем stable inline/CSS-variable state pin-ится, controls очищаются и
  browser Animation не остаётся attached бессрочно.

Native driver и `@shell-sheet/motion` реализуют один contract. Motion mini
driver duration/easing-based; v1 не обещает velocity-continuous physical spring.

## 10. Gesture session

### 10.1 Start and capture

- `touch-action: pan-x` на vertical Handle/DragArea задаётся **до**
  `pointerdown`; один `preventDefault()` не может отменить browser pan/zoom
  после начала gesture. Body сохраняет native `touch-action: pan-y`.
- Session начинается pending. После axis intent и threshold около 8–10 CSS px
  принимается vertical drag и вызывается pointer capture.
- До threshold обычный click/interactive control продолжает работать.
- Одновременно принимается один primary pointer; остальные игнорируются.
- Interactive descendants и `data-shell-sheet-drag-ignore` не начинают drag.
- При наличии используются `getCoalescedEvents()` для velocity sampling.

`lostpointercapture`, `pointercancel`, page visibility loss, target replacement
и destroy завершают session явной cancellation/reconciliation.

### 10.2 Scroll boundary

V1 гарантирует sheet drag только от registered Handle/DragArea. Body сохраняет
native browser scrolling и по умолчанию не является DragArea. Это осознанный
компромисс: Pointer Events определяют `touch-action` до gesture, поэтому
надёжный cross-browser handoff от native vertical scroll к sheet в середине
того же touch gesture нельзя обещать одновременно с native Body scrolling.

DragArea SHOULD находиться вне Body scroll viewport (Header, media overlay,
custom chrome). Если DragArea является предком native vertical scroller,
pointer targets внутри scroller/interactive subtree не начинают sheet drag.
Будущий explicit managed-scroll driver MAY добавить content-surface handoff
после отдельных WebKit/Chromium contract tests; это не v1 behavior.

Standard Handle MAY иметь доступный click/keyboard snap toggle. Custom
DragArea по умолчанию даёт только pointer semantics и не получает
необоснованную button role.

При `draggable=false` Handle скрыт по component contract, DragAreas не
активируются, а открытая content-sized поверхность остаётся неподвижной.

### 10.3 Move and release

Pointer move обновляет только DOM-local session, Popup/Backdrop mechanic CSS
variables и scheduled animation frame. Он не вызывает core subscriber,
Effector event или React render на каждом frame.

За границами применяется core `applyRubberBand`. На release DOM передаёт
velocity/current geometry в pure `selectReleaseDestination`, затем публикует один
`snap-requested` или `close-requested`. После request:

- если application синхронно прислал новый target, coordinator движется к
  нему;
- иначе Popup reconciles к последнему authoritative target;
- визуальное состояние никогда не остаётся в неподтверждённом proposal.

## 11. Modality, focus and scroll lock

Modal target:

- Popup имеет `role="dialog"` и `aria-modal="true"`;
- accessible name обязателен через Title или explicit label;
- background inert;
- document scroll locked без layout jump;
- focus перемещается внутрь по explicit initial-focus policy, удерживается и
  после close восстанавливается, если previous element ещё connected;
- Escape/Backdrop создают cancelable close request.

Initial focus не всегда первый action: для крупного semantic content SHOULD
фокусироваться статический heading/container с `tabindex="-1"`, чтобы начало
контента не прокрутилось за viewport.

Non-modal target не устанавливает `aria-modal`, inert или focus trap, не
блокирует page scroll, а Backdrop не перехватывает pointer events background
content.

Modality transition timing:

- non-modal→modal: запомнить previous focus, acquire inert/scroll lock и
  применить focus policy до первого visible morph frame;
- modal→non-modal/closed: сохранить protections до terminal morph/exit frame,
  затем release/restore;
- replacement на другой modal target не делает промежуточный unlock.

Inert/scroll lock manager document-scoped и reference-counted. Он сохраняет и
восстанавливает exact previous inline values/scroll position; property
восстанавливается только если её current value всё ещё совпадает с
library-owned value, чтобы не затереть более позднюю external mutation.
StrictMode cleanup одного binding не может разблокировать другой active
Shell Sheet. Inert scope задаётся explicit target/siblings policy, а не
неограниченным поиском по документу.

Environment MAY принять application-owned `scrollLock`/`backgroundIsolation`
drivers. Они нужны, если Shell Sheet должен разделять один overlay stack с
другой библиотекой (например Base UI Dialog). Default manager координирует все
Shell Sheet instances одного document, но не заявляет ownership над чужим
overlay manager. Nested cross-library modal stacks требуют явной application
policy и находятся вне automatic v1 contract.

## 12. Viewport and browser lifecycle

Binding слушает только необходимые signals:

- ResizeObserver для registered boxes;
- VisualViewport resize/scroll;
- window resize/orientation fallback;
- pointer capture/cancel;
- document visibility/focus events, когда они нужны active mode.

Software keyboard и VisualViewport offset участвуют в available rect. Binding
не предполагает, что viewport origin всегда `(0, 0)`.

Import пакета side-effect free. Все globals читаются из injected/browser
environment только во время `bind`. Это позволяет SSR import и deterministic
fake-environment tests.

`bind` runtime-валидирует обязательные environment capabilities и бросает
descriptive unsupported-platform error до регистрации side effects. Library не
устанавливает polyfills и не деградирует молча в частично работающий gesture/
modality mode.

`destroy()` идемпотентно:

- unsubscribes controller;
- disconnects observers и event listeners;
- cancels scheduled frames и animations;
- cancels active gesture;
- releases owned inert/scroll locks;
- restores mechanic styles/attributes, которые adapter изменил;
- invalidates registration cleanup tokens.

После destroy registration, `setInsets` и `refresh` бросают descriptive error;
старые cleanup functions и повторный destroy остаются безопасными no-op.
`getElements()` возвращает stable all-null object, не dangling HTMLElements.

## 13. Styling projection

Exact tags, state attributes, CSS variables и consumer function-prop state
определяет [`../styling.md`](../styling.md). DOM adapter обязан проецировать их
в той же mutate transaction, что и фактическую geometry.

Base UI-compatible имена (`data-open`, `data-starting-style`,
`--drawer-height`, `--drawer-swipe-movement-y`) используются там, где semantic
совпадает. Shell Sheet-specific region/presentation states не маскируются
неточными Base aliases.

Library inline styles ограничены mechanics: measured sizes, transforms,
overflow coordination, visibility preparation, pointer/touch mechanics и
interpolируемые computed values во время transition. Theme остаётся consumer
CSS variables.

## 14. Recommended internal modules

```text
src/
├── bind.ts                    # public binding orchestration
├── registry.ts                # parts, region layers and drag areas
├── measurement.ts             # read-only measurement transaction
├── viewport.ts                # VisualViewport model
├── coordinator.ts             # plan, interruption and terminal tokens
├── presentation-morph.ts      # FLIP-like rect morph without scale
├── gesture-session.ts         # pointer, velocity and scroll isolation
├── modality-manager.ts        # focus, inert, document-scoped locks
├── styling-projection.ts      # attributes, variables, mechanic styles
├── native-animation.ts        # WAAPI driver
├── environment.ts             # injectable browser boundaries
├── types.ts
└── index.ts
```

Это внутренние границы, не обязательные subpath exports. Не следует превращать
их в универсальный overlay framework до появления второго реального consumer.

## 15. Contract and browser tests

До v1 tests MUST доказать:

- dynamic/stale-safe registry и unchanged layer preservation;
- content height без Handle double count;
- fractional measurements, VisualViewport offsets и safe areas;
- read-before-write batching и ResizeObserver feedback protection;
- content-sized animated opening и content-preserving closing;
- independent Header/Body/Footer preserve/crossfade/replace;
- A→B→C interruption от current visual geometry и stale driver completion;
- `sheet ↔ dialog` morph того же Popup без text scale/remount;
- pinned Header/Footer и only-Body scroll на всех phases;
- touch-action, threshold, pointer capture/cancel/lost capture;
- native Body scroll isolation, DragArea boundary и multi-pointer ignore;
- отсутствие per-frame core/Effector/React publications;
- rejected proposal reconciliation;
- modal/non-modal timing, focus trap/restore, nested lock ownership;
- software keyboard/VisualViewport behavior в WebKit и Chromium;
- normalized native/Motion driver cancellation и reduced motion settle;
- exact styling hooks и idempotent destroy;
- SSR-safe import без browser globals.

## 16. Primary platform references

- [Pointer Events](https://www.w3.org/TR/pointerevents/)
- [Resize Observer](https://www.w3.org/TR/resize-observer/)
- [CSSOM View / VisualViewport](https://www.w3.org/TR/cssom-view/)
- [Web Animations `finished`](https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished)
- [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
