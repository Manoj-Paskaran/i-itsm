import { describe, expect, it } from 'vitest';
import {
  BusinessCriticality,
  Duration,
  Email,
  FixedClock,
  Impact,
  Instant,
  IncidentNumber,
  PasswordHash,
  Priority,
  Rating,
  SkillTag,
  Urgency,
  asUserId,
} from './index.js';
import { InvalidInputException } from '../exceptions/index.js';
describe('value objects', () => {
  it.each([Impact, Urgency, BusinessCriticality])('rejects invalid levels', (level) => {
    for (const n of [0, 5, 1.5, NaN]) expect(() => level.of(n)).toThrow(InvalidInputException);
    expect(level.of(4).value).toBe(4);
  });
  it('rejects invalid priority and orders canonical priorities', () => {
    expect(Priority.of('P1')).toBe(Priority.P1);
    expect(Priority.fromRank(4)).toBe(Priority.P4);
    expect(Priority.P1.isHigherThan(Priority.P2)).toBe(true);
    expect(() => Priority.of('P5')).toThrow(InvalidInputException);
    expect(() => Priority.fromRank(0)).toThrow(InvalidInputException);
  });
  it('normalises and validates email and skills', () => {
    expect(Email.of(' A@EXAMPLE.COM ').value).toBe('a@example.com');
    expect(SkillTag.of(' Data-Base ').value).toBe('data-base');
    for (const f of [
      () => Email.of('bad'),
      () => Email.of(`${'a'.repeat(250)}@x.com`),
      () => SkillTag.of('x'),
      () => SkillTag.of('bad skill'),
    ])
      expect(f).toThrow(InvalidInputException);
  });
  it('rejects invalid ratings and incident numbers', () => {
    for (const n of [0, 6, 1.5]) expect(() => Rating.of(n)).toThrow(InvalidInputException);
    expect(IncidentNumber.fromSequence(7).value).toBe('INC0007');
    expect(() => IncidentNumber.fromSequence(-1)).toThrow(InvalidInputException);
    expect(() => IncidentNumber.of('INC1')).toThrow(InvalidInputException);
  });
  it('rejects empty ids and redacts password hashes', () => {
    expect(() => asUserId(' ')).toThrow(InvalidInputException);
    expect(() => PasswordHash.of('')).toThrow(InvalidInputException);
    expect(PasswordHash.of('secret').toString()).toBe('[redacted]');
  });
  it('rejects invalid duration arithmetic', () => {
    expect(() => Duration.ofMs(-1)).toThrow(InvalidInputException);
    expect(() => Duration.ofSeconds(1).minus(Duration.ofSeconds(2))).toThrow(InvalidInputException);
    expect(() => Duration.ofMs(1).times(-1)).toThrow(InvalidInputException);
    expect(Duration.ofMinutes(2).plus(Duration.ofSeconds(30)).minutes).toBe(2.5);
  });
  it('calculates instants and rejects reverse intervals', () => {
    const start = Instant.fromIso('2026-01-01T00:00:00.000Z');
    const end = start.plus(Duration.ofHours(1));
    expect(start.until(end).minutes).toBe(60);
    expect(end.isAfter(start)).toBe(true);
    expect(() => end.until(start)).toThrow(InvalidInputException);
    expect(() => Instant.fromIso('bad')).toThrow(InvalidInputException);
    const clock = new FixedClock(start);
    clock.advance(Duration.ofHours(1));
    expect(clock.now().equals(end)).toBe(true);
  });
});
