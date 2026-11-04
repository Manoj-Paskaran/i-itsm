/** Words that carry no meaning for "is this the same problem?". */
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'any',
  'can',
  'had',
  'has',
  'have',
  'was',
  'were',
  'this',
  'that',
  'with',
  'from',
  'when',
  'what',
  'they',
  'them',
  'their',
  'there',
  'our',
  'out',
  'its',
  'into',
  'been',
  'being',
  'some',
  'very',
  'just',
  'than',
  'then',
  'also',
  'still',
  'after',
  'before',
  'while',
  'about',
  'please',
  'getting',
  'does',
  'did',
  'cannot',
]);
const MIN_TOKEN_LENGTH = 3;

/** Light suffix stemming so "payments", "failing" and "failed" meet "payment" and "fail". */
export function stem(word: string): string {
  let root = word;
  if (root.endsWith('ies') && root.length > 4) root = `${root.slice(0, -3)}y`;
  else if (/(?:ss|x|z|ch|sh)es$/.test(root)) root = root.slice(0, -2);
  else if (root.endsWith('s') && !root.endsWith('ss')) root = root.slice(0, -1);
  for (const suffix of ['ing', 'ed']) {
    if (root.endsWith(suffix) && root.length - suffix.length >= MIN_TOKEN_LENGTH) {
      root = root.slice(0, -suffix.length);
      break;
    }
  }
  // "decline"/"declined" and "time"/"times" share one root.
  return root.endsWith('e') && root.length > MIN_TOKEN_LENGTH ? root.slice(0, -1) : root;
}

/**
 * Value object: the comparable "meaning" of an incident's text, as sets of stemmed tokens.
 * Title tokens are kept apart because a title states the problem more precisely than a description.
 */
export class TextFingerprint {
  private constructor(
    readonly titleTokens: ReadonlySet<string>,
    readonly allTokens: ReadonlySet<string>,
    /** First word seen for each stem, so explanations show real words instead of stems. */
    private readonly surface: ReadonlyMap<string, string>,
  ) {}
  static of(title: string, description = ''): TextFingerprint {
    const surface = new Map<string, string>();
    const tokens = (text: string) => {
      const set = new Set<string>();
      for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
        if (word.length < MIN_TOKEN_LENGTH || STOP_WORDS.has(word)) continue;
        const root = stem(word);
        set.add(root);
        if (!surface.has(root)) surface.set(root, word);
      }
      return set;
    };
    const titleTokens = tokens(title);
    const allTokens = new Set([...titleTokens, ...tokens(description)]);
    return new TextFingerprint(titleTokens, allTokens, surface);
  }
  isEmpty(): boolean {
    return this.allTokens.size === 0;
  }
  /** Words of this text whose stems also appear in the other one, in this text's order. */
  sharedWords(other: TextFingerprint): string[] {
    return [...this.allTokens]
      .filter((token) => other.allTokens.has(token))
      .map((token) => this.surface.get(token)!);
  }
}

/** |A ∩ B| / |A ∪ B|; 0 when both are empty. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const shared = [...a].filter((token) => b.has(token)).length;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** |A ∩ B| / min(|A|, |B|): a short title fully contained in a long description still scores high. */
export function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const smaller = Math.min(a.size, b.size);
  if (smaller === 0) return 0;
  return [...a].filter((token) => b.has(token)).length / smaller;
}
