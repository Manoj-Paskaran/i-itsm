import type { ChatIntakeResponse, IntakeEngine, ServiceSummary } from '@itsm/contracts';
import { CRITICALITY_LABEL, LEVEL_LABEL } from './incidents';
import { IMPACT_OPTIONS, reportErrors, URGENCY_OPTIONS, type ReportForm } from './report';

/**
 * AI-1 / INV-3: a first-message reading can prefill the guided chat's report.
 * Each step is a small handler (State pattern): it asks one question, parses the reply with
 * explainable keyword rules, and either moves on or asks again.
 */
export type IntakeStep = 'problem' | 'service' | 'impact' | 'urgency' | 'users' | 'review';
export interface ChatMessage {
  readonly from: 'bot' | 'user';
  readonly text: string;
  readonly source?: IntakeEngine;
}
export interface QuickReply {
  readonly label: string;
  /** Text sent as the user's reply when the chip is clicked. */
  readonly value: string;
  readonly suggested?: boolean;
}
export interface IntakeState {
  readonly step: IntakeStep;
  readonly form: ReportForm;
  readonly messages: readonly ChatMessage[];
  readonly suggestions?: Partial<
    Pick<ReportForm, 'serviceId' | 'impact' | 'urgency' | 'affectedUsers'>
  >;
}
export const SKIP_CONFIDENCE = 0.8;
export const CONFIRM_CONFIDENCE = 0.5;
interface StepResult {
  readonly patch?: Partial<ReportForm>;
  /** Set when the reply could not be understood: the bot says this and stays on the step. */
  readonly retry?: string;
  /** What the bot heard, echoed back before the next question. */
  readonly ack?: string;
}
interface StepHandler {
  readonly next: Exclude<IntakeStep, 'problem'>;
  ask(state: IntakeState, services: readonly ServiceSummary[]): string;
  quickReplies(services: readonly ServiceSummary[], state: IntakeState): QuickReply[];
  parse(text: string, services: readonly ServiceSummary[], state: IntakeState): StepResult;
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

const IMPACT_ACK: Record<number, string> = {
  1: 'Got it, you can still work normally.',
  2: 'Got it, some work is slowed down.',
  3: 'Got it, important work is blocked.',
  4: 'I see, the business has stopped.',
};
const URGENCY_ACK: Record<number, string> = {
  1: 'Understood, it can wait until someone is free.',
  2: 'Understood, it needs fixing today.',
  3: 'Understood, it needs fixing within the next few hours.',
  4: 'Understood, it needs fixing right now.',
};

function suggestedService(state: IntakeState, services: readonly ServiceSummary[]) {
  return state.suggestions
    ? services.find((service) => service.id === state.suggestions?.serviceId)
    : matchService(state.form.description, services);
}

const affirmative = /^\s*(yes|yeah|yep|correct|right|that'?s right)\b/i;
const confirmsSuggestion = /^(yes|yeah|yep|correct|right|that'?s right)[.!]?$/;

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
    ask: (state, services) => {
      const guess = suggestedService(state, services);
      return guess
        ? `This sounds like ${guess.name}. Is that right?`
        : 'Which service is affected?';
    },
    quickReplies: (services, state) => {
      const guess = suggestedService(state, services);
      return [
        ...(guess ? [{ label: `Yes, ${guess.name}`, value: guess.name, suggested: true }] : []),
        ...services.filter((s) => s !== guess).map((s) => ({ label: s.name, value: s.name })),
      ];
    },
    parse(text, services, state) {
      if (!services.length)
        return { retry: 'The list of services is still loading. Please try again in a moment.' };
      const exact = services.find((s) => s.name.toLowerCase() === text.trim().toLowerCase());
      const confirmed = affirmative.test(text) ? suggestedService(state, services) : null;
      const service = exact ?? confirmed ?? matchService(text, services);
      return service
        ? { patch: { serviceId: service.id }, ack: `${service.name} it is.` }
        : { retry: "I couldn't tell which service that is. Please pick one below." };
    },
  },
  impact: {
    next: 'urgency',
    ask: ({ suggestions }) => {
      const option = IMPACT_OPTIONS.find(({ value }) => value === suggestions?.impact);
      return option
        ? `It sounds like ${option.label.toLowerCase()}. Is that right?`
        : 'How badly is work affected?';
    },
    quickReplies: () => levelReplies(IMPACT_OPTIONS),
    parse(text) {
      const impact = parseLevel(text, IMPACT_WORDS, 2);
      return impact
        ? { patch: { impact }, ack: IMPACT_ACK[impact] }
        : { retry: 'Please pick the option that fits best.' };
    },
  },
  urgency: {
    next: 'users',
    ask: ({ suggestions }) => {
      const option = URGENCY_OPTIONS.find(({ value }) => value === suggestions?.urgency);
      return option
        ? `It sounds like it needs fixing ${option.label.toLowerCase()}. Is that right?`
        : 'How soon does it need fixing?';
    },
    quickReplies: () => levelReplies(URGENCY_OPTIONS),
    parse(text) {
      const urgency = parseLevel(text, URGENCY_WORDS);
      return urgency
        ? { patch: { urgency }, ack: URGENCY_ACK[urgency] }
        : { retry: 'Please pick the option that fits best.' };
    },
  },
  users: {
    next: 'review',
    ask: ({ suggestions }) =>
      suggestions?.affectedUsers
        ? `It sounds like this affects ${formatPeopleAffected(Number(suggestions.affectedUsers))}. Is that right?`
        : 'About how many people are affected?',
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
            ack:
              users === 1
                ? 'Just you, then.'
                : `About ${users.toLocaleString('en-IN')} people, then.`,
          }
        : { retry: 'Please give a number, like 5 or 200.' };
    },
  },
};

