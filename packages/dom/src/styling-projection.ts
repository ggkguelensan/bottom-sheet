import type {
  ResolvedShellSheetSnapPoint,
  ShellSheetSnapshot,
} from "@shell-sheet/core";
import type {
  ShellRegionName,
  ShellSheetMeasuredGeometry,
  ShellSheetRegistrySnapshot,
} from "./types.js";
import { visualOpenTarget } from "./measurement.js";

const toggleData = (
  element: HTMLElement | null,
  name: string,
  present: boolean,
): void => {
  element?.toggleAttribute(`data-${name}`, present);
};

const setData = (
  element: HTMLElement | null,
  name: string,
  value: string | null,
): void => {
  if (!element) return;
  if (value === null) delete element.dataset[name];
  else element.dataset[name] = value;
};

export const applyStructuralMechanics = <TRegionKey extends string>(
  registry: ShellSheetRegistrySnapshot<TRegionKey>,
): void => {
  const {
    backdrop,
    viewport,
    popup,
    content,
    header,
    body,
    footer,
  } = registry.elements;
  backdrop?.style.setProperty("--drawer-swipe-progress", "0");
  viewport?.style.setProperty("--drawer-keyboard-inset", "0px");
  if (popup) {
    popup.style.minHeight = "0";
    popup.style.overflow = "hidden";
    popup.style.contain = "layout paint";
    popup.style.setProperty("--drawer-swipe-movement-x", "0px");
    popup.style.setProperty("--drawer-swipe-movement-y", "0px");
    popup.style.setProperty("--drawer-swipe-strength", "1");
    popup.style.setProperty("--nested-drawers", "0");
  }
  if (content) {
    content.style.display = "grid";
    content.style.gridTemplateRows = "auto minmax(0, 1fr) auto";
    content.style.blockSize = "100%";
    content.style.minBlockSize = "0";
  }
  if (header) {
    header.style.display = "grid";
    header.style.gridTemplateRows = "auto auto";
    header.style.minBlockSize = "0";
  }
  if (body) {
    body.style.display = "grid";
    body.style.gridTemplateRows = "auto";
    body.style.minBlockSize = "0";
    body.style.overflowY = "auto";
    body.style.overscrollBehavior = "contain";
  }
  if (footer) {
    footer.style.display = "grid";
    footer.style.gridTemplateRows = "auto";
    footer.style.minBlockSize = "0";
  }
};

const highestPhysicalPoint = <TSnap extends string>(
  points: readonly ResolvedShellSheetSnapPoint<TSnap>[],
): ResolvedShellSheetSnapPoint<TSnap> | null => points.at(-1) ?? null;

export const projectStableState = <
  TSnap extends string,
  TRegionKey extends string,
