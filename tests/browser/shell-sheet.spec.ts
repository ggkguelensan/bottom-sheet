import { expect, test, type Locator, type Page } from "@playwright/test";
import axe from "axe-core";

const activeKeyframes = (element: Locator): Promise<ComputedKeyframe[]> =>
  element.evaluate((node) =>
    node.getAnimations({ subtree: true }).flatMap((animation) =>
      animation.effect instanceof KeyframeEffect
        ? animation.effect.getKeyframes()
        : [],
    ),
  );

const waitForAnimations = async (element: Locator): Promise<void> => {
  await expect.poll(() => element.evaluate((node) =>
    node.getAnimations({ subtree: true }).filter((animation) =>
      animation.effect instanceof KeyframeEffect &&
      animation.effect.target instanceof HTMLElement &&
      animation.effect.target.style.animationName === "",
    ).length,
  )).toBe(0);
};

const useSlowTiming = async (page: Page): Promise<void> => {
  await page.addStyleTag({ content: `
    [data-demo-kind] {
      --shell-sheet-open-duration: 900ms !important;
      --shell-sheet-close-duration: 900ms !important;
      --shell-sheet-geometry-duration: 900ms !important;
    }
  ` });
};

const expectActiveTransform = async (
  element: Locator,
  expected: string,
): Promise<void> => {
  await expect.poll(async () =>
    (await activeKeyframes(element)).some((frame) =>
      String(frame.transform).includes(expected),
    ),
  ).toBe(true);
};

const popup = (page: Page): Locator => page.locator("[role='dialog'][data-demo-kind]");
const regionHost = (page: Page, region: "body" | "footer"): Locator =>
  page.locator(`[role='dialog'] [data-region='${region}'][data-active]`).locator("..");
const body = (page: Page): Locator => regionHost(page, "body");
const footer = (page: Page): Locator => regionHost(page, "footer");

const waitForOpen = async (page: Page, kind: string): Promise<Locator> => {
  const current = popup(page);
  await expect(current).toHaveAttribute("data-demo-kind", kind);
  await expect(current).toHaveAttribute("data-open", "");
  await expect(current).toBeVisible();
  await expect(current).not.toHaveAttribute("data-transitioning", "");
  return current;
};

const dragAreaUp = async (page: Page, area: Locator): Promise<void> => {
  await expect(area).toBeVisible();
  const box = await area.boundingBox();
  if (!box) throw new Error("Shell Sheet Handle has no visual box.");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const offset of [5, 15, 30, 70, 140, 220]) {
    await page.mouse.move(x, y - offset);
    await page.waitForTimeout(24);
  }
  await page.mouse.up();
};

const dragHandleUp = async (page: Page): Promise<void> =>
  dragAreaUp(page, page.getByRole("button", { name: "Expand sheet" }));

const beginCapturedHandleDrag = async (
  page: Page,
  handle: Locator,
): Promise<number> => {
  await handle.evaluate((element) => {
    delete element.dataset.capturePointerId;
    element.addEventListener(
      "gotpointercapture",
      (event) => {
        element.dataset.capturePointerId = String((event as PointerEvent).pointerId);
      },
      { once: true },
    );
  });
  const box = await handle.boundingBox();
  if (!box) throw new Error("Shell Sheet Handle has no visual box.");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 48, { steps: 4 });
  await expect(handle).toHaveAttribute("data-capture-pointer-id", /\d+/);
  return Number(await handle.getAttribute("data-capture-pointer-id"));
};

test.beforeEach(async ({ page }) => {
  await page.goto("/?v=field-notes");
  await expect(page.locator("[data-hydrated]")).toBeVisible();
  await expect(page.locator("[data-demo-state='closed']")).toBeVisible();
});

