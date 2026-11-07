import { expect, it } from 'vitest';
import { Category } from '../../domain/catalog/index.js';
import { InvalidInputException } from '../../domain/exceptions/index.js';
import { asCategoryId } from '../../domain/shared/index.js';
import { KeywordCategorySuggester } from './keyword-category-suggester.js';

it('recognizesANewlyConfiguredCategoryByItsName', async () => {
  const category = Category.create({
    id: asCategoryId('printing'),
    code: 'PRINTING',
    name: 'Printing',
    requiredSkill: 'printing',
    active: true,
  });
  expect(
    (await new KeywordCategorySuggester().suggest('Printing queue is stuck', [category])).category,
  ).toBe(category);
});

it('rejectsWhenNoCategoryMatchesAndApplicationFallbackIsAbsent', async () => {
  await expect(new KeywordCategorySuggester().suggest('Something odd', [])).rejects.toBeInstanceOf(
    InvalidInputException,
  );
});
