import { expect, it } from 'vitest';
import { revealChunks } from './reveal';

it('revealChunksBuildsTheReplyWordByWord', () => {
  expect(revealChunks('Sounds like card payments fail.')).toEqual([
    'Sounds like',
    'Sounds like card payments',
    'Sounds like card payments fail.',
  ]);
  expect(revealChunks('One\n two  ', 1)).toEqual(['One', 'One\n two  ']);
  expect(revealChunks(' ')).toEqual([]);
});
