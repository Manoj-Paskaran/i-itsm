import { describe, expect, it } from 'vitest';
import { asCategoryId, asItServiceId, BusinessCriticality } from '../shared/index.js';
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
    s.rename('Mail');
    s.changeCriticality(BusinessCriticality.of(4));
    s.deactivate();
    expect(ItService.rehydrate(s.toSnapshot()).toSnapshot()).toEqual(s.toSnapshot());
  });
  it('rejects invalid category codes, names and skills', () => {
    for (const code of ['a', 'A', 'A-B'])
      expect(() => Category.create({ ...category, code })).toThrow(InvalidInputException);
    expect(() => Category.create({ ...category, name: '' })).toThrow(InvalidInputException);
    expect(() => Category.create({ ...category, requiredSkill: '?' })).toThrow(
      InvalidInputException,
    );
  });
  it('preserves category changes in snapshots', () => {
    const c = Category.create(category);
    c.rename('Mail');
    c.deactivate();
    expect(Category.rehydrate(c.toSnapshot()).toSnapshot()).toEqual(c.toSnapshot());
  });
});
