import { createEvent, createStore } from "effector";
import { createRoot } from "react-dom/client";
import {
  createShellSheetController,
  type ShellSheetFact,
  type ShellSheetRequest,
  type ShellSheetTarget,
} from "@shell-sheet/core";
import { createShellSheetBinding } from "@shell-sheet/effector";
import { createMotionAnimationDriver } from "@shell-sheet/motion";
import { ShellSheet } from "@shell-sheet/react";
import "./drawer-port.css";

type Snap = "content";
type Region = "header" | "body" | "footer";
const target: ShellSheetTarget<Snap, Region> = {
  targetId: "consumer:closed",
  open: false,
  transition: { cause: "hydrate", direction: "none", motion: "instant" },
};
const targetChanged = createEvent<ShellSheetTarget<Snap, Region>>();
const $target = createStore<ShellSheetTarget<Snap, Region>>(target)
  .on(targetChanged, (_, value) => value);
const requestReceived = createEvent<ShellSheetRequest<Snap>>();
const visualFactReceived = createEvent<ShellSheetFact<Snap, Region>>();
const controller = createShellSheetController<Snap, Region>(target);
const binding = createShellSheetBinding({
  $target,
  requestReceived,
  visualFactReceived,
});
const detach = binding.attach(controller);
const animation = createMotionAnimationDriver();

const host = document.getElementById("app");
if (!host) throw new Error("Consumer fixture host is missing.");
createRoot(host).render(
  <ShellSheet.Root controller={controller} animation={animation}>
    <ShellSheet.Portal keepMounted>
      <ShellSheet.Backdrop className="drawer-backdrop" />
      <ShellSheet.Viewport className="drawer-viewport">
        <ShellSheet.Popup className="drawer-popup">
          <ShellSheet.Content>
            <ShellSheet.Header><ShellSheet.Title>Fixture</ShellSheet.Title></ShellSheet.Header>
            <ShellSheet.Body>Typed public exports</ShellSheet.Body>
            <ShellSheet.Footer><ShellSheet.Close>Close</ShellSheet.Close></ShellSheet.Footer>
          </ShellSheet.Content>
        </ShellSheet.Popup>
      </ShellSheet.Viewport>
    </ShellSheet.Portal>
  </ShellSheet.Root>,
);

void detach;
