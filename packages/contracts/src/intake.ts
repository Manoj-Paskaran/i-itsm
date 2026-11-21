import { z } from 'zod';

/**
 * AI-1 / INV-3: hybrid chat intake. The employee's first free-text message is read once
 * (Gemini, a cached Gemini answer, or nothing for rules); the rest of the chat stays rule-based.
 */
export const ChatIntakeRequestSchema = z.object({
  message: z.string().trim().min(3).max(2000),
});

/**
 * Who produced the answer: a live Gemini call, a replayed cached Gemini answer, or the
 * rule-based fallback (no understanding returned; the chat asks its own questions).
 */
export const IntakeEngineSchema = z.enum(['gemini', 'cache', 'rules']);

const confidence = z.number().min(0).max(1);
const level = z.number().int().min(1).max(4);
/** A value read from the message, with how sure the reader is (0–1). */
const guess = <T extends z.ZodType>(value: T) => z.object({ value, confidence }).nullable();

export const ChatIntakeFieldsSchema = z.object({
  serviceId: guess(z.uuid()),
  /** An active category, so a payment outage isn't left to the text classifier alone. */
  categoryId: guess(z.uuid()),
  impact: guess(level),
  urgency: guess(level),
  affectedUsers: guess(z.number().int().min(1).max(1_000_000)),
});

export const ChatIntakeResponseSchema = z.object({
  engine: IntakeEngineSchema,
  /** The Gemini model that produced the answer (also for a cached answer); null for rules. */
  model: z.string().nullable(),
  /** A short natural-language restatement; null for rules (the chat uses its own wording). */
  reply: z.string().nullable(),
  /** A clean rewrite, e.g. "Card payments failing at checkout"; null for rules. */
  title: z.string().nullable(),
  /** The clean summary followed by the employee's original words; null for rules. */
  description: z.string().nullable(),
  fields: ChatIntakeFieldsSchema,
});

export type ChatIntakeRequest = z.infer<typeof ChatIntakeRequestSchema>;
export type IntakeEngine = z.infer<typeof IntakeEngineSchema>;
export type ChatIntakeFields = z.infer<typeof ChatIntakeFieldsSchema>;
export type ChatIntakeResponse = z.infer<typeof ChatIntakeResponseSchema>;
