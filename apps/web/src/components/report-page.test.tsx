import type { ChatIntakeResponse, IncidentDetail, SimilarIncident } from '@itsm/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render as renderComponent,
  screen,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initials } from '@/components/app-shell';
import { Route } from '@/routes/report';

const api = vi.hoisted(() => ({
  incident: undefined as Partial<IncidentDetail> | undefined,
  matches: [] as SimilarIncident[],
  report: vi.fn(),
}));
const service = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Payment Gateway',
  criticality: 4,
};
const categoryId = '00000000-0000-4000-8000-000000000002';
const noGuesses = {
  serviceId: null,
  categoryId: null,
  impact: null,
  urgency: null,
  affectedUsers: null,
};
const rulesReading: ChatIntakeResponse = {
  engine: 'rules',
  model: null,
  title: null,
  description: null,
  reply: null,
  fields: noGuesses,
};
const example =
  "hey the card payment thing on the website isn't working, customers keep complaining they can't pay";
const demoReading: ChatIntakeResponse = {
  engine: 'cache',
  model: 'gemini-3.5-flash-lite',
  title: 'Card payments failing at checkout',
  description: `Card payments are failing at website checkout. Customers are reporting that they cannot pay.\n\nIn the reporter's words: "${example}"`,
  reply: "Sounds like card payments are failing at checkout, so customers can't pay.",
  fields: {
    serviceId: { value: service.id, confidence: 0.96 },
    categoryId: { value: categoryId, confidence: 0.8 },
    impact: { value: 4, confidence: 0.9 },
    urgency: { value: 4, confidence: 0.7 },
    affectedUsers: null,
  },
};
const request = vi.fn<typeof fetch>();
const assigned: IncidentDetail = {
  id: 'incident',
  number: 'INC0215',
  title: 'Payment Gateway declines every card at checkout',
  description: 'Card payments fail at checkout.',
  status: 'ASSIGNED',
  priority: 'P1',
  service,
  category: null,
  reporter: { id: 'reporter', name: 'Priya Sharma' },
  assignee: { id: 'tech', name: 'Farah Ali' },
  createdAt: '2026-11-19T10:30:00Z',
  assignedAt: '2026-11-19T10:30:00Z',
  slaStatus: 'ON_TRACK',
  escalationLevel: 'TECHNICIAN',
  impact: 4,
  urgency: 4,
  affectedUsers: 5000,
  slaDeadlines: { response: '2026-11-19T10:45:00Z', resolution: '2026-11-19T14:30:00Z' },
  priorityRationale: [
    'Impact Critical (4) × Urgency Critical (4) × Criticality Mission-critical (4) = 64',
    'Affected users 5000 → ×1.5',
    'Score 96.0 ≥ 32 → P1 Critical',
  ],
  assignmentReasons: [
    'lacks network skill',
    'has application skill',
    '',
    '1/5 active incidents',
    'next in rotation',
  ],
  notes: [],
  infoRequests: [],
  resolution: null,
  feedback: null,
  closure: null,
  reopenCount: 0,
  allowedActions: [],
};

vi.mock('@/components/app-shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/app-shell')>()),
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'reporter', name: 'Priya Sharma' } }),
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('@/lib/incidents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/incidents')>()),
  useServices: () => ({ data: [service] }),
  useReportIncident: () => ({
    data: api.incident,
    mutate: api.report,
    reset: () => {
      api.incident = undefined;
    },
  }),
}));
vi.mock('@/lib/insights', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/insights')>()),
  useSimilarCheck: () => ({ data: api.matches }),
}));

const Report = Route.options.component!;
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const submitChat = (value: string) => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Your reply' }), {
    target: { value },
  });
  click('Send reply');
};

