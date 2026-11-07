import { describe, expect, it } from 'vitest';
import { formatMinutes, linePath, nearestIndex, niceMax, percent, ticks } from './charts';

describe('chart helpers', () => {
  it('roundsTheAxisUpToANiceNumber', () =>
    expect([0, 3, 7, 13, 48, 120].map(niceMax)).toEqual([1, 5, 10, 20, 50, 200]));
  it('spacesTicksEvenlyUpToTheAxisMaximum', () => {
    expect(ticks(10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(ticks(5)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(ticks(20)).toEqual([0, 5, 10, 15, 20]);
  });
  it('drawsTheLineFromTheBaselineUp', () =>
    expect(linePath([0, 5, 10], 100, 50, 10)).toBe('M0.0,50.0 L50.0,25.0 L100.0,0.0'));
  it('snapsTheCrosshairToTheNearestDay', () => {
    expect(nearestIndex(0, 300, 30)).toBe(0);
    expect(nearestIndex(299, 300, 30)).toBe(29);
    expect(nearestIndex(-20, 300, 30)).toBe(0);
  });
  it('showsMissingComplianceAsADash', () =>
    expect([percent(null), percent(0.861)]).toEqual(['—', '86%']));
  it('formatsResolutionTimeInHoursAndDays', () =>
    expect([formatMinutes(45), formatMinutes(135), formatMinutes(1500)]).toEqual([
      '45m',
      '2h 15m',
      '1d 1h',
    ]));
  it('carriesRoundedMinutesIntoTheNextHourAndDay', () => {
    expect([59.6, 119.6, 1439.6].map(formatMinutes)).toEqual(['1h', '2h', '1d']);
    expect(formatMinutes(null)).toBe('—');
    expect(formatMinutes(0)).toBe('0m');
  });
  it.each([
    [0.4, '0m'],
    [0.5, '1m'],
    [59.4, '59m'],
    [59.5, '1h'],
    [60, '1h'],
    [61, '1h 1m'],
    [65, '1h 5m'],
    [119.4, '1h 59m'],
    [119.5, '2h'],
    [480, '8h'],
    [1439.4, '23h 59m'],
    [1439.5, '1d'],
    [1440, '1d'],
    [1441, '1d 1m'],
    [1470, '1d 30m'],
    [1500, '1d 1h'],
    [1530, '1d 1h 30m'],
    [2879.5, '2d'],
    [2881, '2d 1m'],
  ])('preservesEveryNonzeroDurationUnitFor%sMinutes', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });
});
