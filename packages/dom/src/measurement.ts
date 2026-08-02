import { resolveSnapPoints } from "@shell-sheet/core";
import type {
  ShellSheetOpenTarget,
  ShellSheetSnapshot,
} from "@shell-sheet/core";
import type {
  ShellRegionLayerName,
  ShellRegionName,
  ShellSheetDomEnvironment,
  ShellSheetInsets,
  ShellSheetMeasuredGeometry,
  ShellSheetRegistrySnapshot,
} from "./types.js";

const layerPriority: readonly ShellRegionLayerName[] = [
  "incoming",
  "settled",
  "outgoing",
];

export const findRegionLayer = <TRegionKey extends string>(
  registry: ShellSheetRegistrySnapshot<TRegionKey>,
  region: ShellRegionName,
  key: TRegionKey,
): HTMLElement | null => {
  const layers = registry.regionLayers.get(region);
  if (!layers) return null;
  for (const layerName of layerPriority) {
    const layer = layers.get(layerName);
    if (layer?.key === key) return layer.element;
  }
  return null;
};

export const requiredTargetReady = <
  TSnap extends string,
  TRegionKey extends string,
>(
  target: ShellSheetOpenTarget<TSnap, TRegionKey>,
  registry: ShellSheetRegistrySnapshot<TRegionKey>,
): boolean => {
  const { elements } = registry;
  if (
    !elements.portal ||
    !elements.viewport ||
    !elements.popup ||
    !elements.content ||
    !elements.header ||
    !elements.body ||
    !elements.footer
  ) {
    return false;
  }
  if (target.modality === "modal" && !elements.backdrop) {
    return false;
  }
  return (["header", "body", "footer"] as const).every(
    (region) =>
      findRegionLayer(registry, region, target.regions[region].key) !== null,
  );
};

const naturalBodyHeight = (element: HTMLElement): number =>
  Math.max(element.scrollHeight, element.getBoundingClientRect().height);

export function measureTargetGeometry<
  TSnap extends string,
  TRegionKey extends string,
>(
  target: ShellSheetOpenTarget<TSnap, TRegionKey>,
  registry: ShellSheetRegistrySnapshot<TRegionKey>,
  environment: ShellSheetDomEnvironment,
  insets: ShellSheetInsets,
): ShellSheetMeasuredGeometry<TSnap> {
  if (!requiredTargetReady(target, registry)) {
    throw new Error("ShellSheet target DOM registry is not ready to measure.");
  }

  const { elements } = registry;
  const portal = elements.portal!;
  const popup = elements.popup!;
  const header = elements.header!;
  const footer = elements.footer!;
  const bodyLayer = findRegionLayer(
    registry,
    "body",
    target.regions.body.key,
  )!;
  const viewport = environment.getViewport(portal);
  const headerHeight = header.getBoundingClientRect().height;
  const bodyNaturalHeight = naturalBodyHeight(bodyLayer);
  const footerHeight = footer.getBoundingClientRect().height;
  const resolvedSnapPoints = resolveSnapPoints(target.snapPoints, {
    viewportHeight: viewport.height,
    insetTop: insets.top,
    insetBottom: insets.bottom,
    headerHeight,
    bodyNaturalHeight,
    footerHeight,
  });
  const selected = resolvedSnapPoints.find(
    (point) => point.id === target.snapPoint,
  );
  if (!selected) {
    throw new Error(`Resolved snap point not found: ${target.snapPoint}`);
  }

  return Object.freeze({
    viewport,
    resolvedSnapPoints,
    targetHeight: selected.height,
    currentRect: popup.getBoundingClientRect(),
    headerHeight,
    bodyNaturalHeight,
    footerHeight,
  });
}

export const visualOpenTarget = <
  TSnap extends string,
  TRegionKey extends string,
>(
  snapshot: ShellSheetSnapshot<TSnap, TRegionKey>,
): ShellSheetOpenTarget<TSnap, TRegionKey> | null =>
  snapshot.authoritativeTarget?.open === true
    ? snapshot.authoritativeTarget
    : snapshot.settledTarget;
