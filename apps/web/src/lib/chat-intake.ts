import type { ServiceSummary } from '@itsm/contracts';
import { CRITICALITY_LABEL, LEVEL_LABEL } from './incidents';
import { IMPACT_OPTIONS, URGENCY_OPTIONS, type ReportForm } from './report';

/**
 * INV-3: a rule-based guided chat that fills the same ReportForm as the classic form.
 * Each step is a small handler (State pattern): it asks one question, parses the reply with
 * explainable keyword rules, and either moves on or asks again. No AI is involved.
 */
export type IntakeStep = 'problem' | 'service' | 'impact' | 'urgency' | 'users' | 'review';
export interface ChatMessage {
  readonly from: 'bot' | 'user';
  readonly text: string;
}
export interface QuickReply {
  readonly label: string;
  /** Text sent as the user's reply when the chip is clicked. */
  readonly value: string;
}
export interface IntakeState {
  readonly step: IntakeStep;
  readonly form: ReportForm;
  readonly messages: readonly ChatMessage[];
}
interface StepResult {
  readonly patch?: Partial<ReportForm>;
  /** Set when the reply could not be understood: the bot says this and stays on the step. */
  readonly retry?: string;
  /** What the bot heard, echoed back before the next question. */
  readonly ack?: string;
}
interface StepHandler {
  readonly next: IntakeStep;
  ask(form: ReportForm, services: readonly ServiceSummary[]): string;
  quickReplies(services: readonly ServiceSummary[], form: ReportForm): QuickReply[];
  parse(text: string, services: readonly ServiceSummary[], form: ReportForm): StepResult;
}

/** Everyday words people use for each service, keyed by a word in the service name. */
const SERVICE_SYNONYMS: Record<string, readonly string[]> = {
  payment: ['pay', 'paying', 'payment', 'payments', 'checkout', 'card', 'transaction'],
  database: ['database', 'db', 'records', 'crm', 'query'],
  sign: ['login', 'log', 'sso', 'password', 'signin', 'sign', 'mfa', 'locked'],
  email: ['email', 'mail', 'outlook', 'inbox', 'calendar'],
  vpn: ['vpn', 'remote', 'tunnel'],
  storage: ['storage', 'upload', 'files', 'drive', 'share', 'download'],
  hr: ['hr', 'payroll', 'leave', 'payslip', 'profile', 'holiday'],
  laptop: ['laptop', 'screen', 'keyboard', 'battery', 'charger', 'computer', 'pc'],
};
const STOP = new Set(['on', 'of', 'the', 'and', 'a', 'in', 'to', 'is', 'it', 'my']);
const words = (text: string) =>
  (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w));

/** Name words too generic to point at one service ("customer can't pay" is about payments). */
const GENERIC = new Set(['customer', 'employee', 'corporate', 'single', 'cloud', 'portal']);
/**
 * Best service for free text: 2 points per distinctive word of its name, 1 per synonym.
 * Returns null when nothing matches or two services tie, so the bot asks instead of guessing.
 */
export function matchService(text: string, services: readonly ServiceSummary[]) {
  const said = new Set(words(text).map((w) => w.replace(/s$/, '')));
  const scored = services
    .map((service) => {
      const name = words(service.name).map((w) => w.replace(/s$/, ''));
      const own = name.filter((w) => !GENERIC.has(w) && said.has(w)).length;
      const synonyms = new Set(name.flatMap((w) => SERVICE_SYNONYMS[w] ?? []));
      const related = [...synonyms].filter(
        (w) => !name.includes(w) && said.has(w.replace(/s$/, '')),
      );
      return { service, score: 2 * own + related.length };
    })
    .sort((a, b) => b.score - a.score);
  const [first, second] = scored;
  if (!first?.score || first.score === second?.score) return null;
  return first.service;
}

