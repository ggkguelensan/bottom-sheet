// @vitest-environment node

import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ShellSheetTarget } from "@shell-sheet/core";
import { ShellSheet } from "../src/index.js";

describe("ShellSheet SSR", () => {
  it("renders without browser globals and attaches Portal only on the client", () => {
    const target: ShellSheetTarget<"content", "stable"> = {
      targetId: "ssr:closed",
      open: false,
      transition: { cause: "hydrate", direction: "none", motion: "instant" },
    };
    const html = renderToString(
      <ShellSheet.Root target={target}>
        <ShellSheet.Trigger>Open</ShellSheet.Trigger>
        <ShellSheet.Portal keepMounted>
          <div>Client portal</div>
        </ShellSheet.Portal>
      </ShellSheet.Root>,
    );

    expect(html).toContain("Open");
    expect(html).not.toContain("Client portal");
  });

  it("keeps React free of visual mechanics and optional runtime adapters", () => {
    const source = readFileSync(
      new URL("../src/react-shell-sheet.tsx", import.meta.url),
      "utf8",
    );
    for (const forbidden of [
      "getBoundingClientRect",
      "scrollHeight",
      "ResizeObserver",
      "requestAnimationFrame",
      "setTimeout",
      "motion/react",
      'from "effector',
      'import "./style.css"',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
