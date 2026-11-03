import type { Recommendation } from './recommendation.js';

export function sortRecommendations(items: Recommendation[]): Recommendation[] {
  return items.sort(
    (a, b) =>
      b.score - a.score ||
      (a.technicianId < b.technicianId ? -1 : a.technicianId > b.technicianId ? 1 : 0),
  );
}
