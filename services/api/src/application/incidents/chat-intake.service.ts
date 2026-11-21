import { Logger } from '@nestjs/common';
import type { ChatIntakeResponse } from '@itsm/contracts';
import type { CategoryRepository, ChatIntakePort, ItServiceRepository } from '../../ports/index.js';

export class ChatIntakeService {
  private readonly logger = new Logger(ChatIntakeService.name);

  constructor(
    private readonly services: ItServiceRepository,
    private readonly categories: CategoryRepository,
    private readonly reader: ChatIntakePort,
  ) {}

  async read(originalMessage: string): Promise<ChatIntakeResponse> {
    const [services, categories] = await Promise.all([
      this.services.listActive(),
      this.categories.listActive(),
    ]);
    const active = services.map((service) => ({
      id: service.id(),
      name: service.name(),
    }));
    const categoryIds = new Map(
      categories.map((category) => [category.toSnapshot().code.toLowerCase(), category.id()]),
    );
    const { engine, model, reply, title, summary, fields } = await this.reader.read(
      originalMessage,
      active,
      [...categoryIds.keys()],
    );
    const service = active.find(({ id }) => id === fields.serviceId?.value);
    const { categoryCode, ...guesses } = fields;
    const { impact, urgency } = guesses;
    const categoryId = categoryIds.get(categoryCode?.value.toLowerCase() ?? '');
    const details = [
      service && `service ${service.name}`,
      impact && `impact ${impact.value} (${impact.confidence})`,
      urgency && `urgency ${urgency.value} (${urgency.confidence})`,
    ].filter(Boolean);
    this.logger.log(
      `chat intake via ${engine}${model ? ` (${model})` : ''}${details.length ? `: ${details.join(', ')}` : ''}`,
    );
    return {
      engine,
      model,
      reply: engine === 'rules' ? null : reply,
      title: engine === 'rules' ? null : title,
      description:
        engine === 'rules' || summary === null
          ? null
          : `${summary}\n\nIn the reporter's words: "${originalMessage}"`,
      fields: {
        ...guesses,
        serviceId: service ? guesses.serviceId : null,
        categoryId: categoryId && categoryCode ? { ...categoryCode, value: categoryId } : null,
      },
    };
  }
}
