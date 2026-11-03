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
  it('compares durations by value and rejects non-finite or negative factors', () => {
    const one = Duration.ofMs(1);
    const two = Duration.ofMs(2);
    expect(one.equals(Duration.ofMs(1))).toBe(true);
    expect(one.equals(two)).toBe(false);
    expect(one.toString()).toBe('1ms');
    expect(one.toJSON()).toBe(1);
    expect(one.times(2).ms).toBe(2);
    expect(() => one.times(Infinity)).toThrow(InvalidInputException);
    expect(() => one.times(-1)).toThrow(InvalidInputException);
    expect(Duration.ofMs(0).times(1).ms).toBe(0);
  });
  it('orders instants and serialises them as ISO strings', () => {
    const a = Instant.of(1);
    const b = Instant.of(2);
    expect(a.isBefore(b)).toBe(true);
    expect(a.isBefore(a)).toBe(false);
    expect(a.minus(Duration.ofMs(1)).ms).toBe(0);
    expect(a.equals(Instant.of(1))).toBe(true);
    expect(a.equals(b)).toBe(false);
    expect(a.toString()).toBe('1970-01-01T00:00:00.001Z');
    expect(a.toJSON()).toBe(a.toString());
    expect(Instant.fromDate(new Date(1)).equals(a)).toBe(true);
  });
  it('lets a fixed clock be set to a given instant', () => {
    const clock = new FixedClock(Instant.of(1));
    const later = Instant.of(2);
    clock.set(later);
    expect(clock.now()).toBe(later);
  });
  it('compares emails by value and serialises the address', () => {
    const email = Email.of('a@b.co');
    expect(email.equals(Email.of('a@b.co'))).toBe(true);
    expect(email.equals(Email.of('c@b.co'))).toBe(false);
    expect(email.toString()).toBe('a@b.co');
    expect(email.toJSON()).toBe('a@b.co');
  });
  it('compares incident numbers by value and bounds the sequence to eight digits', () => {
    const incident = IncidentNumber.of('INC0007');
    expect(incident.equals(IncidentNumber.fromSequence(7))).toBe(true);
    expect(incident.equals(IncidentNumber.of('INC0008'))).toBe(false);
    expect(incident.toString()).toBe('INC0007');
    expect(incident.toJSON()).toBe('INC0007');
    expect(() => IncidentNumber.fromSequence(100000000)).toThrow(InvalidInputException);
    expect(() => IncidentNumber.fromSequence(1.5)).toThrow(InvalidInputException);
  });
  it('orders priorities and serialises their label', () => {
    expect(Priority.P1.isHigherThan(Priority.P1)).toBe(false);
    expect(Priority.P1.compare(Priority.P2)).toBe(-1);
    expect(Priority.P1.toString()).toBe('P1');
    expect(Priority.P1.toJSON()).toBe('P1');
  });
  it('compares ratings by value and serialises the number', () => {
    expect(Rating.of(3).equals(Rating.of(3))).toBe(true);
    expect(Rating.of(3).equals(Rating.of(4))).toBe(false);
    expect(Rating.of(3).toString()).toBe('3');
    expect(Rating.of(3).toJSON()).toBe(3);
  });
  it('compares skill tags by value and serialises the tag', () => {
    const skill = SkillTag.of('network');
    expect(skill.equals(SkillTag.of('network'))).toBe(true);
    expect(skill.equals(SkillTag.of('database'))).toBe(false);
    expect(skill.toString()).toBe('network');
    expect(skill.toJSON()).toBe('network');
  });
  it('keeps impact and urgency levels distinct and ordered', () => {
    expect(Impact.of(1).equals(Urgency.of(1))).toBe(false);
    expect(Impact.of(1).compare(Impact.of(2))).toBe(-1);
    expect(Impact.of(1).toString()).toBe('Low');
    expect(Impact.of(1).toJSON()).toBe(1);
  });
  it('compares password hashes without ever serialising the hash', () => {
    const hash = PasswordHash.of('secret');
    expect(hash.equals(PasswordHash.of('secret'))).toBe(true);
    expect(hash.equals(PasswordHash.of('other'))).toBe(false);
    expect(hash.toJSON()).toBe('[redacted]');
    expect(() => PasswordHash.of('   ')).toThrow(InvalidInputException);
  });
  it('validates exact email and text length boundaries and reports field names', () => {
    const atLimit = `${'a'.repeat(242)}@x.com`;
    expect(atLimit.length).toBe(248);
    expect(Email.of(atLimit).value).toBe(atLimit);
    expect(() => Email.of(`${'a'.repeat(249)}@x.com`)).toThrow(/email/);
    expect(() => Email.of('a@b.co trailing')).toThrow(InvalidInputException);
    expect(() => asUserId(' ')).toThrow(/userId/);
    expect(() => IncidentNumber.of('xINC0007')).toThrow(/incidentNumber/);
    expect(() => IncidentNumber.of('INC0007x')).toThrow(/incidentNumber/);
  });
});
