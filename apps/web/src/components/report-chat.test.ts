import { describe, expect, it } from 'vitest';
import { additionalProblemDetails } from './report-chat';

describe('additionalProblemDetails', () => {
  it('hidesDetailsWhenDescriptionOnlyRepeatsTitle', () => {
    expect(additionalProblemDetails('  Checkout is failing! ', 'Checkout is failing.  ')).toBe('');
  });

  it('showsOnlyNewDetailsAfterTheTitleSentence', () => {
    expect(
      additionalProblemDetails('Checkout is failing', 'Checkout is failing?!\n  Cards time out.'),
    ).toBe('Cards time out.');
  });

  it('keepsDetailsWhenTheTitleIsOnlyAPrefixOfTheSentence', () => {
    expect(
      additionalProblemDetails('Checkout is failing', 'Checkout is failing for every customer.'),
    ).toBe('Checkout is failing for every customer.');
  });
});
