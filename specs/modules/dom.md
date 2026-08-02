# `@shell-sheet/dom`

## 1. Назначение

DOM adapter связывает core controller с HTMLElement tree. Он владеет
measurements, visual transition coordinator, gestures, viewport, focus,
modality и scroll lock. Он MUST работать без React и Effector.

## 2. Element contract

Binding получает зарегистрированные parts:

- root/portal host;
- backdrop;
- viewport;
- popup;
- header;
- body и body scroll viewport;
- footer;
- standard handle;
- zero or more custom drag areas;
- optional inert target.

Header/Body/Footer регистрируют settled и incoming layers независимо. Standard
Handle по умолчанию принадлежит Header layout, но находится вне меняющегося
header transition layer.

## 3. Measurements

Natural content height:

```text
header block-size + body natural block-size + footer block-size
```

Resolution учитывает VisualViewport, safe-area/insets и configured min/max.
Measurement layer не использует `display:none`. ResizeObserver events
коалесцируются; binding предотвращает self-induced feedback loop.

Popup использует `grid-template-rows: auto minmax(0, 1fr) auto`. Прокручивается
только Body. Footer остаётся у нижней границы во время snap и drag.

## 4. Transition coordinator

Один coordinator управляет Popup geometry и тремя region transitions:

```text
idle → preparing → animating → settling → idle
```

Он MUST:

- оставить outgoing layers до готовности incoming;
- измерить все next regions до первого visible target frame;
- начать geometry и changed-region motion в одном frame;
- сохранить unchanged regions одним DOM subtree;
- применять semantic direction из target, не угадывать её;
- cancel/retarget от текущей computed geometry;
- нормализовать terminal result и защитить settle transition token;
- реализовать `ContentResizeBehavior` из architecture spec.

Opening измеряет target до входа. Closing сохраняет content до конца exit.

## 5. Animation driver contract

Driver принимает element, explicit keyframes и duration/easing. Controls
предоставляют `finished` и idempotent `stop`. DOM adapter переводит cancel или
rejected finished promise в нормальный `cancelled/replaced` lifecycle.

Default native driver использует WAAPI. Reduced motion удаляет spatial/blur
движение, но сохраняет короткий понятный opacity/lifecycle transition.

## 6. Gestures и scroll arbitration

- Pointer capture обязателен после принятого pointerdown.
- Одновременно обрабатывается один pointer.
- Drag начинается с текущей visible geometry.
- Интерактивные descendants и `data-shell-sheet-drag-ignore` игнорируются.
- Body scroll имеет приоритет, пока он может прокручиваться в направлении
  gesture; после boundary управление может перейти sheet drag.
- Velocity, distance threshold, damping и snap selection настраиваются.
- Gesture release публикует proposal; controlled target не мутируется.
- `draggable=false` отключает handle и все custom drag areas.

Standard Handle MAY иметь click/keyboard snap-toggle semantics. Custom DragArea
имеет только pointer drag semantics.

## 7. Modality и accessibility

Modal mode:

- background inert;
- page scroll locked без layout jump;
- focus перемещается внутрь, удерживается и восстанавливается;
- Escape/backdrop создают cancelable close request;
- Popup имеет dialog semantics и accessible name.

Non-modal mode не делает background inert и не trap focus. Во время region
crossfade outgoing/inactive layers получают `aria-hidden` и `inert`; в
accessibility tree остаётся один Title, Description и набор controls.

## 8. Viewport lifecycle

Binding реагирует на VisualViewport resize/offset, orientation, safe areas и
software keyboard. Presentation/modality/options обновляются без teardown.
Destroy снимает observers/listeners, отменяет animations и восстанавливает
focus, inert и scroll styles идемпотентно.

## 9. Public DOM state

Binding реализует exact attributes и variables из
[`../styling.md`](../styling.md). Для общей drawer-семантики используются Base
UI names (`data-open`, `data-starting-style`, `--drawer-height`,
`--drawer-swipe-movement-y`), а не альтернативные Shell Sheet synonyms.

Inline mechanic styles и public CSS variables обновляются одной visual
transaction, чтобы function state, selectors и фактическая geometry не
расходились по frames. Shell-specific measurement variables не дублируют
Base-compatible values.

## 10. Tests

Tests MUST покрывать measurements трёх regions, content-size open, animated
close, changed/unchanged regions, drag/scroll arbitration, pointer cancel,
rejected proposal return, ResizeObserver retarget, focus/inert restoration,
Escape reasons, reduced motion, Base-compatible styling hooks и idempotent
destroy.
