import { Logger } from '@nestjs/common';
import { z } from 'zod';
import type { Category } from '../../domain/catalog/index.js';
import type { CategorySuggester } from '../../ports/category-suggester.js';

export const MIN_MODEL_CONFIDENCE = 0.5;
const TIMEOUT_MS = 3000;
const classificationSchema = z.object({
  category: z.string(),
  confidence: z.number().min(0).max(1),
  candidates: z.array(z.object({ category: z.string(), score: z.number() })),
  source: z.enum(['model', 'gemini', 'rules']),
});

/** Adapter: classify against the active catalog, with keyword rules on any ML failure. */
export class HttpCategorySuggester implements CategorySuggester {
  private readonly logger = new Logger(HttpCategorySuggester.name);

  constructor(
    private readonly baseUrl: string,
    private readonly fallback: CategorySuggester,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async suggest(
    text: string,
    categories: readonly Category[],
  ): ReturnType<CategorySuggester['suggest']> {
    try {
      const response = await this.fetchFn(new URL('/v1/classify', this.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          allowedCategories: categories.map((category) => category.toSnapshot().code.toLowerCase()),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`ML classify failed with ${response.status}`);
      const parsed = classificationSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('ML classify returned a malformed body');
      const prediction = parsed.data;
      const category = categories.find(
        (category) =>
          category.toSnapshot().code.toLowerCase() === prediction.category.toLowerCase(),
      );
      if (!category) throw new Error('ML classify returned an unknown category');
      if (prediction.confidence < MIN_MODEL_CONFIDENCE)
        throw new Error('ML classify returned low confidence');
      const source = prediction.source === 'rules' ? 'rules' : 'model';
      this.logger.log(
        `category ${category.toSnapshot().code} via ${prediction.source} (${prediction.confidence.toFixed(2)})`,
      );
      return { category, confidence: prediction.confidence, source };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message.replace(/\s+/g, ' ') : 'ML classify failed';
      this.logger.log(`category fallback to keyword rules: ${reason}`);
      return this.fallback.suggest(text, categories);
    }
  }
}
