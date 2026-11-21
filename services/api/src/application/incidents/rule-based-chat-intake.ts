import type { ChatIntakePort, ChatIntakeReading } from '../../ports/chat-intake.js';

/** Fallback Strategy that leaves every question to the guided chat. */
export class RuleBasedChatIntake implements ChatIntakePort {
  read(): Promise<ChatIntakeReading> {
    return Promise.resolve({
      engine: 'rules',
      model: null,
      reply: null,
      title: null,
      summary: null,
      fields: {
        serviceId: null,
        categoryCode: null,
        impact: null,
        urgency: null,
        affectedUsers: null,
      },
    });
  }
}
