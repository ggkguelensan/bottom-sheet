import { StrictMode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { App, type PrototypeVariant } from "./App";
import "./styles.css";

const variants: readonly { id: PrototypeVariant; label: string }[] = [
  { id: "field-notes", label: "Field notes" },
  { id: "cartographic", label: "Cartographic" },
  { id: "nocturne", label: "Nocturne" },
];

const initialIndex = () => {
  const value = Number.parseInt(new URLSearchParams(location.search).get("v") ?? "1", 10);
  return Number.isFinite(value) && value >= 1 && value <= variants.length
    ? value - 1
    : 0;
};

function PrototypeHarness() {
  const [current, setCurrent] = useState(initialIndex);
  const [replay, setReplay] = useState(0);
  const [ready, setReady] = useState(false);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveHighlight = useCallback(() => {
    const highlight = highlightRef.current;
    const item = itemRefs.current[current];
    if (!highlight || !item) return;
    highlight.style.width = `${item.offsetWidth}px`;
    highlight.style.transform = `translateX(${item.offsetLeft}px)`;
  }, [current]);

  const setActive = useCallback((index: number) => {
    if (index < 0 || index >= variants.length) return;
    setCurrent(index);
    const url = new URL(location.href);
    url.searchParams.set("v", String(index + 1));
    history.replaceState(null, "", url);
  }, []);

  useLayoutEffect(moveHighlight, [moveHighlight]);

  useEffect(() => {
    const onResize = () => moveHighlight();
    window.addEventListener("resize", onResize);
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      window.removeEventListener("resize", onResize);
    };
  }, [moveHighlight]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const number = Number.parseInt(event.key, 10);
      if (number >= 1 && number <= variants.length) setActive(number - 1);
      else if (event.key === "ArrowRight") setActive((current + 1) % variants.length);
      else if (event.key === "ArrowLeft") setActive((current - 1 + variants.length) % variants.length);
      else if (event.key === "r" || event.key === "R") setReplay((value) => value + 1);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [current, setActive]);

  const variant = variants[current] ?? variants[0]!;

  return (
    <>
      <App key={`${variant.id}:${replay}`} variant={variant.id} />
      <nav
        className="proto-picker"
        aria-label="Prototype variants"
        data-ready={ready || undefined}
        data-position="top"
      >
        <span ref={highlightRef} className="proto-picker-highlight" aria-hidden="true" />
        {variants.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            className="proto-picker-item"
            data-active={index === current || undefined}
            aria-current={index === current ? "true" : undefined}
            onClick={() => setActive(index)}
          >
            {item.label}
          </button>
        ))}
        <span className="proto-picker-divider" aria-hidden="true" />
        <button
          className="proto-picker-item proto-picker-replay"
          aria-label="Replay animation (R)"
          onClick={() => setReplay((value) => value + 1)}
        >
          ↻
        </button>
      </nav>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrototypeHarness />
  </StrictMode>,
);