function render(ui: ReactNode) {
  const client = new QueryClient();
  return renderComponent(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function setReducedMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reduced : true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  api.incident = undefined;
  api.matches = [];
  api.report.mockReset();
  request.mockReset().mockImplementation(() => Promise.resolve(Response.json(rulesReading)));
  vi.stubGlobal('fetch', request);
  setReducedMotion(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('explainsThePriorityAndShowsOnlyTheFirstTwoDisplayableAssignmentReasons', () => {
  api.incident = assigned;
  render(<Report />);
  expect(screen.getByText('Score 96 (P1 starts at 32)').closest('dd')?.textContent).toContain(
    'P1 · CRITICAL',
  );
  const who = screen.getByText('Farah Ali').closest('dd')!;
  expect(within(who).getByText(initials('Farah Ali')).getAttribute('aria-hidden')).toBe('true');
  expect(
    within(who)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Has the Application skill', 'Handling 1 of 5 incidents']);
});

it('showsSubmittedServiceImpactAndPeopleBeneathTheIncidentTitle', () => {
  api.incident = assigned;
  render(<Report />);
  expect(
    screen.getByText(`${assigned.number} · ${assigned.title}`).nextElementSibling?.textContent,
  ).toBe('Payment Gateway · Critical impact · 5,000 people');
});

it('omitsMissingCaptionPartsAndTheirSeparators', () => {
  api.incident = { ...assigned, service: undefined, impact: undefined, affectedUsers: 1 };
  const { rerender } = render(<Report />);
  const title = screen.getByText(`${assigned.number} · ${assigned.title}`);
  expect(title.nextElementSibling?.textContent).toBe('1 (just you)');
  api.incident = { ...api.incident, affectedUsers: undefined };
  rerender(<Report />);
  expect(title.nextElementSibling).toBeNull();
});

it('usesOneLineOfPlainRationaleAndOmitsEmptyExplanations', () => {
  api.incident = {
    ...assigned,
    priorityRationale: ['  Matrix P1\n priority  '],
    assignmentReasons: [],
  };
  const { rerender } = render(<Report />);
  expect(screen.getByText('Matrix P1 priority').classList.contains('truncate')).toBe(true);
  expect(within(screen.getByText('Farah Ali').closest('dd')!).queryByRole('list')).toBeNull();
  api.incident = { ...api.incident, priorityRationale: [' '] };
  rerender(<Report />);
  expect(screen.getByText('P1 · CRITICAL').closest('dd')?.textContent).toBe('P1 · CRITICAL');
});

it('showsEachTargetWithItsClockTimeAndRelativeDuration', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(assigned.createdAt));
  api.incident = assigned;
  render(<Report />);
  expect(screen.getByText('· in 15m').previousElementSibling?.getAttribute('datetime')).toBe(
    assigned.slaDeadlines?.response,
  );
  expect(screen.getByText('· in 4h').previousElementSibling?.getAttribute('datetime')).toBe(
    assigned.slaDeadlines?.resolution,
  );
});

it.each([
  ['Just me', '1 (just you)'],
  ['5000', '5,000 people'],
])('showsOneReviewHeadingAndFormatsHeadCountFor %j', async (answer, population) => {
  render(<Report />);
  click('Describe it in a chat');
  expect(screen.getByRole('heading', { name: 'Your report' })).toBeTruthy();
  expect(screen.getByPlaceholderText('e.g. Payments fail at checkout')).toBeTruthy();
  submitChat(example);
  expect(within(screen.getByRole('log')).getByText(example)).toBeTruthy();
  const suggestedService = await screen.findByRole('button', { name: 'Yes, Payment Gateway' });
  expect(suggestedService.querySelector('svg')).toBeNull();
  expect(suggestedService.classList.contains('font-semibold')).toBe(true);
  click('Yes, Payment Gateway');
  click('Important work is blocked');
  click('Today');
  if (answer === 'Just me') click(answer);
  else {
    fireEvent.change(screen.getByRole('textbox', { name: 'Your reply' }), {
      target: { value: answer },
    });
    click('Send reply');
  }
  expect(screen.queryByRole('textbox', { name: 'Your reply' })).toBeNull();
  expect(screen.getByText('Draft ready. Review it on the right, then send it.')).toBeTruthy();
  expect(screen.getByText('Draft ready. Review it below, then send it.')).toBeTruthy();
  const review = screen.getByRole('complementary', { name: 'Review your report' });
  expect(within(review).getByRole('heading', { name: 'Review your report' })).toBeTruthy();
  expect(screen.getAllByRole('heading', { name: 'Review your report' })).toHaveLength(1);
  expect(screen.queryByRole('heading', { name: 'Your report' })).toBeNull();
  expect(within(review).getByText('People affected').nextElementSibling?.textContent).toBe(
    population,
  );
  expect(within(review).getByText(/impact × .* urgency × Mission-critical service, /)).toBeTruthy();
  expect(
    within(review).getByText('We set the exact priority and SLA when you send it.'),
  ).toBeTruthy();
});

it('keepsSendReplyDisabledForWhitespaceAndEnablesItForAnAnswer', () => {
  render(<Report />);
  click('Describe it in a chat');
  const input = screen.getByRole('textbox', { name: 'Your reply' });
  const send = screen.getByRole<HTMLButtonElement>('button', { name: 'Send reply' });
  expect(send.disabled).toBe(true);
  fireEvent.change(input, { target: { value: '  ' } });
  expect(send.disabled).toBe(true);
  fireEvent.change(input, { target: { value: example } });
  expect(send.disabled).toBe(false);
});

it('keepsTheTopDuplicateAndReviewActionsVisibleWithExtraMatchesCollapsed', async () => {
  api.matches = [
    {
      incident: { ...assigned, id: 'other', number: 'INC0214' },
      score: 0.6,
      reasons: [],
      source: 'rules',
    },
    {
      incident: assigned,
      score: 0.85,
      reasons: ['same service', 'similar meaning (embedding model)'],
      source: 'model',
    },
  ];
  render(<Report />);
  click('Describe it in a chat');
  submitChat(example);
  fireEvent.click(await screen.findByRole('button', { name: 'Yes, Payment Gateway' }));
  click('Some work is slowed down');
  click('Today');
  click('Just me');
  const review = within(screen.getByRole('complementary', { name: 'Review your report' }));
  expect(review.getByRole('button', { name: 'Send report' })).toBeTruthy();
  expect(review.getByRole('button', { name: 'Edit in the form' })).toBeTruthy();
  const advisory = within(review.getByRole('region', { name: 'Is this already reported?' }));
  expect(advisory.getByText('Advisory', { exact: true })).toBeTruthy();
  const top = advisory.getByRole('link', { name: /^INC0215 · / }).closest('li')!;
  expect(within(top).getByText('Assigned')).toBeTruthy();
  expect(within(top).getByText('85% match')).toBeTruthy();
  expect(within(top).getByText('same service · similar meaning')).toBeTruthy();
  expect(advisory.getByText('1 more possible match').parentElement?.hasAttribute('open')).toBe(
    false,
  );
  expect(advisory.getByText('If your problem is different, send your own report.')).toBeTruthy();
});

it('fallsBackToRulesWhenTheIntakeCallFails', async () => {
  request.mockRejectedValueOnce(new TypeError('fetch failed'));
  render(<Report />);
  click('Describe it in a chat');
  submitChat(example);
  expect(await screen.findByRole('button', { name: 'Yes, Payment Gateway' })).toBeTruthy();
  expect(screen.getByText('This sounds like Payment Gateway. Is that right?')).toBeTruthy();
  expect(screen.queryByText('AI-assisted')).toBeNull();
  click('Yes, Payment Gateway');
  expect(screen.getByText('Payment Gateway it is. How badly is work affected?')).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(1);
});

it.each([
  ['gemini', 'Written by Gemini from your message'],
  ['cache', 'Replayed from the AI response cache'],
  ['rules', null],
] as const)('showsAiAssistedTagOnlyOnGeminiReplies (%s)', async (engine, tooltip) => {
  const reading = engine === 'rules' ? rulesReading : { ...demoReading, engine };
  request.mockResolvedValueOnce(Response.json(reading));
  render(<Report />);
  click('Describe it in a chat');
  submitChat(example);
  if (tooltip) {
    fireEvent.click(await screen.findByRole('button', { name: 'Right now' }));
    expect(screen.getAllByText('AI-assisted')).toEqual([screen.getByTitle(tooltip)]);
    expect(screen.getByRole('button', { name: 'Everyone (2,000+)' })).toBeTruthy();
  } else {
    await screen.findByRole('button', { name: 'Yes, Payment Gateway' });
    expect(screen.queryByText('AI-assisted')).toBeNull();
  }
});

it('sendsTheChatCategoryWithTheReport', async () => {
  vi.useFakeTimers();
  setReducedMotion(false);
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(Response.json(demoReading)), 1200);
      }),
  );
  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
  async function finishReveal() {
    for (let index = 0; index < 14; index++) await advance(50);
  }
  const { rerender } = render(<Report />);
  click('Describe it in a chat');
  submitChat(example);
  const log = within(screen.getByRole('log'));
  expect(log.getByText(example)).toBeTruthy();
  expect(log.getByRole('status', { name: 'IT assistant is typing' })).toBeTruthy();
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Your reply' }).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: example })).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send reply' }).disabled).toBe(true);

  await advance(1199);
  expect(log.getByRole('status')).toBeTruthy();
  await advance(1);
  expect(request).toHaveBeenCalledExactlyOnceWith(
    '/api/incidents/intake',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ message: example }),
    }),
  );
  expect(log.queryByRole('status')).toBeNull();
  const expectedReply = `${demoReading.reply} It sounds like it needs fixing right now. Is that right?`;
  expect(log.getByText(`IT assistant: ${expectedReply}`).classList.contains('sr-only')).toBe(true);
  expect(log.getByText('Sounds like').getAttribute('aria-hidden')).toBe('true');
  expect(screen.queryByRole('button', { name: 'Right now' })).toBeNull();
  await finishReveal();
  expect(log.getByText(expectedReply)).toBeTruthy();
  expect(log.getByText('AI-assisted')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Right now' }).classList.contains('font-semibold'),
  ).toBe(true);
  expect(screen.queryByRole('button', { name: 'Yes, Payment Gateway' })).toBeNull();

  setReducedMotion(true);
  rerender(<Report />);
  setReducedMotion(false);
  rerender(<Report />);
  expect(log.getByText(expectedReply)).toBeTruthy();

  click('Right now');
  expect(log.getByRole('status')).toBeTruthy();
  await advance(499);
  expect(log.getByRole('status')).toBeTruthy();
  await advance(1);
  expect(log.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Everyone (2,000+)' })).toBeNull();
  await finishReveal();
  expect(
    log.getByText('Understood, it needs fixing right now. About how many people are affected?'),
  ).toBeTruthy();
  click('Everyone (2,000+)');
  await advance(500);
  await finishReveal();
  const review = within(screen.getByRole('complementary', { name: 'Review your report' }));
  expect(review.getByText(demoReading.title!)).toBeTruthy();
  expect(review.getByText('Payment Gateway')).toBeTruthy();
  expect(review.getAllByText('Critical')).toHaveLength(2);
  expect(review.getByText('2,000 people')).toBeTruthy();
  click('Fill in a form');
  click('Describe it in a chat');
  expect(within(screen.getByRole('log')).getByText(expectedReply)).toBeTruthy();
  click('Send report');
  expect(api.report).toHaveBeenCalledExactlyOnceWith({
    title: demoReading.title,
    description: demoReading.description,
    serviceId: service.id,
    impact: 4,
    urgency: 4,
    affectedUsers: 2000,
    categoryId,
  });
  expect(request).toHaveBeenCalledTimes(1);

  api.incident = assigned;
  rerender(<Report />);
  click('Report another problem');
  click('Fill in a form');
  fireEvent.change(screen.getByRole('textbox', { name: 'What is the problem?' }), {
    target: { value: 'VPN is offline' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'What happens?' }), {
    target: { value: 'Unable to connect from home.' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Which service is affected?' }), {
    target: { value: service.id },
  });
  fireEvent.click(screen.getByRole('radio', { name: /Some work is slowed down/ }));
  fireEvent.click(screen.getByRole('radio', { name: 'Today' }));
  click('Send report');
  expect(api.report).toHaveBeenLastCalledWith({
    title: 'VPN is offline',
    description: 'Unable to connect from home.',
    serviceId: service.id,
    impact: 2,
    urgency: 2,
    affectedUsers: 1,
  });
});

