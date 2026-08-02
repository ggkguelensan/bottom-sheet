# `@shell-sheet/react`

## 1. Назначение

React adapter создаёт compound DOM composition, регистрирует refs/regions в
DOM adapter и предоставляет `ShellSheetApi`. Он остаётся тонким: snap,
gesture, measurement, animation lifecycle и business state не дублируются.

## 2. Public anatomy

Целевой API:

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
Common anatomy и prop naming SHOULD быть совместимы с Base UI Drawer там, где
семантика совпадает. Shell-specific extensions не маскируются под Base API.

Common default elements, state callbacks, attributes и CSS variables MUST
соответствовать [`../styling.md`](../styling.md).

## 3. Root contract

Root не создаёт DOM. Он владеет context, controller reference и coordinator
registration.

Controlled props:

- `targetId`;
- `open` / `onOpenChange(next, details)`;
- `snapPoints`, `snapPoint` / `onSnapPointChange(next, details)`;
- `presentation`, `modality`, `draggable`;
- `transition`;
- `contentResizeBehavior`;
- `onTransitionStatusChange`;
- `apiRef`.

Uncontrolled `defaultOpen/defaultSnapPoint` MAY использовать тот же controller
protocol. Нельзя одновременно передавать controlled и default значение одной
оси; dev mode предупреждает о конфликте.

## 4. Composition

Каждый DOM primitive:

- forwards ref;
- поддерживает `render` element/function composition;
- принимает function `className/style` от public part state;
- объединяет internal и consumer event handlers без потери accessibility;
- публикует exact Base-compatible `data-*` attributes для общей семантики;
- не импортирует theme CSS.

Public styling contract не зависит от internal `.shell-sheet-*` classes.
`Content` является Base-compatible container, внутри которого Shell-specific
Header/Body/Footer образуют layout regions.

`Portal` принимает `container` и `keepMounted`. Singleton Portal/Popup не
remount между open cycles при `keepMounted`.

## 5. Region contract

Header, Body и Footer принимают independent target:

```ts
type RegionProps = {
  transitionKey: React.Key;
  behavior?: "preserve" | "crossfade" | "replace";
  children: React.ReactNode;
};
```

- Same key + preserve сохраняет один subtree и focus/local state.
- Changed key монтирует outgoing/incoming одновременно.
- Region не запускает собственный timer; coordinator запускает все changed
  regions вместе с Popup geometry.
- Default Handle находится вне Header transition layer.
- Body является единственным default scroll region.
- Footer остаётся отдельной pinned grid row.

## 6. API ref

`ShellSheetApi` является port:

- request methods `open/close/toggle/snapTo`;
- `getSnapshot/subscribe`;
- DOM refs root/popup/body;
- `refresh()` для явного remeasure.

Methods не обещают принятие controlled request. Completion наблюдается по
target/fact protocol. Ref не хранит domain state.

## 7. Accessibility

- Popup получает dialog semantics, Title или explicit label обязателен.
- `Title/Description` регистрируют ids через context.
- Only active region layer находится в accessibility tree.
- `Close` публикует typed reason.
- Handle с toggle semantics является keyboard-accessible button с актуальным
  label; custom DragArea не получает ложную button semantics.
- `draggable=false` полностью удаляет default Handle и reserved space.

## 8. React lifecycle и SSR

- Controller subscription использует `useSyncExternalStore` с immutable
  snapshot и `getServerSnapshot`.
- Никакой DOM read во время render/server render.
- Binding создаётся в layout phase после регистрации обязательных refs.
- StrictMode setup/cleanup идемпотентны.
- Incoming Suspense не удаляет outgoing layer до готовности measurement.
- Portal hydration не показывает промежуточную неправильную высоту.

## 9. Dependencies

React и ReactDOM — peer dependencies. Package зависит от core/dom и не зависит
от Effector, Motion или `motion/react`. Consumer подключает animation driver
явно или использует native default DOM driver.

## 10. Tests

Tests MUST покрывать compound composition, controlled/uncontrolled warnings,
ref forwarding, singleton keepMounted, independent region identity, focus при
crossfade, Suspense readiness, SSR/hydration, StrictMode и apiRef requests.