export function startIntake(form: ReportForm): IntakeState {
  const state: IntakeState = { step: 'problem', form, messages: [] };
  return { ...state, messages: [{ from: 'bot', text: STEPS.problem.ask(state, []) }] };
}

const FIELDS_BY_STEP = {
  service: 'serviceId',
  impact: 'impact',
  urgency: 'urgency',
  users: 'affectedUsers',
} as const;

function nextQuestion(
  state: IntakeState,
  step: StepHandler['next'],
  services: readonly ServiceSummary[],
  ack?: string,
  source?: IntakeEngine,
): IntakeState {
  if (state.suggestions) {
    while (step !== 'review' && state.form[FIELDS_BY_STEP[step]]) {
      step = STEPS[step].next;
    }
  }
  const question =
    step === 'review' ? 'That’s everything I need.' : STEPS[step].ask(state, services);
  const text = ack ? `${ack} ${question}` : question;
  return {
    ...state,
    step,
    messages: [...state.messages, { from: 'bot', text, ...(source && { source }) }],
  };
}

type Guess<T> = { value: T; confidence: number } | null;
const high = <T>(guess: Guess<T>) =>
  guess && guess.confidence >= SKIP_CONFIDENCE ? guess.value : undefined;
const medium = <T>(guess: Guess<T>) =>
  guess && guess.confidence >= CONFIRM_CONFIDENCE && guess.confidence < SKIP_CONFIDENCE
    ? guess.value
    : undefined;

