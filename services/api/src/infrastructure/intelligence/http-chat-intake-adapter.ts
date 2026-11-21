import { ChatIntakeFieldsSchema } from '@itsm/contracts';
import { z } from 'zod';
import type { ChatIntakeCatalogService, ChatIntakePort } from '../../ports/chat-intake.js';

const { serviceId, categoryId, impact, urgency, affectedUsers } = ChatIntakeFieldsSchema.shape;
const nonEmpty = z.string().trim().min(1);
const rulesFields = z.strictObject({
  serviceId: z.null(),
  categoryCode: z.null(),
  impact: z.null(),
  urgency: z.null(),
  affectedUsers: z.null(),
});
const readingSchema = z.discriminatedUnion('engine', [
  z.strictObject({
    engine: z.enum(['gemini', 'cache']),
    model: nonEmpty,
    reply: nonEmpty.max(200).refine((text) => !text.includes('?')),
    title: nonEmpty.max(80),
    summary: nonEmpty,
    fields: z.strictObject({
      serviceId: serviceId.unwrap().strict().nullable(),
      categoryCode: categoryId.unwrap().extend({ value: nonEmpty }).strict().nullable(),
      impact: impact.unwrap().strict().nullable(),
      urgency: urgency.unwrap().strict().nullable(),
      affectedUsers: affectedUsers.unwrap().strict().nullable(),
    }),
  }),
  z.strictObject({
    engine: z.literal('rules'),
    model: z.null(),
    reply: z.null(),
    title: z.null(),
    summary: z.null(),
    fields: rulesFields,
  }),
]);

/** HTTP Adapter for the ML reader, with a local rules Strategy on transport or contract failure. */
export class HttpChatIntakeAdapter implements ChatIntakePort {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly fallback: ChatIntakePort,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async read(
    message: string,
    services: readonly ChatIntakeCatalogService[],
    categories: readonly string[],
  ): ReturnType<ChatIntakePort['read']> {
    try {
      const response = await this.fetchFn(`${this.baseUrl.replace(/\/+$/, '')}/v1/chat-intake`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, services, categories }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new Error('ML chat intake request failed');
      const reading = readingSchema.parse(await response.json());
      const serviceGuess = reading.fields.serviceId;
      if (serviceGuess && !services.some((service) => service.id === serviceGuess.value))
        throw new Error('ML chat intake returned an unknown service');
      return reading;
    } catch {
      return this.fallback.read(message, services, categories);
    }
  }
}