it('labelsSelfReportedDuplicateMatchesOnReportPage', async () => {
  api.matches = [
    {
      incident: assigned,
      score: 0.9,
      reasons: ['same service'],
      source: 'rules',
    },
    {
      incident: {
        ...assigned,
        id: 'other-user-inc',
        number: 'INC0214',
        title: 'Checkout error reported by Rahul',
        reporter: { id: 'rahul', name: 'Rahul Verma' },
      },
      score: 0.7,
      reasons: ['same service'],
      source: 'rules',
    },
  ];
  render(<Report />);
  click('Describe it in a chat');
  submitChat(example);
  fireEvent.click(await screen.findByRole('button', { name: 'Yes, Payment Gateway' }));
  click('Important work is blocked');
  click('Today');
  click('Just me');
  const advisory = within(
    screen
      .getByRole('complementary', { name: 'Review your report' })
      .querySelector('[aria-label="Is this already reported?"]')!,
  );
  const selfRow = advisory.getByRole('link', { name: /^INC0215 · / }).closest('li')!;
  expect(within(selfRow).getByText('Reported by you')).toBeTruthy();
  const otherRow = advisory.getByRole('link', { name: /^INC0214 · / }).closest('li')!;
  expect(within(otherRow).queryByText('Reported by you')).toBeNull();
});
