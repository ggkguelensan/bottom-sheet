# `@shell-sheet/react`

Статус: нормативный target contract v1.

## 1. Назначение

React adapter создаёт compound composition, монтирует singleton Portal/Popup,
регистрирует elements/regions в DOM adapter и предоставляет `ShellSheetApi`.
Он не дублирует snap algorithms, gesture mechanics, measurements, animation
lifecycle или business state.

## 2. Public anatomy

```tsx
<ShellSheet.Root>
  <ShellSheet.Trigger />
  <ShellSheet.Portal>
    <ShellSheet.Backdrop />
    <ShellSheet.Viewport>
      <ShellSheet.Popup>
        <ShellSheet.Content>
          <ShellSheet.Header />
          <ShellSheet.Body />
          <ShellSheet.Footer />
        </ShellSheet.Content>
      </ShellSheet.Popup>
    </ShellSheet.Viewport>
  </ShellSheet.Portal>
</ShellSheet.Root>
```

Дополнительные parts: `Handle`, `DragArea`, `Title`, `Description`, `Close`.
Common anatomy/props SHOULD совпадать с Base UI Drawer там, где совпадает
семантика. Shell-specific regions/target protocol не маскируются под Base API.

Default elements, styling callback state, attributes и CSS variables MUST
соответствовать [`../styling.md`](../styling.md).

## 3. Root state modes

Root предлагает три взаимоисключающих TypeScript-варианта.

### 3.1. Atomic target mode

Это основной режим для Effector/state machine:

```ts
type ShellSheetTargetRootProps<
  TSnap extends string,
  TRegionKey extends string,
> = {
  target: ShellSheetTarget<TSnap, TRegionKey>;
  controller?: ShellSheetController<TSnap, TRegionKey>;
  onRequest?(request: ShellSheetRequest<TSnap>): void;
  onFact?(fact: ShellSheetFact<TSnap, TRegionKey>): void;
  apiRef?: React.Ref<ShellSheetApi<TSnap, TRegionKey>>;

  open?: never;
  defaultOpen?: never;
  snapPoint?: never;
  defaultSnapPoint?: never;
};
```

Один React render передаёт atomic target. Adapter вызывает один
`controller.sync(target)` в commit/layout phase. Region layers из того же
render регистрируются до начала measurement; DOM coordinator ждёт keys target.

Если `controller` не передан, Root создаёт его один раз. Если передан, Root
синхронизирует именно этот controller, но не уничтожает caller-owned instance
при unmount.

### 3.2. External controller mode

Прямой `@shell-sheet/effector` binding может синхронизировать controller без
React. Тогда Root получает `controller`, но не `target`/convenience state props,
и читает authoritative target через `useSyncExternalStore`:

```ts
type ShellSheetControllerRootProps<
  TSnap extends string,
  TRegionKey extends string,
> = {
  controller: ShellSheetController<TSnap, TRegionKey>;
  target?: never;
  open?: never;
  defaultOpen?: never;
};
```

Controller identity стабильна на всё время mount; замена instance —
development error. Lifecycle controller принадлежит caller/Effector binding.
Root только создаёт/уничтожает DOM binding.

### 3.3. Base-shaped convenience mode

Для локальных простых случаев доступны Base UI-shaped props:

- `open` / `defaultOpen` / `onOpenChange(next, details)`;
- `snapPoints`, `snapPoint` / `defaultSnapPoint` /
  `onSnapPointChange(next, details)`;
- Base-compatible `modal?: boolean`, projected to core
  `modality: "modal" | "non-modal"`;
- `presentation`, `draggable`;
- `contentResizeBehavior`, `transition`;
- Base-compatible `onOpenChangeComplete(open)`;
- `onTransitionStatusChange` и Shell-specific `apiRef`.

React adapter владеет local target generation для uncontrolled axes и
проецирует весь набор в тот же atomic core `sync()` path. Core не имеет
отдельного uncontrolled режима. Controlled и default prop одной оси, либо
одновременные `target`, controller-only mode и convenience props, являются
TypeScript error где возможно и development warning как runtime fallback.

Convenience mode не гарантирует domain exhaustiveness. Для взаимосвязанных
`kind`, snap, presentation и region transitions application SHOULD использовать
atomic target mode.

`onOpenChange` сообщает request; `onOpenChangeComplete` вызывается только когда
latest accepted open/closed target получил terminal settle. Отклонённый request
не вызывает completion.

## 4. Composition

Каждый DOM primitive:

- forwards ref через React 18-compatible `forwardRef`;
- поддерживает Base-shaped `render` element/function composition;
- принимает function `className/style` от immutable public part state;
- объединяет internal и consumer handlers по documented cancellation order;
- публикует exact common `data-*` attributes;
- не импортирует theme CSS.

Public styling не зависит от internal classes. `Content` сохраняет Base UI
Drawer container meaning; Header/Body/Footer образуют Shell-specific layout.

`Portal` принимает `container` и `keepMounted`. При `keepMounted` один
Portal/Popup не remount между open cycles и presentation changes.

Compound structure не должен условно рендериться по `target.open`: open
управляет visibility/lifecycle. При open→closed region hosts замораживают
последние committed open layers до terminal close, даже если текущий
application renderer уже вернул empty closed content. Удаление всего Portal
родителем до terminal close нарушает contract и не может быть анимировано.

## 5. Region contract

В atomic target mode key и transition behavior
(`preserve|crossfade|replace`) читаются из `target.regions`; Header/Body/Footer
принимают только content/composition props и не дублируют target key.

В convenience mode regions MAY принимать `transitionKey` и `transition`, из
которых adapter строит local target. Если props не заданы, region имеет stable
default key и обновляется без crossfade. Передача region target props в atomic
mode является development error.

- Same key + preserve сохраняет один subtree и focus/local state.
- Changed key монтирует outgoing/incoming одновременно.
- Region не запускает timer; DOM coordinator запускает все changed regions
  вместе с Popup geometry.
- Standard Handle находится внутри Header host, но вне Header transition layer.
- Body — единственный default scroll viewport.
- Footer — отдельная pinned grid row.
- Cleanup регистрации token-safe для StrictMode и rapid replacement.
- Closed target не является новым empty region transition: hosts сохраняют
  последний visual content на exit и очищают его только после settled close,
  если `keepMounted` policy это допускает.

## 6. Imperative API

`ShellSheetApi` — порт, не store:

- `open()`, `close(reason)`, `toggle()`, `snapTo(id)` публикуют requests;
- `getSnapshot()`/`subscribe()` читают core snapshot/facts;
- readonly refs `rootElement`, `popupElement`, `bodyElement`;
- `refresh()` планирует explicit DOM remeasure.

Request method возвращает `requestId`, а не Promise принятия. В target mode
действие считается принятым только после нового target; visual completion
наблюдается по terminal fact. API не хранит `kind/uiContext`.

## 7. Accessibility

- Popup получает dialog semantics; Title или explicit accessible label
  обязателен.
- Title/Description регистрируют ids через context.
- Только active region layer находится в accessibility tree.
- Close публикует typed close reason.
- Handle с toggle semantics — keyboard-accessible button с актуальным label.
- Custom DragArea не получает ложную button semantics.
- `draggable=false` полностью удаляет default Handle и reserved space.
- Initial focus policy и modal/non-modal behavior принадлежат DOM adapter.

## 8. React lifecycle, SSR and hydration

- Core subscription использует `useSyncExternalStore` с cached immutable
  snapshot и `getServerSnapshot`.
- Render и server render не читают DOM/browser globals.
- Binding создаётся в layout phase только после обязательных refs.
- StrictMode setup/cleanup идемпотентны; stale ref cleanup не удаляет новый
  registration.
- Incoming Suspense не удаляет outgoing layer до измеримой readiness.
- Server/first-hydration snapshot совпадают.
- Portal v1 client-attached: после hydration `keepMounted` hidden subtree
  регистрируется, измеряется и только затем становится visible.
- Portal container можно передать явно; смена container во время active
  transition требует controlled teardown/rebind и не является animation.

Полный SSR contract находится в [`../platform.md`](../platform.md#5-ssr-and-hydration).

## 9. Dependencies

React/ReactDOM — peer dependencies. Package зависит от core/dom и не зависит
от Effector, Motion, Base UI или `motion/react`. Consumer подключает animation
driver явно или использует native DOM driver.

Primary fixture — React 18.3; React 19 проверяется compatibility fixture.

## 10. Tests

Tests MUST покрывать:

- atomic target, external controller и Base convenience modes;
- compile/runtime rejection смешанных modes;
- compound composition и Base-shaped callbacks;
- ref forwarding и handler cancellation order;
- singleton `keepMounted` и same-Popup presentation change;
- independent/stale-safe region identity;
- focus/accessibility во время crossfade;
- Suspense readiness;
- SSR/hydration и React StrictMode;
- `apiRef` request identity без implicit target mutation;
- отсутствие `motion/react`, Base UI runtime и bundled CSS imports.
