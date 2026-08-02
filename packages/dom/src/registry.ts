import type {
  DragAreaOptions,
  ShellRegionLayer,
  ShellRegionLayerName,
  ShellRegionName,
  ShellSheetElements,
  ShellSheetPart,
  ShellSheetRegistrySnapshot,
} from "./types.js";

type PartEntry = Readonly<{ element: HTMLElement; token: number }>;
type LayerEntry<TKey extends string> = Readonly<{
  key: TKey;
  element: HTMLElement;
  token: number;
}>;
type DragEntry = Readonly<{
  element: HTMLElement;
  id: string | undefined;
  token: number;
}>;

const emptyElements = (): ShellSheetElements =>
  Object.freeze({
    portal: null,
    backdrop: null,
    viewport: null,
    popup: null,
    content: null,
    header: null,
    body: null,
    footer: null,
    handle: null,
    inertTarget: null,
  });

const elementKey = (
  part: ShellSheetPart,
): keyof ShellSheetElements =>
  part === "inert-target" ? "inertTarget" : part;

export type ShellSheetRegistry<TKey extends string> = Readonly<{
  registerPart(part: ShellSheetPart, element: HTMLElement): () => void;
  registerRegionLayer(
    region: ShellRegionName,
    layer: ShellRegionLayer<TKey>,
    element: HTMLElement,
  ): () => void;
  registerDragArea(
    element: HTMLElement,
    options?: DragAreaOptions,
  ): () => void;
  getSnapshot(): ShellSheetRegistrySnapshot<TKey>;
  clear(): void;
}>;

export function createShellSheetRegistry<TKey extends string>(
  onChange: () => void,
): ShellSheetRegistry<TKey> {
  const parts = new Map<ShellSheetPart, PartEntry>();
  const layers = new Map<
    ShellRegionName,
    Map<ShellRegionLayerName, LayerEntry<TKey>>
  >();
  const dragAreas = new Map<number, DragEntry>();
  let token = 0;
  let snapshot: ShellSheetRegistrySnapshot<TKey> = Object.freeze({
    elements: emptyElements(),
    regionLayers: new Map(),
    dragAreas: Object.freeze([]),
  });

  const rebuild = (): void => {
    const elements = { ...emptyElements() } as {
      -readonly [Key in keyof ShellSheetElements]: ShellSheetElements[Key];
    };
    for (const [part, entry] of parts) {
      elements[elementKey(part)] = entry.element;
    }

    const regionLayers = new Map<
      ShellRegionName,
      ReadonlyMap<ShellRegionLayerName, LayerEntry<TKey>>
    >();
    for (const [region, entries] of layers) {
      regionLayers.set(region, new Map(entries));
    }
    snapshot = Object.freeze({
      elements: Object.freeze(elements),
      regionLayers,
      dragAreas: Object.freeze([...dragAreas.values()]),
    });
    onChange();
  };

  return {
    registerPart(part, element) {
      token += 1;
      const registrationToken = token;
      parts.set(part, { element, token: registrationToken });
      rebuild();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        if (parts.get(part)?.token !== registrationToken) return;
        parts.delete(part);
        rebuild();
      };
    },
    registerRegionLayer(region, layer, element) {
      token += 1;
      const registrationToken = token;
      const regionEntries = layers.get(region) ?? new Map();
      regionEntries.set(layer.layer, {
        key: layer.key,
        element,
        token: registrationToken,
      });
      layers.set(region, regionEntries);
      rebuild();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const currentEntries = layers.get(region);
        if (currentEntries?.get(layer.layer)?.token !== registrationToken) {
          return;
        }
        currentEntries.delete(layer.layer);
        if (currentEntries.size === 0) layers.delete(region);
        rebuild();
      };
    },
    registerDragArea(element, options) {
      token += 1;
      const registrationToken = token;
      dragAreas.set(registrationToken, {
        element,
        id: options?.id,
        token: registrationToken,
      });
      rebuild();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        if (!dragAreas.delete(registrationToken)) return;
        rebuild();
      };
    },
    getSnapshot: () => snapshot,
    clear() {
      parts.clear();
      layers.clear();
      dragAreas.clear();
      snapshot = Object.freeze({
        elements: emptyElements(),
        regionLayers: new Map(),
        dragAreas: Object.freeze([]),
      });
    },
  };
}
