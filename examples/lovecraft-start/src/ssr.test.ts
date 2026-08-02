import { scopeBind } from "effector";
import { describe, expect, it } from "vitest";
import { createLovecraftRuntime } from "./runtime.js";

describe("Lovecraft SSR runtime isolation", () => {
  it("creates independent Effector, Query, and Shell Sheet instances per request", () => {
    const first = createLovecraftRuntime();
    const second = createLovecraftRuntime();
    const select = scopeBind(first.model.locationSelected, { scope: first.scope });

    select("innsmouth");

    expect(first.queryClient).not.toBe(second.queryClient);
    expect(first.scope).not.toBe(second.scope);
    expect(first.controller).not.toBe(second.controller);
    expect(first.scope.getState(first.model.$state).kind).toBe("location.info");
    expect(second.scope.getState(second.model.$state).kind).toBe("closed");
    expect(first.controller.getSnapshot().authoritativeTarget).toMatchObject({
      open: true,
      snapPoint: "content",
    });
    expect(second.controller.getSnapshot().authoritativeTarget).toMatchObject({ open: false });

    first.destroy();
    second.destroy();
  });
});