/** Uses the first-message reading, leaving uncertain answers to the guided steps. */
export function applyReading(
  state: IntakeState,
  message: string,
  reading: ChatIntakeResponse | null,
  services: readonly ServiceSummary[],
): IntakeState {
  if (state.step !== 'problem' || !message.trim()) return state;
  if (!reading?.title?.trim() || reading.engine === 'rules')
    return replyTo(state, message, services);
  const { serviceId, categoryId, impact, urgency, affectedUsers } = reading.fields;
  const users = high(affectedUsers);
  const suggestedUsers = medium(affectedUsers);
  const form: ReportForm = {
    ...state.form,
    title: reading.title,
    description: reading.description ?? splitProblem(message).description,
    categoryId: categoryId?.value,
    categoryBasis: {
      serviceId: serviceId && serviceId.confidence >= CONFIRM_CONFIDENCE ? serviceId.value : '',
      title: reading.title,
      description: reading.description ?? splitProblem(message).description,
    },
    serviceId: high(serviceId) ?? state.form.serviceId,
    impact: high(impact) ?? state.form.impact,
    urgency: high(urgency) ?? state.form.urgency,
    // The classic form starts at one person, which isn't an answer from the reporter.
    affectedUsers:
      users === undefined
        ? state.form.affectedUsers === '1'
          ? ''
          : state.form.affectedUsers
        : String(users),
  };
  return nextQuestion(
    {
      ...state,
      form,
      suggestions: {
        serviceId: medium(serviceId),
        impact: medium(impact),
        urgency: medium(urgency),
        affectedUsers: suggestedUsers === undefined ? undefined : String(suggestedUsers),
      },
      messages: [...state.messages, { from: 'user', text: message.trim() }],
    },
    'service',
    services,
    reading.reply ?? undefined,
    reading.engine,
  );
}

function suggestedAnswer(state: IntakeState) {
  const { step, suggestions, form } = state;
  if (step === 'problem' || step === 'review' || step === 'service') return undefined;
  const field = FIELDS_BY_STEP[step];
  // An answer edited in the form wins over the reading's guess.
  return form[field] ? undefined : suggestions?.[field];
}

/**
 * The chat's category, only while the draft still describes what the reading saw: the same
 * service and text. Otherwise (a different service, or the problem rewritten in the form) the
 * API's classifier decides, so a laptop report never keeps a payment outage's category.
 */
export function chatCategoryId(form: ReportForm) {
  const basis = form.categoryBasis;
  return form.categoryId &&
    basis &&
    basis.serviceId === form.serviceId &&
    basis.title === form.title &&
    basis.description === form.description
    ? form.categoryId
    : undefined;
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
  const suggestion = suggestedAnswer(state);
  const answer =
    suggestion && confirmsSuggestion.test(normalise(text).trim()) ? String(suggestion) : text;
  const result = handler.parse(answer, services, state);
  if (result.retry)
    return { ...state, messages: [...messages, { from: 'bot', text: result.retry }] };
  const form = { ...state.form, ...result.patch };
  return nextQuestion({ ...state, form, messages }, handler.next, services, result.ack);
}

export function quickRepliesFor(state: IntakeState, services: readonly ServiceSummary[]) {
  if (state.step === 'review') return [];
  const replies = STEPS[state.step].quickReplies(services, state);
  const suggestion = suggestedAnswer(state);
  if (!suggestion) return replies;
  const matching = replies.find(({ value }) =>
    state.step === 'users'
      ? parseAffectedUsers(value) === Number(suggestion)
      : value === String(suggestion),
  );
  const option = matching ?? {
    label: formatPeopleAffected(Number(suggestion)),
    value: String(suggestion),
  };
  return [{ ...option, suggested: true }, ...replies.filter((reply) => reply !== matching)];
}

export function formatPeopleAffected(people: number) {
  return people === 1 ? '1 (just you)' : `${people.toLocaleString('en-IN')} people`;
}

export function priorityPreviewRows(
  form: ReportForm,
  service: ServiceSummary | undefined,
  mode: 'form' | 'chat' = 'form',
) {
  if (!form.impact || !form.urgency || !service) return null;
  const criticality = CRITICALITY_LABEL[service.criticality];
  if (!criticality) return null;
  const serviceFactor = { label: 'Service criticality', value: criticality };
  if (mode === 'chat') return [serviceFactor];
  const factors = [
    { label: 'Impact', value: LEVEL_LABEL[form.impact]! },
    { label: 'Urgency', value: LEVEL_LABEL[form.urgency]! },
    serviceFactor,
  ] as const;
  if (reportErrors(form).affectedUsers) return factors;
  return [
    ...factors,
    { label: 'People affected', value: formatPeopleAffected(Number(form.affectedUsers)) },
  ] as const;
}
