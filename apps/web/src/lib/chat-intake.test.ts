import { describe, expect, it } from 'vitest';
import { reportErrors } from './report';
import {
  matchService,
  parseAffectedUsers,
  parseLevel,
  priorityPreview,
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
    expect(state.messages.at(-1)?.text).toMatch(/sounds like Payment Gateway/);
    expect(quickRepliesFor(state, services).map((r) => r.label)).toContain('Yes, Payment Gateway');
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
  it('previewsWhatDecidesPriorityWithoutGuessingIt', () =>
    expect(
      priorityPreview({ ...empty, impact: 4, urgency: 3, affectedUsers: '200' }, services[2]),
    ).toBe(
      'Impact Critical × urgency High on a Mission-critical service, 200 people affected. We set the exact priority and SLA when you send it.',
    ));
});
