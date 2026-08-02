import { createRoot } from "react-dom/client";
import { createNativeAnimationDriver } from "@shell-sheet/dom";
import { ShellSheet } from "@shell-sheet/react";

const host = document.getElementById("app");
if (!host) throw new Error("React 19 compatibility host is missing.");

createRoot(host).render(
  <ShellSheet.Root
    defaultOpen={false}
    defaultSnapPoint="content"
    snapPoints={[
      { id: "content", size: { type: "content", maxRatio: 0.8 } },
    ]}
    animation={createNativeAnimationDriver()}
  >
    <ShellSheet.Trigger>Open</ShellSheet.Trigger>
    <ShellSheet.Portal keepMounted>
      <ShellSheet.Backdrop />
      <ShellSheet.Viewport>
        <ShellSheet.Popup>
          <ShellSheet.Content>
            <ShellSheet.Header>
              <ShellSheet.Title>React 19</ShellSheet.Title>
            </ShellSheet.Header>
            <ShellSheet.Body>Public declarations remain compatible.</ShellSheet.Body>
            <ShellSheet.Footer>
              <ShellSheet.Close>Close</ShellSheet.Close>
            </ShellSheet.Footer>
          </ShellSheet.Content>
        </ShellSheet.Popup>
      </ShellSheet.Viewport>
    </ShellSheet.Portal>
  </ShellSheet.Root>,
);
