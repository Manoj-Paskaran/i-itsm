import type { ChatIntakeResponse } from '@itsm/contracts';
import { describe, expect, it } from 'vitest';
import { reportErrors } from './report';
import {
  applyReading,
  chatCategoryId,
  matchService,
  parseAffectedUsers,
  parseLevel,
  priorityPreviewRows,
  quickRepliesFor,
  replyTo,
  splitProblem,
  startIntake,
} from './chat-intake';

const svc = (id: string, name: string, criticality = 2) => ({ id, name, criticality });
const services = [
  svc('db', 'Customer Database', 3),
  svc('vpn', 'VPN', 3),
  svc('pay', 'Payment Gateway', 4),
  svc('sso', 'Single Sign-On', 3),
  svc('mail', 'Corporate Email'),
  svc('laptop', 'Employee Laptops', 1),
];
const empty = {
  title: '',
  description: '',
  serviceId: '',
  impact: null,
  urgency: null,
  affectedUsers: '1',
};
const say = (texts: string[]) =>
  texts.reduce((state, t) => replyTo(state, t, services), startIntake(empty));
const problem = 'Card payments fail at checkout for every customer.';
const reading: ChatIntakeResponse = {
  engine: 'gemini',
  model: 'gemini-test',
  title: 'Card payments failing at checkout',
  description: 'Customers cannot pay by card.',
  reply: 'Sounds like card payments are failing at checkout.',
  fields: {
    serviceId: { value: 'pay', confidence: 0.96 },
    categoryId: { value: 'application', confidence: 0.8 },
    impact: { value: 4, confidence: 0.8 },
    urgency: { value: 4, confidence: 0.7 },
    affectedUsers: null,
  },
};
/** Answers through the real step handlers, so the real keyword tables are what is tested. */
const impactFor = (answer: string) => replyTo(say([problem, 'yes']), answer, services).form.impact;
const urgencyFor = (answer: string) =>
  replyTo(say([problem, 'yes', '3']), answer, services).form.urgency;

