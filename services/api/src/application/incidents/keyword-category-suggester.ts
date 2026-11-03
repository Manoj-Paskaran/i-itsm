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

export class KeywordCategorySuggester implements CategorySuggester {
  suggest(text: string, categories: readonly Category[]) {
    const lower = text.toLowerCase();
    let best: Category | undefined;
    let hits = 0;
    for (const category of categories) {
      const words = keywords[category.toSnapshot().code] ?? [];
      const count = words.filter((word) => lower.includes(word)).length;
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