>(
  snapshot: ShellSheetSnapshot<TSnap, TRegionKey>,
  registry: ShellSheetRegistrySnapshot<TRegionKey>,
  geometry: ShellSheetMeasuredGeometry<TSnap> | null,
): void => {
  const { elements } = registry;
  const authoritativeOpen = snapshot.authoritativeTarget?.open === true;
  const visualTarget = visualOpenTarget(snapshot);
  const starting = snapshot.phase === "opening";
  const ending = snapshot.phase === "closing";
  const transitioning =
    snapshot.phase === "opening" ||
    snapshot.phase === "closing" ||
    snapshot.phase === "transitioning";
  const swiping = snapshot.phase === "dragging";
  const presentationMorph =
    snapshot.phase === "transitioning" &&
    snapshot.authoritativeTarget?.open === true &&
    snapshot.settledTarget !== null &&
    snapshot.authoritativeTarget.presentation !==
      snapshot.settledTarget.presentation;

  for (const element of [elements.backdrop, elements.viewport, elements.popup]) {
    toggleData(element, "open", authoritativeOpen);
    toggleData(element, "closed", !authoritativeOpen);
    toggleData(element, "starting-style", starting);
    toggleData(element, "ending-style", ending);
  }

  setData(elements.viewport, "presentation", visualTarget?.presentation ?? null);
  setData(elements.popup, "presentation", visualTarget?.presentation ?? null);
  setData(elements.viewport, "modality", visualTarget?.modality ?? null);
  setData(elements.popup, "modality", visualTarget?.modality ?? null);
  setData(elements.popup, "swipeDirection", "down");
  toggleData(elements.popup, "transitioning", presentationMorph);
  setData(
    elements.popup,
    "fromPresentation",
    presentationMorph ? snapshot.settledTarget?.presentation ?? null : null,
  );
  setData(
    elements.popup,
    "toPresentation",
    presentationMorph && snapshot.authoritativeTarget?.open === true
      ? snapshot.authoritativeTarget.presentation
      : null,
  );
  toggleData(elements.popup, "swiping", swiping);
  toggleData(elements.popup, "nested-drawer-open", false);
  toggleData(elements.popup, "nested-drawer-swiping", false);
  if (!swiping) {
    elements.popup?.style.setProperty("--drawer-swipe-movement-x", "0px");
    elements.popup?.style.setProperty("--drawer-swipe-movement-y", "0px");
    elements.popup?.style.setProperty("--drawer-swipe-strength", "1");
    elements.backdrop?.style.setProperty("--drawer-swipe-progress", "0");
    toggleData(elements.popup, "swipe-dismiss", false);
  }

  if (geometry && visualTarget) {
    const highest = highestPhysicalPoint(geometry.resolvedSnapPoints);
    toggleData(elements.popup, "expanded", highest?.id === visualTarget.snapPoint);
    elements.popup?.style.setProperty(
      "--drawer-height",
      `${geometry.targetHeight}px`,
    );
    elements.popup?.style.setProperty(
      "--drawer-frontmost-height",
      `${geometry.targetHeight}px`,
    );
    elements.popup?.style.setProperty(
      "--drawer-snap-point-offset",
      "0px",
    );
    elements.popup?.style.setProperty(
      "--shell-sheet-header-height",
      `${geometry.headerHeight}px`,
    );
    elements.popup?.style.setProperty(
      "--shell-sheet-body-natural-height",
      `${geometry.bodyNaturalHeight}px`,
    );
    elements.popup?.style.setProperty(
      "--shell-sheet-footer-height",
      `${geometry.footerHeight}px`,
    );
    elements.popup?.style.setProperty(
      "--shell-sheet-target-inline-size",
      `${geometry.currentRect.width}px`,
    );
  }

  const draggable = visualTarget?.draggable === true;
  if (elements.handle) {
    elements.handle.style.touchAction = draggable ? "pan-x" : "";
  }

  for (const region of ["header", "body", "footer"] as const) {
    projectRegion(region, snapshot, registry);
  }
};

const projectRegion = <TSnap extends string, TRegionKey extends string>(
  region: ShellRegionName,
  snapshot: ShellSheetSnapshot<TSnap, TRegionKey>,
  registry: ShellSheetRegistrySnapshot<TRegionKey>,
): void => {
  const target = visualOpenTarget(snapshot);
  const targetKey = target?.regions[region].key;
  const layers = registry.regionLayers.get(region);
  const transitioning = [...(layers?.values() ?? [])].some(
    (layer) => layer.key !== targetKey,
  );
  let focusWasInInactiveLayer = false;
  registry.elements[region]?.toggleAttribute(
    "data-transitioning",
    transitioning,
  );

  for (const [layerName, layer] of layers ?? []) {
    const active = layer.key === targetKey && layerName !== "outgoing";
    layer.element.dataset.region = region;
    layer.element.dataset.layer = layerName;
    layer.element.style.gridArea =
      region === "header" ? "2 / 1" : "1 / 1";
    toggleData(layer.element, "active", active);
    toggleData(layer.element, "starting-style", layerName === "incoming");
    toggleData(layer.element, "ending-style", layerName === "outgoing");
    if (active) {
      layer.element.removeAttribute("aria-hidden");
      layer.element.inert = false;
    } else {
      if (layer.element.contains(layer.element.ownerDocument.activeElement)) {
        focusWasInInactiveLayer = true;
      }
      layer.element.setAttribute("aria-hidden", "true");
      layer.element.inert = true;
    }
  }

  if (focusWasInInactiveLayer && registry.elements.popup) {
    const popup = registry.elements.popup;
    if (!popup.hasAttribute("tabindex")) popup.tabIndex = -1;
    popup.focus({ preventScroll: true });
  }
};
