/** A "nice" axis maximum (1, 2, 5 × 10ⁿ) at or above the largest value, so gridlines land on round numbers. */
export function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map((m) => m * power).find((step) => step >= value) ?? 10 * power;
}

/** Ticks from 0 to max on a 1/2/5 step that divides max evenly, so the top gridline is labelled. */
export function ticks(max: number, count = 5) {
  for (let power = 1; power <= max; power *= 10)
    for (const m of [1, 2, 5]) {
      const step = m * power;
      if (max % step === 0 && max / step <= count)
        return Array.from({ length: max / step + 1 }, (_, i) => i * step);
    }
  return [0, max];
}

/** SVG path through the points (x spread evenly over width, y measured down from height). */
export function linePath(values: number[], width: number, height: number, max: number) {
  if (!values.length) return '';
  const dx = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map(
      (v, i) =>
        `${i ? 'L' : 'M'}${(i * dx).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`,
    )
    .join(' ');
}

/** Index of the point nearest a pointer x, for the crosshair tooltip. */
export function nearestIndex(x: number, width: number, length: number) {
  if (length < 2) return 0;
  return Math.min(length - 1, Math.max(0, Math.round((x / width) * (length - 1))));
}

export const percent = (value: number | null) =>
  value === null ? '—' : `${Math.round(value * 100)}%`;

export function formatMinutes(minutes: number | null) {
  if (minutes === null) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  return h < 24
    ? `${h}h ${String(Math.round(minutes % 60)).padStart(2, '0')}m`
    : `${Math.floor(h / 24)}d ${h % 24}h`;
}
