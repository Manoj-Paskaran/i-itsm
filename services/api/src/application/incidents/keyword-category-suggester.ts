import { InvalidInputException } from '../../domain/exceptions/index.js';
import type { Category } from '../../domain/catalog/index.js';
import type { CategorySuggester } from '../../ports/category-suggester.js';

const keywords: Record<string, readonly string[]> = {
  DATABASE: ['database', 'query', 'queries', 'sql', 'replica', 'deadlock'],
  NETWORK: ['network', 'vpn', 'dns', 'wifi', 'latency'],
  AUTHENTICATION: ['login', 'password', 'sso', 'mfa', 'locked'],
  APPLICATION: ['payment', 'checkout', 'app', 'error', 'crash'],
  HARDWARE: ['laptop', 'printer', 'monitor', 'keyboard', 'battery'],
  SOFTWARE: ['install', 'update', 'license', 'office'],
  CLOUD: ['cloud', 'aws', 'azure', 'instance'],
  SECURITY: ['phishing', 'malware', 'virus', 'breach'],
  STORAGE: ['disk', 'storage', 'backup', 'upload', 'quota'],
};

const stem = (word: string) => word.replace(/(?:ing|s)$/, '');

export class KeywordCategorySuggester implements CategorySuggester {
  suggest(text: string, categories: readonly Category[]) {
    const lower = text.toLowerCase();
    let best: Category | undefined;
    let hits = 0;
    for (const category of categories) {
      const snapshot = category.toSnapshot();
      const words = keywords[snapshot.code] ?? [];
      const categoryWords = `${snapshot.name} ${snapshot.code}`
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((word) => word.length >= 4)
        .map(stem);
      const inputWords = new Set(
        lower
          .split(/[^a-z]+/)
          .filter((word) => word.length >= 4)
          .map(stem),
      );
      const count =
        words.filter((word) => lower.includes(word)).length +
        new Set(categoryWords.filter((word) => inputWords.has(word))).size;
      if (count > hits) {
        best = category;
        hits = count;
      }
    }
    best ??= categories.find((category) => category.toSnapshot().code === 'APPLICATION');
    if (!best) throw new InvalidInputException('No matching category or APPLICATION fallback', {});
    return {
      category: best,
      confidence: hits ? Math.min(1, 0.4 + hits * 0.1) : 0.2,
      source: 'rules' as const,
    };
  }
}