describe('chat intake', () => {
  it('matchesServiceFromEverydayWords', () => {
    expect(matchService('Customers cannot pay by card at checkout', services)?.id).toBe('pay');
    expect(matchService('I am locked out, my password fails at login', services)?.id).toBe('sso');
    expect(matchService('Outlook will not open my inbox', services)?.id).toBe('mail');
  });
  it('prefersAServiceNamedInTheTextOverASynonym', () => {
    expect(matchService("I can't log in to my email", services)?.id).toBe('mail');
    expect(matchService('VPN password rejected', services)?.id).toBe('vpn');
    expect(matchService("A customer can't pay", services)?.id).toBe('pay');
  });
  it('matchesNoServiceOnATie', () =>
    expect(matchService('password and outlook', services)).toBeNull());
  it.each([
    ['Nobody can pay at the tills', 4],
    ['The site is down', 4],
    ["It's down", 4],
    ['Email down for everyone', 4],
    ["Everyone can't pay", 4],
    ['Everyone is blocked', 4],
    ['Everyone is slow today', 2],
    ['we are blocked, no workaround', 3],
    ['It\u2019s blocking my work', 3],
    ['I can\u2019t work at all', 3],
    ['The whole team is slowed down', 2],
    ["It's slow but there is a workaround", 2],
    ['we are not blocked', 2],
    ['Just a small annoyance', 1],
  ])('readsImpactFrom %j as level %i', (answer, level) => expect(impactFor(answer)).toBe(level));
  it.each([
    ['We need it right now', 4],
    ['urgent please', 4],
    ['within a few hours', 3],
    ['sometime today', 2],
    ['not urgent', 1],
    ['not right now, whenever', 1],
    ['not really urgent', 1],
  ])('readsUrgencyFrom %j as level %i', (answer, level) => expect(urgencyFor(answer)).toBe(level));
  it('reAsksImpactItCannotRead', () => {
    const state = replyTo(say([problem, 'yes']), 'hmm', services);
    expect(state.step).toBe('impact');
    expect(state.messages.at(-1)?.text).toMatch(/pick the option/);
  });
  it('confirmsTheSuggestedServiceWithYes', () => {
    const state = say(['Card payments fail at checkout for every customer.', 'yes']);
    expect(state.step).toBe('impact');
    expect(state.form.serviceId).toBe('pay');
  });
  it('offersTheSuggestedServiceAsTheFirstChip', () =>
    expect(quickRepliesFor(say(['Card payments fail at checkout today.']), services)[0]).toEqual({
      label: 'Yes, Payment Gateway',
      value: 'Payment Gateway',
      suggested: true,
    }));
  it('asksToWaitWhileServicesLoad', () => {
    const start = replyTo(startIntake(empty), 'Card payments fail at checkout.', []);
    expect(replyTo(start, 'Payment Gateway', []).messages.at(-1)?.text).toMatch(/still loading/);
  });
  it('matchesNoServiceWhenNothingFits', () =>
    expect(matchService('Something is weird on the floor', services)).toBeNull());
  it('ignoresStopWordsInServiceNames', () =>
    expect(matchService('Turned it on again', services)).toBeNull());
  it('readsAChipValueBeforeAnyKeyword', () => expect(parseLevel(' 3 ', [[4, /3/]])).toBe(3));
  it('readsHeadCountFromNumbersAndPhrases', () => {
    expect(parseAffectedUsers('about 2,000 people')).toBe(2000);
    expect(parseAffectedUsers('just me')).toBe(1);
    expect(parseAffectedUsers('my team')).toBe(10);
    expect(parseAffectedUsers('lots')).toBeNull();
    expect(parseAffectedUsers('everyone except me')).toBeNull();
  });
  it('takesFirstSentenceAsTitleAndWholeTextAsDescription', () =>
    expect(splitProblem('Checkout is failing.  Cards time out since 9am.')).toEqual({
      title: 'Checkout is failing',
      description: 'Checkout is failing. Cards time out since 9am.',
    }));
  it('usesTheWholeTextWhenTheFirstSentenceIsAGreeting', () =>
    expect(splitProblem('Hi. VPN is down for me').title).toBe('Hi. VPN is down for me'));
  it('asksAgainWhenTheProblemIsTooShort', () => {
    const state = say(['help']);
    expect(state.step).toBe('problem');
    expect(state.messages.at(-1)?.text).toMatch(/say a little more/);
  });
  it('suggestsTheMatchedServiceAfterTheProblem', () => {
    const state = say(['Card payments fail at checkout for every customer.']);
    expect(state.step).toBe('service');
    expect(state.messages.at(-1)?.text).toBe('This sounds like Payment Gateway. Is that right?');
    expect(quickRepliesFor(state, services).map((r) => r.label)).toContain('Yes, Payment Gateway');
  });
  it('offersFullProblemExamplesThatSendTheirOwnTextAndMatchSeededServices', () => {
    const examples = quickRepliesFor(startIntake(empty), services);
    expect(examples.map(({ label }) => label)).toEqual([
      "hey the card payment thing on the website isn't working, customers keep complaining they can't pay",
      'My laptop screen flickers when I connect the office dock.',
      'The VPN disconnects every few minutes when I work from home.',
    ]);
    expect(examples.map(({ value }) => matchService(value, services)?.id)).toEqual([
      'pay',
      'laptop',
      'vpn',
    ]);
    expect(examples.every(({ label, value }) => label === value)).toBe(true);
  });
  it('fillsTheSameFormStateAsTheClassicForm', () => {
    const state = say([problem, 'Payment Gateway', '4', 'right now please', 'about 200']);
    expect(state.step).toBe('review');
    expect(state.form).toEqual({
      title: 'Card payments fail at checkout for every customer',
      description: 'Card payments fail at checkout for every customer.',
      serviceId: 'pay',
      impact: 4,
      urgency: 4,
      affectedUsers: '200',
    });
    expect(quickRepliesFor(state, services)).toEqual([]);
    expect(reportErrors(state.form)).toEqual({});
  });
  it('reAsksAHeadCountOutsideTheAllowedRange', () => {
    const atUsers = say([problem, 'yes', '3', '3']);
    expect(replyTo(atUsers, '0', services).step).toBe('users');
    expect(replyTo(atUsers, '2000000', services).step).toBe('users');
  });
  it('confirmsTheServiceAndAcknowledgesTheImpactInPlainLanguage', () => {
    const state = say([problem, 'yes', '3']);
    expect(state.messages.at(-3)?.text).toBe('Payment Gateway it is. How badly is work affected?');
    expect(state.messages.at(-1)?.text).toBe(
      'Got it, important work is blocked. How soon does it need fixing?',
    );
  });
  it.each([
    ['1', 'Understood, it can wait until someone is free.'],
    ['2', 'Understood, it needs fixing today.'],
    ['3', 'Understood, it needs fixing within the next few hours.'],
    ['4', 'Understood, it needs fixing right now.'],
  ])('acknowledgesUrgencyLevel %s InPlainLanguage', (answer, acknowledgement) => {
    expect(say([problem, 'yes', '3', answer]).messages.at(-1)?.text).toBe(
      `${acknowledgement} About how many people are affected?`,
    );
  });
  it.each([
    ['just me', 'Just you, then.'],
    ['5000', 'About 5,000 people, then.'],
  ])('acknowledgesHeadCount %j AndPromptsForReviewInOneBotMessage', (answer, acknowledgement) => {
    const state = say([problem, 'yes', '3', '2']);
    const next = replyTo(state, answer, services);
    expect(next.messages.slice(state.messages.length)).toEqual([
      { from: 'user', text: answer },
      {
        from: 'bot',
        text: `${acknowledgement} That’s everything I need.`,
      },
    ]);
  });
  it('ignoresRepliesOnceTheDraftIsReady', () => {
    const review = say([problem, 'yes', '3', '3', '200']);
    expect(replyTo(review, 'one more thing', services)).toBe(review);
  });
  it('shortensAVeryLongFirstSentenceForTheTitle', () => {
    const { title } = splitProblem(`${'Payments fail '.repeat(12)}.`);
    expect(title).toHaveLength(118);
    expect(title.endsWith('…')).toBe(true);
  });
  it('showsTheChipLabelButParsesItsValue', () => {
    const atImpact = say(['Card payments fail at checkout for everyone.', 'Payment Gateway']);
    const state = replyTo(atImpact, '3', services, 'Important work is blocked');
    expect(state.form.impact).toBe(3);
    expect(state.messages.at(-2)).toEqual({ from: 'user', text: 'Important work is blocked' });
  });
  it('staysOnAStepItCannotUnderstand', () => {
    const state = say(['Card payments fail at checkout for everyone.', 'the blue one']);
    expect(state.step).toBe('service');
    expect(state.messages.at(-1)?.text).toMatch(/pick one below/);
  });
  it('showsOnlyServiceCriticalityInTheChatPriorityPreview', () => {
    const { form } = say([problem, 'yes', '3', '2', 'just me']);
    expect(priorityPreviewRows(form, services[2], 'chat')).toEqual([
      { label: 'Service criticality', value: 'Mission-critical' },
    ]);
  });
  it('omitsAnInvalidHeadCountFromTheFormPriorityPreview', () => {
    const form = { ...empty, impact: 3, urgency: 2, affectedUsers: '' };
    expect(priorityPreviewRows(form, services[2])?.map(({ label }) => label)).toEqual([
      'Impact',
      'Urgency',
      'Service criticality',
    ]);
  });
  it.each([
    ['1', '1 (just you)'],
    ['5000', '5,000 people'],
  ])('showsAllFormPriorityFactorsAndFormatsHeadCountFor %s', (affectedUsers, wording) => {
    expect(
      priorityPreviewRows({ ...empty, impact: 4, urgency: 3, affectedUsers }, services[2]),
    ).toEqual([
      { label: 'Impact', value: 'Critical' },
      { label: 'Urgency', value: 'High' },
      { label: 'Service criticality', value: 'Mission-critical' },
      { label: 'People affected', value: wording },
    ]);
  });
});

