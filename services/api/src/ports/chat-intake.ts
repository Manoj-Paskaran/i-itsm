import type { ChatIntakeFields, IntakeEngine } from '@itsm/contracts';

export const CHAT_INTAKE_PORT = Symbol('CHAT_INTAKE_PORT');

export interface ChatIntakeCatalogService {
  readonly id: string;
  readonly name: string;
}

export interface ChatIntakeReading {
  engine: IntakeEngine;
  model: string | null;
  reply: string | null;
  title: string | null;
  summary: string | null;
  fields: Omit<ChatIntakeFields, 'categoryId'> & {
    categoryCode: { value: string; confidence: number } | null;
  };
}

/** Reads an employee's first message against the current service and category catalogs. */
export interface ChatIntakePort {
  read(
    message: string,
    services: readonly ChatIntakeCatalogService[],
    categories: readonly string[],
  ): Promise<ChatIntakeReading>;
}
