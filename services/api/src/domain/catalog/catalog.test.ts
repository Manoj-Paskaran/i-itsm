import { describe, expect, it } from 'vitest';
import { asCategoryId, asItServiceId, BusinessCriticality, SkillTag } from '../shared/index.js';
import { InvalidInputException } from '../exceptions/index.js';
import { Category, ItService } from './index.js';
const service = { id: asItServiceId('s'), name: 'Email', criticality: 2, active: true };
const category = {
  id: asCategoryId('c'),
  code: 'EMAIL',
  name: 'Email',
  requiredSkill: 'email',
  active: true,
};
describe('catalog', () => {
  it('rejects invalid service names and criticality', () => {
    for (const name of ['', 'x'.repeat(81)])
      expect(() => ItService.create({ ...service, name })).toThrow(InvalidInputException);
    expect(() => ItService.create({ ...service, criticality: 5 })).toThrow(InvalidInputException);
  });
  it('preserves service changes in snapshots', () => {
    const s = ItService.create(service);
    expect(s.name()).toBe('Email');
    expect(s.toSnapshot()).not.toHaveProperty('description');
    expect(
      ItService.create({ ...service, description: 'Mail service' }).toSnapshot().description,
    ).toBe('Mail service');
    s.rename('Mail');
    expect(s.name()).toBe('Mail');
    s.changeCriticality(BusinessCriticality.of(4));
    expect(s.businessCriticality().value).toBe(4);
    s.deactivate();
    expect(s.isActive()).toBe(false);
    expect(ItService.rehydrate(s.toSnapshot()).toSnapshot()).toEqual(s.toSnapshot());
  });
  it('changes service descriptions and activates inactive services', () => {
    const s = ItService.create({ ...service, active: false });
    s.changeDescription('Mail and calendar');
    expect(s.toSnapshot().description).toBe('Mail and calendar');
    s.activate();
    expect(s.isActive()).toBe(true);
    expect(ItService.rehydrate(s.toSnapshot()).toSnapshot()).toEqual(s.toSnapshot());
  });
  it('rejects invalid category codes, names and skills', () => {
    for (const code of ['a', 'A', 'A-B', '1A', 'A'.repeat(33), 'A!B'])
      expect(() => Category.create({ ...category, code })).toThrow(InvalidInputException);
    expect(() => Category.create({ ...category, name: '' })).toThrow(InvalidInputException);
    expect(() => Category.create({ ...category, requiredSkill: '?' })).toThrow(
      InvalidInputException,
    );
  });
  it('preserves category changes in snapshots', () => {
    const c = Category.create(category);
    expect(c.name()).toBe('Email');
    expect(c.isActive()).toBe(true);
    c.rename('Mail');
    expect(c.name()).toBe('Mail');
    c.deactivate();
    expect(c.isActive()).toBe(false);
    expect(Category.rehydrate(c.toSnapshot()).toSnapshot()).toEqual(c.toSnapshot());
  });
  it('changes required skill and activates inactive categories', () => {
    const c = Category.create({ ...category, active: false });
    c.changeRequiredSkill(SkillTag.of('network'));
    expect(c.skill().value).toBe('network');
    c.activate();
    expect(c.isActive()).toBe(true);
    expect(Category.rehydrate(c.toSnapshot()).toSnapshot()).toEqual(c.toSnapshot());
  });
});
