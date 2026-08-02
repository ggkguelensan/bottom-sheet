import type { ApplyRubberBandInput } from "./types.js";

const DEFAULT_RUBBER_BAND_CONSTANT = 0.55;

const assertFinite = (name: string, value: number): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`ShellSheet ${name} must be finite.`);
  }
};

export function applyRubberBand(input: ApplyRubberBandInput): number {
  const constant = input.constant ?? DEFAULT_RUBBER_BAND_CONSTANT;
  assertFinite("rubber-band value", input.value);
  assertFinite("rubber-band min", input.min);
  assertFinite("rubber-band max", input.max);
  assertFinite("rubber-band dimension", input.dimension);
  assertFinite("rubber-band constant", constant);

  if (input.min > input.max) {
    throw new Error("ShellSheet rubber-band min must not exceed max.");
  }
  if (input.dimension < 0 || constant <= 0) {
    throw new Error(
      "ShellSheet rubber-band dimension must be non-negative and constant must be positive.",
    );
  }
  if (input.value >= input.min && input.value <= input.max) {
    return input.value;
  }

  const boundary = input.value < input.min ? input.min : input.max;
  const overshoot = input.value - boundary;
  if (input.dimension === 0) return boundary;

  const resisted =
    (overshoot * input.dimension * constant) /
    (input.dimension + constant * Math.abs(overshoot));
  const result = boundary + resisted;
  if (!Number.isFinite(result)) {
    throw new Error("ShellSheet rubber-band result must be finite.");
  }
  return result;
}