test("Arkham uses one animated, non-draggable Popup and rejects stale async completion", async ({ page, isMobile }) => {
  await useSlowTiming(page);
  const trigger = page.locator("[data-location='arkham']").getByRole("button", { name: "Войти в библиотеку" });
  await trigger.click();
  const arkham = await waitForOpen(page, "arkham.a");
  await expectActiveTransform(
    arkham,
    isMobile ? "translateY(100%)" : "translateY(12px)",
  );
  await expect(arkham).toHaveAttribute(
    "data-presentation",
    isMobile ? "sheet" : "dialog",
  );
  await expect(page.getByRole("button", { name: /sheet/i })).toHaveCount(0);
  const initialBox = await arkham.boundingBox();
  expect(initialBox?.height).toBeLessThan(page.viewportSize()!.height * 0.9);
  await waitForAnimations(arkham);

  await page.getByRole("button", { name: /К столу картографа/ }).click();
  await expect(arkham).toHaveAttribute("data-demo-kind", "arkham.b");
  await expect(page.locator("[data-region='body'][data-layer='outgoing']")).toHaveCount(1);
  await expect(page.locator("[data-region='body'][data-layer='incoming']")).toHaveCount(1);
  await expect(page.locator("[data-region='header'][data-layer='outgoing']")).toHaveCount(0);
  await expect(page.locator("[data-region='footer'][data-layer='outgoing']")).toHaveCount(1);
  await expect(page.locator("[data-region='body'][data-layer='outgoing']")).toHaveCount(0);

  await page.getByRole("button", { name: /B\.2/ }).click();
  await expect(page.getByText(/Полная высота показывает/)).toBeVisible();
  const expandedBox = await arkham.boundingBox();
  expect(expandedBox!.height).toBeGreaterThan(initialBox!.height);

  await page.getByRole("button", { name: /Проверить опись/ }).click();
  await expect(arkham).toHaveAttribute("data-demo-kind", "arkham.c.loading");
  await page.getByRole("button", { name: /Назад и отменить/ }).click();
  await expect(arkham).toHaveAttribute("data-demo-kind", "arkham.b");
  await expect(page.getByText(/Полная высота показывает/)).toBeVisible();
  await page.waitForTimeout(900);
  await expect(arkham).toHaveAttribute("data-demo-kind", "arkham.b");

  await page.getByRole("button", { name: /Проверить опись/ }).click();
  await expect(arkham).toHaveAttribute("data-demo-kind", "arkham.c.fail", { timeout: 3_000 });
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(arkham).toHaveAttribute("data-demo-kind", "arkham.c.success", { timeout: 3_000 });
});

test("Innsmouth and Dreamlands accept one gesture release and keep Footer pinned", async ({ page }) => {
  await page.locator("[data-location='innsmouth']").getByRole("button", { name: "Осмотреть причал" }).click();
  const innsmouth = await waitForOpen(page, "innsmouth");
  await waitForAnimations(innsmouth);
  const beforeFooter = await footer(page).boundingBox();
  await dragHandleUp(page);
  await expect(page.getByRole("button", { name: "Collapse sheet" })).toBeVisible();
  await expect(page.getByText(/Колокол на складе/)).toBeVisible();
  const afterPopup = await innsmouth.boundingBox();
  const afterFooter = await footer(page).boundingBox();
  expect(Math.abs((afterPopup!.y + afterPopup!.height) - (afterFooter!.y + afterFooter!.height))).toBeLessThan(2);
  expect(afterFooter!.height).toBe(beforeFooter!.height);

  await page.getByRole("button", { name: "Закрыть" }).click();
  await expect(page.locator("[data-shell-sheet-portal]")).toBeHidden();
  await page.locator("[data-location='dreamlands']").getByRole("button", { name: "Подняться к воротам" }).click();
  const dreamlands = await waitForOpen(page, "dreamlands");
  await waitForAnimations(dreamlands);
  await expect(page.getByText("Компактный ориентир")).toBeVisible();
  await expect(page.getByRole("button", { name: "Expand sheet" })).toBeVisible();
  await dragAreaUp(page, page.locator("[data-demo-drag-area]"));
  await expect(page.getByText("Три площадки Кадата")).toBeVisible();
  await expect(page.getByText("Компактный ориентир")).toHaveCount(0);
});

