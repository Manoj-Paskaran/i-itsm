import { afterAll, beforeAll, expect, it } from 'vitest';
import { asSlaPolicyId } from '../../../domain/shared/index.js';
import { SlaCatalog, SlaPolicy } from '../../../domain/sla/index.js';
import { startTestPostgres, type TestPostgres } from '../testing/postgres-container.js';
import { DrizzleSlaPolicyRepository } from './sla-policy.repository.js';

let postgres: TestPostgres;
let repository: DrizzleSlaPolicyRepository;
beforeAll(async () => {
  postgres = await startTestPostgres();
  repository = new DrizzleSlaPolicyRepository(postgres.db);
});
afterAll(async () => {
  await postgres?.stop();
});
it('roundTripsSlaPolicyWithTargetsAndBuildsCatalog', async () => {
  const policy = SlaPolicy.specDefault(asSlaPolicyId('00000000-0000-7000-8000-000000000001'));
  await repository.save(policy);
  const restored = await repository.findById(policy.id());
  expect(restored?.toSnapshot()).toEqual(policy.toSnapshot());
  const policies = await repository.listAll();
  expect(policies.map((p) => p.toSnapshot())).toEqual([policy.toSnapshot()]);
  expect(new SlaCatalog(policies)).toBeDefined();
});
