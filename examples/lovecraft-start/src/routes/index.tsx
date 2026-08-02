import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { App, prototypeVariants, type PrototypeVariant } from "../App.js";

const isPrototypeVariant = (value: unknown): value is PrototypeVariant =>
  prototypeVariants.some((variant) => variant.id === value);

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    v: isPrototypeVariant(search.v) ? search.v : "field-notes",
  }),
  component: PrototypeHarness,
});

function PrototypeHarness() {
  const { v } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [replay, setReplay] = useState(0);
  const setVariant = useCallback(
    (variant: PrototypeVariant) => {
      void navigate({ search: { v: variant }, replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)
      ) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = prototypeVariants.findIndex((variant) => variant.id === v);
      const number = Number.parseInt(event.key, 10);
      if (number >= 1 && number <= prototypeVariants.length) {
        setVariant(prototypeVariants[number - 1]!.id);
      } else if (event.key === "ArrowRight") {
        setVariant(prototypeVariants[(index + 1) % prototypeVariants.length]!.id);
      } else if (event.key === "ArrowLeft") {
        setVariant(
          prototypeVariants[(index - 1 + prototypeVariants.length) % prototypeVariants.length]!.id,
        );
      } else if (event.key.toLowerCase() === "r") {
        setReplay((value) => value + 1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setVariant, v]);

  return (
    <App
      variant={v}
      replay={replay}
      onVariantChange={setVariant}
      onReplay={() => setReplay((value) => value + 1)}
    />
  );
}