const IMPACT_WORDS: [number, RegExp][] = [
  // "Down" as an outage but not "slowed down"; "everyone" only with a stoppage, not "everyone is slow".
  [
    4,
    /(?<!slow |slowed )\b(down|stopped|outage|cannot pay)\b|\b(nobody|no one) can\b|\b(everyone|everybody) (can'?t|cannot|is blocked|is stuck)\b|\bcustomers? can'?t\b/,
  ],
  [3, /\b(blocked|blocking|can'?t work|cannot work|no workaround|stuck)\b/],
  [2, /\b(slow|slowed|workaround|some)\b/],
  [1, /\b(minor|annoy|annoying|small|cosmetic)\b/],
];
const URGENCY_WORDS: [number, RegExp][] = [
  [4, /\b(now|immediately|asap|urgent|right away)\b/],
  [3, /\b(hours?|soon|this morning|this afternoon)\b/],
  [2, /\b(today|end of day|eod)\b/],
  [1, /\b(whenever|no rush|this week|later|not urgent)\b/],
];
const NEGATED =
  /\b(not|no|isn'?t|never)\s+(really\s+)?(urgent|rush|blocked|now|right now|stopped|down)\b/;
/**
 * Level 1–4 from a chip value ("3") or the first keyword rule that matches, most severe first.
 * A negated keyword ("not urgent", "not blocked") reads as `negatedLevel` instead.
 */
export function parseLevel(text: string, rules: [number, RegExp][], negatedLevel = 1) {
  const digit = /^\s*([1-4])\s*$/.exec(text);
  if (digit) return Number(digit[1]);
  const lower = normalise(text);
  if (NEGATED.test(lower)) return negatedLevel;
  return rules.find(([, re]) => re.test(lower))?.[0] ?? null;
}
const normalise = (text: string) => text.toLowerCase().replace(/[\u2018\u2019]/g, "'");

/** Head count from "about 200", "2,000 people", "just me" or "my team"; null if unclear. */
export function parseAffectedUsers(text: string) {
  const lower = text.toLowerCase();
  const number = /(\d[\d,]*)/.exec(lower);
  if (number) return Number(number[1]!.replace(/,/g, ''));
  if (/^\s*(just |only )?(me|myself)\b/.test(lower)) return 1;
  if (/\b(my team|team)\b/.test(lower)) return 10;
  return null;
}

/** First sentence as the title (3–120 chars); the whole message becomes the description. */
export function splitProblem(text: string) {
  const clean = text.trim().replace(/\s+/g, ' ');
  const sentence = /^(.+?[.!?])(\s|$)/.exec(clean)?.[1];
  // A greeting or abbreviation is no title ("Hi.", "e.g."): fall back to the whole text.
  const first = sentence && sentence.length >= 12 ? sentence : clean;
  const title = (first.length > 120 ? `${first.slice(0, 117)}…` : first).replace(/[.!?]$/, '');
  return { title, description: clean };
}

const levelReplies = (options: readonly { value: number; label: string }[]) =>
  options.map((o) => ({ label: o.label, value: String(o.value) }));
const optionLabel = (options: readonly { value: number; label: string }[], v: number) =>
  options.find((o) => o.value === v)?.label ?? String(v);

const STEPS: Record<Exclude<IntakeStep, 'review'>, StepHandler> = {
  problem: {
    next: 'service',
    ask: () => "Hi! What's going wrong? Describe it in a sentence or two.",
    quickReplies: () => [],
    parse(text) {
      const { title, description } = splitProblem(text);
      if (title.length < 3 || description.length < 10)
        return { retry: 'Could you say a little more? What did you try, and what did you see?' };
      return { patch: { title, description } };
    },
  },
  service: {
    next: 'impact',
    ask: (form, services) => {
      const guess = matchService(form.description, services);
      return guess
        ? `It sounds like ${guess.name}. Is that right? Pick it or choose another service.`
        : 'Which service is affected?';
    },
    quickReplies: (services, form) => {
      const guess = matchService(form.description, services);
      return [
        ...(guess ? [{ label: `Yes, ${guess.name}`, value: guess.name }] : []),
        ...services.filter((s) => s !== guess).map((s) => ({ label: s.name, value: s.name })),
      ];
    },
    parse(text, services, form) {
      if (!services.length)
        return { retry: 'The list of services is still loading. Please try again in a moment.' };
      const exact = services.find((s) => s.name.toLowerCase() === text.trim().toLowerCase());
      const confirmed = /^\s*(yes|yeah|yep|correct|right|that'?s right)\b/i.test(text)
        ? matchService(form.description, services)
        : null;
      const service = exact ?? confirmed ?? matchService(text, services);
      return service
        ? { patch: { serviceId: service.id }, ack: `${service.name} it is.` }
        : { retry: "I couldn't tell which service that is. Please pick one below." };
    },
  },
  impact: {
    next: 'urgency',
    ask: () => 'How badly is work affected?',
    quickReplies: () => levelReplies(IMPACT_OPTIONS),
    parse(text) {
      const impact = parseLevel(text, IMPACT_WORDS, 2);
      return impact
        ? { patch: { impact }, ack: `Noted: ${optionLabel(IMPACT_OPTIONS, impact).toLowerCase()}.` }
        : { retry: 'Please pick the option that fits best.' };
    },
  },
  urgency: {
    next: 'users',
    ask: () => 'How soon does it need fixing?',
    quickReplies: () => levelReplies(URGENCY_OPTIONS),
    parse(text) {
      const urgency = parseLevel(text, URGENCY_WORDS);
      return urgency ? { patch: { urgency } } : { retry: 'Please pick the option that fits best.' };
    },
  },
  users: {
    next: 'review',
    ask: () => 'About how many people are affected?',
    quickReplies: () => [
      { label: 'Just me', value: 'just me' },
      { label: 'My team', value: 'my team' },
      { label: 'About 200', value: '200' },
      { label: 'Everyone (2,000+)', value: '2000' },
    ],
    parse(text) {
      const users = parseAffectedUsers(text);
      return users && users >= 1 && users <= 1_000_000
        ? {
            patch: { affectedUsers: String(users) },
            ack: `Noted: about ${users.toLocaleString('en-IN')} ${users === 1 ? 'person' : 'people'}.`,
          }
        : { retry: 'Please give a number, like 5 or 200.' };
    },
  },
};

export function startIntake(form: ReportForm): IntakeState {
  return { step: 'problem', form, messages: [{ from: 'bot', text: STEPS.problem.ask(form, []) }] };
}

/** Applies one user reply: records it, parses it with the current step, then asks the next question. */
export function replyTo(
  state: IntakeState,
  text: string,
  services: readonly ServiceSummary[],
  /** What the chat shows as the user's message, e.g. a chip's label rather than its value. */
  shown = text,
): IntakeState {
  if (state.step === 'review' || !text.trim()) return state;
  const handler = STEPS[state.step];
  const messages = [...state.messages, { from: 'user' as const, text: shown.trim() }];
  const result = handler.parse(text, services, state.form);
  if (result.retry)
    return { ...state, messages: [...messages, { from: 'bot', text: result.retry }] };
  const form = { ...state.form, ...result.patch };
  const bot = [
    ...(result.ack ? [result.ack] : []),
    handler.next === 'review'
      ? 'Thanks. Here is your draft. Check it, then send it.'
      : STEPS[handler.next].ask(form, services),
  ].join(' ');
  return { step: handler.next, form, messages: [...messages, { from: 'bot', text: bot }] };
}

export function quickRepliesFor(state: IntakeState, services: readonly ServiceSummary[]) {
  return state.step === 'review' ? [] : STEPS[state.step].quickReplies(services, state.form);
}

/**
 * Plain-language restatement of what decides the priority. The server computes the real
 * priority (impact × urgency × service criticality, scaled by head count) when it is sent.
 */
export function priorityPreview(form: ReportForm, service: ServiceSummary | undefined) {
  if (!form.impact || !form.urgency || !service) return '';
  const people = Number(form.affectedUsers).toLocaleString('en-IN');
  return (
    `Impact ${LEVEL_LABEL[form.impact]} × urgency ${LEVEL_LABEL[form.urgency]} on a ` +
    `${CRITICALITY_LABEL[service.criticality]}${service.criticality === 4 ? '' : '-criticality'} service, ${people} ${people === '1' ? 'person' : 'people'} affected. ` +
    'We set the exact priority and SLA when you send it.'
  );
}