describe('first-message reading', () => {
  it('sendsTheChatCategoryOnlyForTheServiceAndTextTheReadingSaw', () => {
    const state = applyReading(startIntake(empty), problem, reading, services);
    expect(chatCategoryId(state.form)).toBe('application');
    expect(chatCategoryId({ ...state.form, serviceId: 'laptop' })).toBeUndefined();
    expect(
      chatCategoryId({ ...state.form, description: 'My laptop screen flickers on the dock.' }),
    ).toBeUndefined();
  });

  it('dropsTheReadingsSuggestionOnceTheFormAnswersIt', () => {
    const state = applyReading(startIntake(empty), problem, reading, services);
    expect(state.step).toBe('urgency');
    const edited = { ...state, form: { ...state.form, urgency: 1 } };
    expect(quickRepliesFor(edited, services).some((reply) => reply.suggested)).toBe(false);
    expect(replyTo(edited, 'yes', services).form.urgency).toBe(1);
  });

  it('skipsQuestionsGeminiAnswered', () => {
    const state = applyReading(startIntake(empty), problem, reading, services);
    expect(state.step).toBe('urgency');
    expect(state.form).toMatchObject({
      title: reading.title,
      description: reading.description,
      categoryId: 'application',
      serviceId: 'pay',
      impact: 4,
      urgency: null,
    });
    const allButUrgency = {
      ...reading,
      fields: { ...reading.fields, affectedUsers: { value: 2000, confidence: 0.8 } },
    };
    const next = applyReading(startIntake(empty), problem, allButUrgency, services);
    const review = replyTo(next, '4', services);
    expect(review.step).toBe('review');
    expect(review.form.affectedUsers).toBe('2000');
    expect(review.messages.at(-1)?.text).toContain('That’s everything I need.');
  });

  it('confirmsAMediumConfidenceGuessWithASuggestedChip', () => {
    const medium = {
      ...reading,
      fields: {
        ...reading.fields,
        serviceId: { value: 'pay', confidence: 0.5 },
        impact: { value: 3, confidence: 0.6 },
        affectedUsers: { value: 35, confidence: 0.7 },
      },
    };
    let state = applyReading(startIntake(empty), problem, medium, services);
    for (const [step, label, question, answer] of [
      [
        'service',
        'Yes, Payment Gateway',
        'This sounds like Payment Gateway. Is that right?',
        'yes',
      ],
      [
        'impact',
        'Important work is blocked',
        'It sounds like important work is blocked. Is that right?',
        '2',
      ],
      ['urgency', 'Right now', 'It sounds like it needs fixing right now. Is that right?', '4'],
      ['users', '35 people', 'It sounds like this affects 35 people. Is that right?', '35'],
    ]) {
      expect(state.step).toBe(step);
      expect(state.messages.at(-1)?.text).toContain(question);
      expect(quickRepliesFor(state, services)[0]).toMatchObject({ label, suggested: true });
      state = replyTo(state, answer!, services);
    }
    expect(state.form).toMatchObject({
      serviceId: 'pay',
      impact: 2,
      urgency: 4,
      affectedUsers: '35',
    });
  });

  it('asksNormallyWhenConfidenceIsLow', () => {
    const low = {
      ...reading,
      fields: {
        ...reading.fields,
        serviceId: { value: 'pay', confidence: 0.49 },
        impact: { value: 4, confidence: 0.49 },
        urgency: null,
      },
    };
    let state = applyReading(startIntake(empty), problem, low, services);
    expect(state.messages.at(-1)?.text).toContain('Which service is affected?');
    expect(quickRepliesFor(state, services).some(({ suggested }) => suggested)).toBe(false);
    state = replyTo(state, 'Payment Gateway', services);
    expect(state.messages.at(-1)?.text).toContain('How badly is work affected?');
    state = replyTo(state, '2', services);
    expect(state.messages.at(-1)?.text).toContain('How soon does it need fixing?');
  });

  it('acceptsAnExplicitUrgencyAnswerOverTheSuggestion', () => {
    const draft = applyReading(
      startIntake(empty),
      problem,
      {
        ...reading,
        fields: { ...reading.fields, urgency: { value: 2, confidence: 0.7 } },
      },
      services,
    );
    expect(replyTo(draft, 'right now', services).form.urgency).toBe(4);
    expect(replyTo(draft, 'Yes.', services).form.urgency).toBe(2);
  });

  it('rulesReadingKeepsTheRuleBasedFlow', () => {
    const state = startIntake(empty);
    const expected = replyTo(state, problem, services);
    expect(applyReading(state, problem, { ...reading, engine: 'rules' }, services)).toEqual(
      expected,
    );
    expect(applyReading(state, problem, { ...reading, title: null }, services)).toEqual(expected);
  });
});
