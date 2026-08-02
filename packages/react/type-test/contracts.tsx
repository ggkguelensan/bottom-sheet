import { createRef } from "react";
import {
  createShellSheetController,
  type ShellSheetTarget,
} from "@shell-sheet/core";
import {
  ShellSheet,
  type ShellSheetApi,
  type ShellSheetPopupState,
} from "@shell-sheet/react";

type Snap = "compact" | "expanded";
type Region = "header" | "body" | "footer";

declare const target: ShellSheetTarget<Snap, Region>;
const controller = createShellSheetController<Snap, Region>();
const apiRef = createRef<ShellSheetApi<Snap, Region>>();
const popupProps: ShellSheet.Popup.Props = {
  className: (state) => (state.open ? "open" : undefined),
};

const atomic = (
  <ShellSheet.Root target={target} controller={controller} apiRef={apiRef}>
    <ShellSheet.Portal keepMounted>
      <ShellSheet.Viewport>
        <ShellSheet.Popup
          className={(state: ShellSheetPopupState) =>
            state.transitioning ? "morphing" : undefined
          }
          render={(props, state) => <section {...props} data-open={state.open} />}
        />
      </ShellSheet.Viewport>
    </ShellSheet.Portal>
  </ShellSheet.Root>
);

const external = <ShellSheet.Root controller={controller}>{atomic}</ShellSheet.Root>;

const convenience = (
  <ShellSheet.Root<Snap, Region>
    snapPoints={[
      { id: "compact", size: { type: "ratio", value: 0.5 } },
      { id: "expanded", size: { type: "ratio", value: 0.9 } },
    ]}
    open
    snapPoint="compact"
  >
    <ShellSheet.Trigger>Open</ShellSheet.Trigger>
  </ShellSheet.Root>
);

// @ts-expect-error atomic target mode cannot mix convenience open state.
<ShellSheet.Root target={target} open />;

// @ts-expect-error external controller mode cannot declare snap points.
<ShellSheet.Root controller={controller} snapPoints={[]} />;

// @ts-expect-error controlled and default open props are mutually exclusive.
<ShellSheet.Root<Snap, Region>
  snapPoints={[{ id: "compact", size: { type: "ratio", value: 0.5 } }]}
  open
  defaultOpen
/>;

void external;
void convenience;
void popupProps;
