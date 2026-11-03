import { expect, it } from 'vitest';
import { Category } from '../../domain/catalog/index.js';
import { asCategoryId } from '../../domain/shared/index.js';
import { KeywordCategorySuggester } from './keyword-category-suggester.js';

it('recognizes a newly configured category by its name', () => {
  const category = Category.create({
    id: asCategoryId('printing'),
    code: 'PRINTING',
    name: 'Printing',
    requiredSkill: 'printing',
    active: true,
  });
  expect(
    new KeywordCategorySuggester().suggest('Printing queue is stuck', [category]).category,
  ).toBe(category);
});
