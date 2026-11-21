import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Category, ItService } from '../../domain/catalog/index.js';
import { TextSimilarity } from '../../domain/intelligence/text-similarity.js';
import { asCategoryId, asItServiceId } from '../../domain/shared/index.js';
import type { ChatIntakePort, ChatIntakeReading } from '../../ports/chat-intake.js';
import { InMemoryCategoryRepository } from '../testing/in-memory-category-repository.js';
import { InMemoryServiceRepository } from '../testing/in-memory-service-repository.js';
import { ChatIntakeService } from './chat-intake.service.js';
import { RuleBasedChatIntake } from './rule-based-chat-intake.js';

const payment = {
  id: asItServiceId('00000000-0000-4000-8000-000000000001'),
  name: 'Payment Gateway',
};
const inactive = {
  id: asItServiceId('00000000-0000-4000-8000-000000000002'),
  name: 'Legacy Payments',
};
const application = Category.create({
  id: asCategoryId('00000000-0000-4000-8000-000000000003'),
  code: 'APPLICATION',
  name: 'Application',
  requiredSkill: 'application',
  active: true,
});
const authentication = Category.create({
  id: asCategoryId('00000000-0000-4000-8000-000000000004'),
  code: 'AUTHENTICATION',
  name: 'Authentication',
  requiredSkill: 'authentication',
  active: false,
});
const cacheReading: ChatIntakeReading = {
  engine: 'cache',
  model: 'test-model',
  title: 'Card payment fails',
  summary: 'Card payments are failing.',
  reply: 'Sounds like card payments are failing.',
  fields: {
    serviceId: { value: payment.id, confidence: 0.9 },
    categoryCode: { value: 'ApPlIcAtIoN', confidence: 0.8 },
    impact: null,
    urgency: null,
    affectedUsers: null,
  },
};

async function serviceWithCatalog(reader: ChatIntakePort): Promise<ChatIntakeService> {
  const catalog = new InMemoryServiceRepository();
  await catalog.save(ItService.create({ ...payment, criticality: 4, active: true }));
  await catalog.save(ItService.create({ ...inactive, criticality: 3, active: false }));
  const categories = new InMemoryCategoryRepository();
  await categories.save(application);
  await categories.save(authentication);
  return new ChatIntakeService(catalog, categories, reader);
}

describe('ChatIntakeService', () => {
  it('dropsAServiceIdThatIsNotActive', async () => {
    const reading = {
      ...cacheReading,
      fields: { ...cacheReading.fields, serviceId: { value: inactive.id, confidence: 0.8 } },
    };
    const read = vi.fn<ChatIntakePort['read']>().mockResolvedValue(reading);
    const service = await serviceWithCatalog({ read });
    const message = 'Our old payment system stopped';
    const result = await service.read(message);
    expect(read).toHaveBeenCalledExactlyOnceWith(message, [payment], ['application']);
    expect(result.engine).toBe('cache');
    expect(result.fields.serviceId).toBeNull();
  });

  it('mapsACategoryCodeCaseInsensitivelyToItsActiveId', async () => {
    const service = await serviceWithCatalog({ read: vi.fn().mockResolvedValue(cacheReading) });
    const result = await service.read('Card payments are failing');
    expect(result.fields.categoryId).toEqual({ value: application.id(), confidence: 0.8 });
    expect(result.fields).not.toHaveProperty('categoryCode');
  });

  it.each(['authentication', 'unknown'])(
    'dropsACategoryCodeOutsideTheActiveCatalog %s',
    async (value) => {
      const reading = {
        ...cacheReading,
        fields: { ...cacheReading.fields, categoryCode: { value, confidence: 0.8 } },
      };
      const service = await serviceWithCatalog({ read: vi.fn().mockResolvedValue(reading) });
      const result = await service.read('Card payments are failing');
      expect(result.engine).toBe('cache');
      expect(result.fields.categoryId).toBeNull();
    },
  );

  it('keepsTheReportersOriginalWordsInTheDescription', async () => {
    const original = 'hey— my card won’t work.  It shows "Declined".';
    const service = await serviceWithCatalog({
      read: vi.fn<ChatIntakePort['read']>().mockResolvedValue(cacheReading),
    });
    const result = await service.read(original);
    expect(result.description).toBe(
      `Card payments are failing.\n\nIn the reporter's words: "${original}"`,
    );
    expect(result.fields.serviceId).toEqual(cacheReading.fields.serviceId);
  });

  it('rulesAnswerHasNoReplyOrTitle', async () => {
    const service = await serviceWithCatalog(new RuleBasedChatIntake());
    expect(await service.read('First problem message')).toEqual({
      engine: 'rules',
      model: null,
      reply: null,
      title: null,
      description: null,
      fields: {
        serviceId: null,
        categoryId: null,
        impact: null,
        urgency: null,
        affectedUsers: null,
      },
    });
  });

  it('passesTheCacheEngineThrough', async () => {
    const service = await serviceWithCatalog({
      read: vi.fn<ChatIntakePort['read']>().mockResolvedValue(cacheReading),
    });
    const result = await service.read('First problem message');
    expect(result).toMatchObject({
      engine: 'cache',
      model: cacheReading.model,
      title: cacheReading.title,
      reply: cacheReading.reply,
    });
  });
});

const fixtureSchema = z.object({
  entries: z.tuple([demoEntrySchema(), demoEntrySchema()]),
});

function demoEntrySchema() {
  return z.object({
    message: z.string(),
    model: z.string(),
    reading: z.object({
      title: z.string(),
      summary: z.string(),
      reply: z.string(),
      serviceName: z.object({ value: z.literal('Payment Gateway'), confidence: z.number() }),
    }),
  });
}

function demoEntries() {
  const path = new URL('../../../../ml/fixtures/chat_intake_cache.json', import.meta.url);
  return fixtureSchema.parse(JSON.parse(readFileSync(path, 'utf8'))).entries;
}

describe('demo incident similarity', () => {
  it('flagsTheTwoCachedChatIntakeDraftsAsSimilar', async () => {
    const [first, second] = demoEntries();
    async function cachedDraft(entry: typeof first) {
      const { title, summary, reply, serviceName } = entry.reading;
      const service = await serviceWithCatalog({
        read: vi.fn<ChatIntakePort['read']>().mockResolvedValue({
          ...cacheReading,
          model: entry.model,
          title,
          summary,
          reply,
          fields: {
            ...cacheReading.fields,
            serviceId: { value: payment.id, confidence: serviceName.confidence },
          },
        }),
      });
      const draft = await service.read(entry.message);
      return {
        title: z.string().parse(draft.title),
        description: z.string().parse(draft.description),
        serviceId: draft.fields.serviceId?.value,
      };
    }
    const [left, right] = await Promise.all([cachedDraft(first), cachedDraft(second)]);
    const similarity = new TextSimilarity();
    expect(similarity.isSimilar(similarity.score(left, right))).toBe(true);
  });

  it('flagsTheTwoRuleBasedDemoDraftsAsSimilar', () => {
    const [first, second] = demoEntries();
    function ruleDraft({ message }: typeof first) {
      // These demo messages each fit into the web's first-sentence title.
      expect(message).toMatch(/^[^.!?]{12,120}$/);
      return { title: message, description: message, serviceId: payment.id };
    }
    const similarity = new TextSimilarity();
    const score = similarity.score(ruleDraft(first), ruleDraft(second));
    expect(score.score).toBe(0.29);
    expect(similarity.isSimilar(score)).toBe(true);
  });
});
