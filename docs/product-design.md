# Product design: adaptive ticket widget

## 1. Why the bottom sheet exists

The bottom sheet is the adaptive control surface for a ticket-selection widget.
The primary experience remains the venue map or the position list; the sheet
shows only the actions and details required by the current domain context.

The widget variant has two fixed constraints:

1. Its height is derived from the rendered content and capped by the available
   viewport.
2. A user cannot drag the sheet to change its height. Content changes are the
   only reason for a height transition.

The generic engine may still support draggable snap points for other products.
The ticket widget preset uses a single `content` snap point and
`draggable: false`.

## 2. Interaction modes

Modality is a property of the presented sheet screen, not a different widget.

| Mode | Backdrop | Content outside the sheet | Focus and scrolling |
| --- | --- | --- | --- |
| `modal` | Dimmed and blurred | Unavailable and inert | Focus is trapped; page scroll is locked |
| `non-modal` | Optional visual layer only | Available and interactive | No focus trap or page scroll lock |

In non-modal mode the overlay root must not intercept map input outside the
sheet. CSS should use `pointer-events: none` on the overlay and
`pointer-events: auto` on the sheet surface. In modal mode the backdrop receives
input and may close the sheet.

## 3. Contexts are independent scenarios

`cinema`, `theatre`, `stadium`, `noSeating`, and `p2pPending` are not steps in a
single flow. Exactly one context is selected from the route/event/product data
with which the user entered the widget.

```ts
type WidgetContext =
  | { kind: "cinema"; cinema: CinemaContext }
  | { kind: "theatre"; theatre: TheatreContext }
  | { kind: "stadium"; stadium: StadiumContext }
  | { kind: "noSeating"; inventory: NoSeatingContext }
  | { kind: "p2pPending"; requirementsVersion: null };
```

The context chooses the map/list renderer, sheet screen union, pricing UI and
selection rules. It must never be implemented as
`cinema → theatre → stadium → noSeating → p2p` navigation.

## 4. Scenario matrix

### Cinema

- One hall and one sector.
- No price legend and no price badges over seats.
- Seat color is rendered directly on the seat.
- Seat details appear after selecting the seat.
- The map has no decorative sector backgrounds.
- Seats are compact numbered squares.
- The canvas also renders the screen, exits and row labels.
- Future showtime navigation may change both time and hall. The central header
  control therefore contains hall information as well as session context.

### Theatre

- A hall may contain one or multiple sectors.
- With zero or one tariff, no price legend is rendered.
- With 2–6 tariffs, render a horizontally scrollable price legend immediately
  below the header.
- With more than six tariffs, render a header action that opens tariff filters.

### Stadium

- A hall contains multiple sectors.
- A sector may have assigned seating or may be general admission.
- The price-legend thresholds are identical to Theatre: none for 0–1,
  horizontal rail for 2–6, header filter action for more than six.
- Selecting a general-admission sector hands control to a list/quantity screen
  rather than attempting to render seats.

### No seating

- No graphical map is rendered.
- The main content is a list of inventory positions grouped by tariff and price
  category.
- Selection and quantity controls are rendered through content-driven sheet
  screens or list rows according to the host product composition.

### P2P

- Requirements are not yet stable.
- The public context union reserves `p2pPending`, but production behavior is
  feature-gated until the requirements and acceptance criteria are approved.

## 5. Cinema demo: first complete vertical slice

### Layout

```text
┌──────────────────────────────────────────────┐
│ Header: navigation | session + hall | cart   │
├──────────────────────────────────────────────┤
│                                              │
│ Full-page interactive WebGL seating canvas  │
│ screen · exits · row labels · square seats  │
│                                              │
├──────────────────────────────────────────────┤
│ Content-sized, non-draggable bottom sheet   │
└──────────────────────────────────────────────┘
```

The map supports pan and zoom. Sheet pointer handling must be limited to the
sheet rectangle so a non-modal sheet does not block WebGL interaction.

### Sheet screens

```ts
type CinemaSheetScreen =
  | {
      id: "start";
      uiData: { primaryAction: Action; secondaryAction: Action };
    }
  | {
      id: "seatInfo";
      uiData: { seat: Seat; selectableTariffs: readonly Tariff[] };
    }
  | {
      id: "tariffChoice";
      uiData: { seat: Seat; tariffs: readonly Tariff[]; selectedId: string };
    }
  | {
      id: "cart";
      uiData: { tickets: readonly Ticket[] };
    };
```

- Initial state contains two configurable actions.
- Selecting a seat with multiple valid categories opens `tariffChoice`.
- If no category choice is necessary, `seatInfo` shows the seat information and
  a direct Add action.
- Added tickets are presented as a horizontally scrollable cart rail.
- A screen declares whether it is modal or non-modal; modality is not inferred
  from its visual height.

### Pricing decision

```ts
function pricingPresentation(tariffCount: number) {
  if (tariffCount <= 1) return "none";
  if (tariffCount <= 6) return "horizontal-legend";
  return "header-filter-action";
}
```

Cinema intentionally overrides this shared presentation and never shows the
legend; price/category information is shown only in the selected-seat flow.

## 6. State ownership and Effector

Effector owns durable product state:

- active widget context;
- current sheet screen and its typed `uiData`;
- open state and modality;
- selected session and hall;
- selected seats and tariff choices;
- cart tickets;
- async inventory/loading/error state.

The controller owns transient interaction state such as an in-progress
animation. The WebGL renderer owns camera state and GPU resources.

```text
route/product data → WidgetContext store
seat hit-test      → seatPressed event
Effector           → CinemaSheetScreen + cart
controller.sync    → content/height transition
DOM measurement    → CSS --bottom-sheet-height
canvas host        → safe interactive viewport
```

The renderer and the sheet communicate through domain events and typed data,
not by querying each other's DOM.

## 7. Package boundaries

Current packages:

- `core`: controller, snapshots and snap/content sizing algorithms;
- `dom`: measurement, modal/non-modal behavior, focus, viewport and gestures;
- `motion`: `motion/mini` animation driver;
- `effector`: optional direct controlled binding.

Planned adapters:

- `react`: thin compound-component/ref adapter; no duplicated state machine;
- `widget-cinema`: Cinema screen union, Effector model and WebGL integration;
- later context packages for Theatre, Stadium and No seating.

The WebGL renderer must remain replaceable. The bottom-sheet packages do not
depend on a particular canvas engine.

## 8. Acceptance criteria for the Cinema slice

- The header, WebGL map and sheet fill the viewport without document scrolling.
- The canvas renders compact numbered seats, screen, exits and row labels.
- Pan and zoom remain available whenever the active sheet screen is non-modal.
- A modal screen dims/blurs the map and makes it unavailable to pointer,
  keyboard and assistive technology input.
- The sheet cannot be resized by dragging.
- Every content change animates from the measured old height to the measured new
  height, including asynchronous data.
- Seat selection follows the category-choice/direct-add rules.
- The cart is a horizontally scrollable ticket rail.
- Session navigation can change both session time and hall without rebuilding
  the controller.
- Reduced-motion, safe-area, visual viewport, focus restoration and Escape
  behavior are covered by automated tests.

## 9. Still open

- P2P behavior and data model.
- Final labels and semantics for the two initial Cinema actions.
- Exact information and controls in the central session/hall header control.
- Product rules that choose modal versus non-modal for each Cinema screen.
- Behavior for unavailable, companion and accessibility seats.