test("Dunwich bounds long content to Body and Antarctica pins media to the surface top", async ({ page }) => {
  await page.locator("[data-location='dunwich']").getByRole("button", { name: "Спуститься в погреб" }).click();
  const dunwich = await waitForOpen(page, "dunwich");
  await waitForAnimations(dunwich);
  const dimensions = await body(page).evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflow: getComputedStyle(element).overflowY,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
  expect(dimensions.overflow).toBe("auto");
  await body(page).evaluate((element) => { element.scrollTop = 300; });
  expect(await body(page).evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const popupBox = await dunwich.boundingBox();
  const footerBox = await footer(page).boundingBox();
  expect(Math.abs((popupBox!.y + popupBox!.height) - (footerBox!.y + footerBox!.height))).toBeLessThan(2);

  await page.getByRole("button", { name: "Закрыть отчёт" }).click();
  await expect(page.locator("[data-shell-sheet-portal]")).toBeHidden();
  await page.locator("[data-location='antarctica']").getByRole("button", { name: "Открыть полевой снимок" }).click();
  const antarctica = await waitForOpen(page, "antarctica");
  await waitForAnimations(antarctica);
  const media = page.getByRole("heading", { name: "Хребты без имени" }).locator("..");
  const [surfaceBox, mediaBox] = await Promise.all([antarctica.boundingBox(), media.boundingBox()]);
  expect(Math.abs(surfaceBox!.y - mediaBox!.y)).toBeLessThan(2);
  await expect(page.getByRole("button", { name: "Expand sheet" })).toBeVisible();
});

test("the same Popup morphs sheet to dialog, applies modality, restores focus, and closes with animation", async ({ page, isMobile }) => {
  test.skip(isMobile, "The demo intentionally locks small viewports to sheet presentation.");
  await useSlowTiming(page);
  const trigger = page.locator("[data-location='arkham']").getByRole("button", { name: /Открыть краткую запись/ });
  await trigger.click();
  const surface = await waitForOpen(page, "location.info");
  await expect(surface).toHaveAttribute("data-presentation", "sheet");
  await surface.evaluate((element) => { element.dataset.identityProbe = "same-popup"; });
  await waitForAnimations(surface);

  await page.getByRole("button", { name: "Dialog", exact: true }).click();
  await expect(surface).toHaveAttribute("data-presentation", "dialog");
  await expect(surface).toHaveAttribute("data-identity-probe", "same-popup");
  await expect(surface).toHaveAttribute("aria-modal", "true");
  await expect.poll(async () =>
    (await activeKeyframes(surface)).some((frame) => frame.width !== undefined),
  ).toBe(true);
  const app = page.locator("[data-demo-state]");
  await expect(app).toHaveAttribute("inert", "");
  await waitForAnimations(surface);

  const close = page.getByRole("button", { name: "Закрыть", exact: true });
  const enter = page.getByRole("button", { name: "Войти в библиотеку", exact: true });
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(enter).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-shell-sheet-portal]")).toBeVisible();
  await expectActiveTransform(surface, "translateY(12px)");
  await expect(page.locator("[data-shell-sheet-portal]")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("reduced motion removes spatial entrance and modal accessibility has no serious axe violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await useSlowTiming(page);
  await page.locator("[data-location='arkham']").getByRole("button", { name: "Войти в библиотеку" }).click();
  const surface = await waitForOpen(page, "arkham.a");
  await expect.poll(() => activeKeyframes(surface).then((frames) => frames.length)).toBeGreaterThan(0);
  const spatial = (await activeKeyframes(surface)).filter((frame) => frame.transform !== undefined);
  expect(spatial).toHaveLength(0);
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const axeApi = (window as typeof window & {
      axe: { run(context: Element): Promise<{ violations: Array<{ id: string; impact: string | null }> }> };
    }).axe;
    const dialog = document.querySelector("[role='dialog']");
    if (!dialog) throw new Error("Dialog missing for accessibility audit.");
    return (await axeApi.run(dialog)).violations;
  });
  expect(violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
  const labelledBy = await surface.getAttribute("aria-labelledby");
  expect(labelledBy).toBeTruthy();
  if (labelledBy === null) throw new Error("The dialog has no accessible title reference.");
  await expect(page.locator(`#${labelledBy}`)).toHaveCount(1);
});

test("pointer cancellation reconciles mechanics and viewport resize retargets the open sheet", async ({ page }) => {
  await page.locator("[data-location='innsmouth']").getByRole("button", { name: "Осмотреть причал" }).click();
  const surface = await waitForOpen(page, "innsmouth");
  await waitForAnimations(surface);
  const handle = page.getByRole("button", { name: "Expand sheet" });
  const cancelledPointer = await beginCapturedHandleDrag(page, handle);
  await expect(surface).toHaveAttribute("data-swiping", "");
  await handle.evaluate((element, pointerId) => {
    element.dispatchEvent(new PointerEvent("pointercancel", {
      bubbles: true,
      pointerId,
      pointerType: "mouse",
      isPrimary: true,
    }));
  }, cancelledPointer);
  await page.mouse.up();
  await expect(surface).not.toHaveAttribute("data-swiping", "");
  await expect(page.getByRole("button", { name: "Expand sheet" })).toBeVisible();

  const lostPointer = await beginCapturedHandleDrag(page, handle);
  await expect(surface).toHaveAttribute("data-swiping", "");
  await handle.evaluate((element, pointerId) => {
    if (!element.hasPointerCapture(pointerId)) {
      throw new Error("The accepted gesture did not retain pointer capture.");
    }
    element.releasePointerCapture(pointerId);
  }, lostPointer);
  await expect(surface).not.toHaveAttribute("data-swiping", "");
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Expand sheet" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 620 });
  await page.getByRole("button", { name: /Открыть полностью/ }).click();
  await expect(page.getByRole("button", { name: "Collapse sheet" })).toBeVisible();
  const box = await surface.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(620 * 0.95);
});
