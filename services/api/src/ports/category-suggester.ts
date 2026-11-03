import type { Category } from '../domain/catalog/index.js';

export interface CategorySuggester {
  suggest(
    text: string,
    categories: readonly Category[],
  ): {
    category: Category;
    confidence: number;
    source: 'rules' | 'model';
  };
}
export const CATEGORY_SUGGESTER = Symbol('CATEGORY_SUGGESTER');
