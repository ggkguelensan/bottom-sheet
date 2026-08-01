import { createBottomSheetController } from "@adaptive-bottom-sheet/core";
import { bindBottomSheetToDom } from "@adaptive-bottom-sheet/dom";
import { createBottomSheetBinding } from "@adaptive-bottom-sheet/effector";
import { createMotionAnimationDriver } from "@adaptive-bottom-sheet/motion";

const snapPoints = [
  { id: "collapsed", size: { type: "ratio", value: 0.6 } },
  { id: "expanded", size: { type: "ratio", value: 0.996 } },
] as const;

const controller = createBottomSheetController({
  controlled: true,
  snapPoints,
});

const sheet = createBottomSheetBinding({
  initialState: { open: false, snapPoint: "collapsed" },
  validateState: ({ snapPoint }) =>
    snapPoints.some((point) => point.id === snapPoint),
});

const detachEffector = sheet.attach(controller);
const app = document.querySelector<HTMLElement>("#app")!;
const main = document.querySelector<HTMLElement>("#sheet-main")!;

const domBinding = bindBottomSheetToDom(
  controller,
  {
    root: document.querySelector<HTMLElement>("#sheet-root")!,
    main,
    handle: document.querySelector<HTMLElement>("#sheet-handle")!,
    content: document.querySelector<HTMLElement>("#sheet-content")!,
    backdrop: document.querySelector<HTMLElement>("#sheet-backdrop")!,
    inertTarget: app,
  },
  {
    animation: createMotionAnimationDriver(),
    topInset: () => Math.max(12, Number.parseFloat(getComputedStyle(main).marginTop) || 0),
  },
);

const toggleSnap = document.querySelector<HTMLButtonElement>("#toggle-snap")!;

document.querySelector("#open-sheet")!.addEventListener("click", () => {
  sheet.openRequested();
});

document.querySelector("#close-sheet")!.addEventListener("click", () => {
  sheet.closeRequested("api");
});

toggleSnap.addEventListener("click", () => {
  sheet.snapRequested(
    sheet.$snapPoint.getState() === "collapsed" ? "expanded" : "collapsed",
  );
});

const unsubscribeLabel = sheet.$snapPoint.watch((point) => {
  toggleSnap.textContent = point === "collapsed" ? "Expand" : "Collapse";
});

window.addEventListener("pagehide", () => {
  unsubscribeLabel();
  domBinding.destroy();
  detachEffector();
  controller.destroy();
});
