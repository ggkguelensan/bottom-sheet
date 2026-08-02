import type { ShellSheetPart } from "./types.js";

type StyleValue = Readonly<{ value: string; priority: string }>;
type ElementRecord = Readonly<{
  element: HTMLElement;
  styles: Map<string, StyleValue>;
  attributes: Map<string, string | null>;
}>;

const lifecycleAttributes = [
  "data-open",
  "data-closed",
  "data-starting-style",
  "data-ending-style",
] as const;

const partStyles: Record<ShellSheetPart, readonly string[]> = {
  portal: ["visibility", "pointer-events"],
  backdrop: ["pointer-events", "--drawer-swipe-progress"],
  viewport: ["--drawer-keyboard-inset"],
  popup: [
    "min-height",
    "overflow",
    "contain",
    "height",
    "width",
    "transform",
    "opacity",
    "border-radius",
    "--drawer-height",
    "--drawer-frontmost-height",
    "--drawer-snap-point-offset",
    "--drawer-swipe-movement-x",
    "--drawer-swipe-movement-y",
    "--drawer-swipe-strength",
    "--nested-drawers",
    "--shell-sheet-header-height",
    "--shell-sheet-body-natural-height",
    "--shell-sheet-footer-height",
    "--shell-sheet-target-inline-size",
  ],
  content: ["display", "grid-template-rows", "block-size", "min-block-size"],
  header: ["display", "grid-template-rows", "min-block-size"],
  body: [
    "display",
    "grid-template-rows",
    "min-block-size",
    "overflow-y",
    "overscroll-behavior",
  ],
  footer: ["display", "grid-template-rows", "min-block-size"],
  handle: ["touch-action"],
  "inert-target": [],
};

const partAttributes: Record<ShellSheetPart, readonly string[]> = {
  portal: ["data-shell-sheet-portal", "hidden"],
  backdrop: lifecycleAttributes,
  viewport: [
    ...lifecycleAttributes,
    "data-presentation",
    "data-modality",
  ],
  popup: [
    ...lifecycleAttributes,
    "data-expanded",
    "data-swiping",
    "data-swipe-dismiss",
    "data-transitioning",
    "data-presentation",
    "data-modality",
    "data-from-presentation",
    "data-to-presentation",
    "data-swipe-direction",
    "data-nested-drawer-open",
    "data-nested-drawer-swiping",
    "role",
    "aria-modal",
    "tabindex",
  ],
  content: [],
  header: ["data-transitioning"],
  body: ["data-transitioning"],
  footer: ["data-transitioning"],
  handle: [],
  "inert-target": [],
};

export type ShellSheetMechanicLedger = Readonly<{
  capturePart(part: ShellSheetPart, element: HTMLElement): void;
  captureRegionLayer(element: HTMLElement): void;
  restoreAll(): void;
}>;

export const createMechanicLedger = (): ShellSheetMechanicLedger => {
  const records = new Map<HTMLElement, ElementRecord>();

  const capture = (
    element: HTMLElement,
    styles: readonly string[],
    attributes: readonly string[],
  ): void => {
    let record = records.get(element);
    if (!record) {
      record = {
        element,
        styles: new Map(),
        attributes: new Map(),
      };
      records.set(element, record);
    }
    for (const property of styles) {
      if (record.styles.has(property)) continue;
      record.styles.set(property, {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      });
    }
    for (const attribute of attributes) {
      if (!record.attributes.has(attribute)) {
        record.attributes.set(attribute, element.getAttribute(attribute));
      }
    }
  };

  return {
    capturePart(part, element) {
      capture(element, partStyles[part], partAttributes[part]);
    },
    captureRegionLayer(element) {
      capture(
        element,
        ["align-self", "grid-area", "opacity", "filter", "transform"],
        [
          "data-region",
          "data-layer",
          "data-active",
          "data-starting-style",
          "data-ending-style",
          "aria-hidden",
          "inert",
        ],
      );
    },
    restoreAll() {
      for (const record of records.values()) {
        for (const [property, original] of record.styles) {
          if (original.value === "") record.element.style.removeProperty(property);
          else {
            record.element.style.setProperty(
              property,
              original.value,
              original.priority,
            );
          }
        }
        for (const [attribute, original] of record.attributes) {
          if (original === null) record.element.removeAttribute(attribute);
          else record.element.setAttribute(attribute, original);
        }
      }
      records.clear();
    },
  };
};
