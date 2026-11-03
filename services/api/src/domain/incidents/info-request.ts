import { InvalidIncidentException } from '../exceptions/index.js';
import { Instant, type UserId } from '../shared/index.js';
import { incidentText } from './validation.js';

export interface InfoRequestSnapshot {
  readonly question: string;
  readonly askedBy: UserId | null;
  readonly askedAt: string;
  readonly answer?: string;
  readonly answeredAt?: string;
}
/** Mutable only inside the aggregate; queries return detached copies. */
export class InfoRequest {
  readonly question: string;
  private answerText: string | undefined;
  private answeredAt: Instant | undefined;
  constructor(
    question: string,
    readonly askedBy: UserId | null,
    readonly askedAt: Instant,
  ) {
    this.question = incidentText(question, 'question', 1, 5000);
  }
  answer(text: string, at: Instant): void {
    if (!this.isOpen()) throw new InvalidIncidentException('information request already answered');
    const answer = incidentText(text, 'answer', 1, 5000);
    this.answerText = answer;
    this.answeredAt = at;
  }
  isOpen(): boolean {
    return this.answerText === undefined;
  }
  toSnapshot(): InfoRequestSnapshot {
    return {
      question: this.question,
      askedBy: this.askedBy,
      askedAt: this.askedAt.toIso(),
      ...(this.answerText === undefined
        ? {}
        : { answer: this.answerText, answeredAt: this.answeredAt!.toIso() }),
    };
  }
  static rehydrate(s: InfoRequestSnapshot): InfoRequest {
    if ((s.answer === undefined) !== (s.answeredAt === undefined))
      throw new InvalidIncidentException('answer and answeredAt must be supplied together');
    const request = new InfoRequest(s.question, s.askedBy, Instant.fromIso(s.askedAt));
    if (s.answer !== undefined && s.answeredAt !== undefined)
      request.answer(s.answer, Instant.fromIso(s.answeredAt));
    return request;
  }
}
