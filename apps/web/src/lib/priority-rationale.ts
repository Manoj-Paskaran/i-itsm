/** Parse only the API's complete weighted-score explanation; other strategies stay as text. */
export function parsePriorityRationale(lines: readonly string[]) {
  if (lines.length !== 3) return null;
  const factors =
    /^Impact (.+) \(([1-4])\) × Urgency (.+) \(([1-4])\) × Criticality (.+) \(([1-4])\) = (\d+(?:\.\d+)?)$/.exec(
      lines[0]!,
    );
  const users = /^Affected users (\d+) → ×(\d+(?:\.\d+)?)$/.exec(lines[1]!);
  const result = /^Score (\d+(?:\.\d+)?) (≥|<) (\d+(?:\.\d+)?) → (P[1-4]) (.+)$/.exec(lines[2]!);
  if (!factors || !users || !result) return null;
  const base = Number(factors[7]);
  const score = Number(result[1]);
  const multiplier = Number(users[2]);
  if (
    Number(factors[2]) * Number(factors[4]) * Number(factors[6]) !== base ||
    Math.round(base * multiplier * 10) / 10 !== score
  )
    return null;
  return {
    terms: [
      { label: 'Impact', name: factors[1]!, value: Number(factors[2]) },
      { label: 'Urgency', name: factors[3]!, value: Number(factors[4]) },
      { label: 'Service criticality', name: factors[5]!, value: Number(factors[6]) },
    ],
    base,
    users: Number(users[1]),
    multiplier,
    score,
    comparison: result[2]!,
    threshold: Number(result[3]),
    priority: result[4]!,
  };
}
