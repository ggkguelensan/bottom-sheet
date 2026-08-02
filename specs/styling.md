# Styling and Base UI Drawer compatibility

Статус: нормативный styling contract v1.

Цель — позволить переносить mental model и значительную часть styling recipes
из Base UI Drawer в Shell Sheet без runtime dependency от Base UI. Reference
version: Base UI `1.6.0`, проверено 2026-08-02.

Источники:

- [Base UI styling handbook](https://base-ui.com/react/handbook/styling);
- [Base UI Drawer API](https://base-ui.com/react/components/drawer);
- [Base UI Drawer source](https://github.com/mui/base-ui/tree/v1.6.0/packages/react/src/drawer).

## 1. Compatibility goal

Shell Sheet MUST совпадать с Base UI для общей drawer-семантики:

- unstyled primitives без bundled theme CSS;
- `className`, `style` и `render` signatures;
- default HTML elements;
- common part state shape;
- common `data-*` attributes;
- common `--drawer-*` CSS variables и их единицы/смысл;
- controlled/uncontrolled visual states;
- `nativeButton` для button primitives;
- `data-base-ui-swipe-ignore` как opt-out gesture attribute.

Shell-specific возможности добавляются отдельными parts/state/hooks и не
переопределяют смысл Base-compatible имён.

Это styling compatibility, а не утверждение, что любой Base UI Drawer prop или
nested behavior уже реализован. Functional compatibility matrix фиксируется в
`modules/react.md`.

## 2. Unstyled contract

`@shell-sheet/react` MUST NOT импортировать default stylesheet или задавать
theme values: colors, radii, shadows, typography, spacing и z-index принадлежат
consumer.

Internal inline styles разрешены только для механики, которую вычисляет
движок: measured block-size, current transform, visibility during measurement,
pointer capture и accessibility hiding. Consumer styling не должен зависеть от
внутренних class names.

`.shell-sheet-*` classes MAY существовать как debug/legacy hooks, но не являются
стабильным public API v1. Public hooks — props, part state, attributes и CSS
variables из этого документа.

## 3. Общий React styling API

Каждый part, который рендерит DOM element, использует Base UI-shaped types:

```ts
type ShellSheetClassName<State> =
  | string
  | ((state: State) => string | undefined);

type ShellSheetStyle<State> =
  | React.CSSProperties
  | ((state: State) => React.CSSProperties | undefined);

type ShellSheetRender<State> =
  | React.ReactElement
  | ((props: React.HTMLAttributes<HTMLElement>, state: State) => React.ReactElement);
```

- Function `className`, `style` и `render` получают один и тот же immutable
  state одного render.
- `render` принимает готовые internal HTML props первым аргументом и state
  вторым.
- Consumer element/function заменяет default tag без дополнительной wrapper.
- Internal и consumer refs объединяются.
- Event handlers объединяются; consumer может отменить библиотечное действие
  через event-details contract, но не удаляет обязательные ARIA props случайно.
- `className` и `style` из consumer объединяются с props `render` element по тем
  же правилам composition, которые будут зафиксированы conformance tests.
- Public types экспортируются и как top-level aliases, и в namespace part:
  `ShellSheetPopupProps`, `ShellSheet.Popup.Props`,
  `ShellSheetPopupState`, `ShellSheet.Popup.State`.

## 4. Default elements и parts

| Shell Sheet part | Default element | Base UI counterpart | Статус |
| --- | --- | --- | --- |
| `Root` | none | `Drawer.Root` | compatible common props |
| `Trigger` | `button` | `Drawer.Trigger` | compatible |
| `Portal` | `div` in portal | `Drawer.Portal` | compatible |
| `Backdrop` | `div` | `Drawer.Backdrop` | compatible; не button |
| `Viewport` | `div` | `Drawer.Viewport` | compatible |
| `Popup` | `div` | `Drawer.Popup` | compatible styling state |
| `Content` | `div` | `Drawer.Content` | compatible |
| `Title` | `h2` | `Drawer.Title` | compatible |
| `Description` | `p` | `Drawer.Description` | compatible |
| `Close` | `button` | `Drawer.Close` | compatible |
| `Header` | `div` | extension | Shell-specific region |
| `Body` | `div` | extension | Shell-specific scroll region |
| `Footer` | `div` | extension | Shell-specific pinned region |
| `Handle` | `button` | extension | accessible snap/drag control |
| `DragArea` | `div` | extension | pointer-only drag initiator |

`Trigger`, `Close` и `Handle` поддерживают `nativeButton?: boolean`, default
`true`. Если `render` заменяет их на non-button, consumer передаёт
`nativeButton={false}`, а part сохраняет необходимую keyboard/ARIA semantics.

Target composition:

```tsx
<ShellSheet.Root>
  <ShellSheet.Trigger />
  <ShellSheet.Portal>
    <ShellSheet.Backdrop />
    <ShellSheet.Viewport>
      <ShellSheet.Popup>
        <ShellSheet.Content>
          <ShellSheet.Header>
            <ShellSheet.Handle />
          </ShellSheet.Header>
          <ShellSheet.Body />
          <ShellSheet.Footer />
        </ShellSheet.Content>
      </ShellSheet.Popup>
    </ShellSheet.Viewport>
  </ShellSheet.Portal>
</ShellSheet.Root>
```

`Content` сохраняет Base UI meaning: container content разрешает text
selection и участвует в mouse swipe arbitration. Header/Body/Footer добавляют
layout и transition semantics внутри него.

## 5. Base-compatible part states

```ts
type TransitionStatus = "starting" | "ending" | undefined;

type ShellSheetTriggerState = {
  disabled: boolean;
  open: boolean;
};

type ShellSheetBackdropState = {
  open: boolean;
  transitionStatus: TransitionStatus;
};

type ShellSheetViewportState = {
  open: boolean;
  transitionStatus: TransitionStatus;
  nested: boolean;
  nestedDialogOpen: boolean;
};

type ShellSheetPopupState = {
  open: boolean;
  transitionStatus: TransitionStatus;
  expanded: boolean;
  nested: boolean;
  nestedDrawerOpen: boolean;
  nestedDrawerSwiping: boolean;
  swipeDirection: "up" | "down" | "left" | "right";
  swiping: boolean;
};

type ShellSheetCloseState = {
  disabled: boolean;
};
```

В v1 nested drawers находятся вне functional scope, поэтому nested fields
имеют стабильные false/zero values. Они присутствуют ради styling/type
portability и не обещают nested behavior.

`Portal`, `Content`, `Title` и `Description` имеют empty state `{}` как Base UI.

Shell-specific regions расширяют общий visual state:

```ts
type ShellSheetRegionState = {
  open: boolean;
  transitionStatus: TransitionStatus;
  region: "header" | "body" | "footer";
  layer: "settled" | "outgoing" | "incoming";
  active: boolean;
};

type ShellSheetHandleState = {
  disabled: boolean;
  expanded: boolean;
  swiping: boolean;
};
```

## 6. Base-compatible data attributes

Boolean attributes присутствуют без строкового `"true"` и отсутствуют в false
state.

### Backdrop

- `data-open` / `data-closed`;
- `data-starting-style`;
- `data-ending-style`.

### Viewport

- `data-open` / `data-closed`;
- `data-nested`;
- `data-starting-style`;
- `data-ending-style`.

### Popup

- `data-open` / `data-closed`;
- `data-expanded`;
- `data-nested-drawer-open`;
- `data-nested-drawer-swiping`;
- `data-swipe-direction="up|down|left|right"`;
- `data-swipe-dismiss`;
- `data-swiping`;
- `data-starting-style`;
- `data-ending-style`.

### Gesture opt-out

`data-base-ui-swipe-ignore` MUST отключать drawer/sheet gesture для element и
его subtree. Existing `data-shell-sheet-drag-ignore` поддерживается как
Shell-specific alias; оба атрибута имеют одинаковый результат.

### Shell-specific region attributes

- `data-region="header|body|footer"`;
- `data-layer="settled|outgoing|incoming"`;
- `data-active` на active layer;
- `data-starting-style` на incoming layer;
- `data-ending-style` на outgoing layer;
- `data-transitioning` на region host во время crossfade;
- `data-presentation="sheet|dialog"` и `data-modality="modal|non-modal"` на
  Popup/Viewport, где это полезно для styling.

Нельзя вводить альтернативный attribute для уже существующей Base UI
семантики (`data-entering` вместо `data-starting-style`, например).

## 7. Base-compatible CSS variables

Общие variables используют точные Base UI names:

| Element | Variable | Contract |
| --- | --- | --- |
| Backdrop | `--drawer-swipe-progress` | unitless `0..1` progress dismissal gesture |
| Viewport | `--drawer-keyboard-inset` | CSS length от нижней границы layout viewport; fallback consumer всегда указывает сам |
| Popup | `--drawer-height` | measured popup block-size как CSS length |
| Popup | `--drawer-frontmost-height` | frontmost height; в v1 равно `--drawer-height` |
| Popup | `--drawer-snap-point-offset` | CSS length offset активной snap point |
| Popup | `--drawer-swipe-movement-x` | CSS length текущего X gesture movement |
| Popup | `--drawer-swipe-movement-y` | CSS length текущего Y gesture movement |
| Popup | `--drawer-swipe-strength` | unitless `0.1..1` release-duration scalar |
| Popup | `--nested-drawers` | integer stack depth; `0` в v1 |

Variables присутствуют с валидным initial value до первого gesture, чтобы
consumer CSS не становился invalid. Для bottom sheet:

```css
.Popup {
  height: var(--drawer-height);
  transform: translateY(
    calc(var(--drawer-snap-point-offset) + var(--drawer-swipe-movement-y))
  );
}

.Backdrop {
  opacity: calc(0.4 * (1 - var(--drawer-swipe-progress)));
}
```

Shell-specific values используют отдельный prefix и не дублируют Base names:

- `--shell-sheet-header-height`;
- `--shell-sheet-body-natural-height`;
- `--shell-sheet-footer-height`;
- `--shell-sheet-target-height`;
- `--shell-sheet-region-duration`.

Prototype variable `--shell-sheet-height` заменяется
`--drawer-height`; после v1 она не является public contract.

## 8. Animation styling contract

Consumer может использовать Base UI selectors:

```css
.Popup,
.Backdrop {
  transition-duration: 280ms;
  transition-timing-function: cubic-bezier(0.32, 0.72, 0, 1);
}

.Popup[data-starting-style],
.Popup[data-ending-style] {
  transform: translateY(100%);
}

.Backdrop[data-starting-style],
.Backdrop[data-ending-style] {
  opacity: 0;
}

.Popup[data-swiping],
.Backdrop[data-swiping] {
  transition-duration: 0ms;
}
```

Driver-owned motion и CSS hooks MUST describe the same phase in the same frame.
Inline mechanic styles не должны блокировать consumer opacity, color, shadow,
radius or backdrop-filter transitions.

Region layers переиспользуют `data-starting-style/data-ending-style`, но их
geometry и blur синхронизирует единый coordinator.

## 9. Compatibility matrix

| Base UI contract | Shell Sheet v1 target |
| --- | --- |
| Unstyled/headless parts | MUST match |
| `render/className/style` function API | MUST match signatures |
| Default common HTML elements | MUST match |
| Common state fields | MUST match; nested fields stable false in v1 |
| Common `data-*` attributes | MUST match meaning/timing |
| Common `--drawer-*` variables | MUST match name, unit and meaning |
| `nativeButton` | MUST match on common button parts; extended to Handle |
| `data-base-ui-swipe-ignore` | MUST work |
| Full Root prop compatibility | Tracked separately; not implied by styling compatibility |
| Nested/Indent/SwipeArea behavior | Outside v1, no false claim of support |

## 10. Conformance tests

- Type fixtures compile Base-shaped `render/className/style` callbacks.
- DOM snapshots assert exact default tags and boolean attribute presence.
- Popup state fixture asserts Base-compatible common fields.
- CSS variable tests assert names, units, initial values and update timing.
- A copied Base UI bottom-drawer styling recipe works after replacing only the
  component import/name.
- Region tests assert incoming/outgoing attributes and unchanged-region DOM
  identity.
- Static test ensures `@shell-sheet/react` imports no CSS.
- Migration test ensures internal/legacy classes are not required for behavior.
