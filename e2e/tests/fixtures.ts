import { test as base, expect, type Page, type Locator } from '@playwright/test';

type Personas = (firstName: string) => Promise<Page>;

export const test = base.extend<{ persona: Personas }>({
  persona: async ({ browser, baseURL }, use, testInfo) => {
    const pages = new Map<string, Page>();
    try {
      await use(async (firstName) => {
        const existing = pages.get(firstName);
        if (existing) return existing;
        // Each person has their own cookies and app state; all actions use the real sign-in UI.
        const context = await browser.newContext({
          baseURL,
          viewport: { width: 1440, height: 900 },
          colorScheme: 'light',
          locale: 'en-GB',
          timezoneId: 'Asia/Kolkata',
        });
        const page = await context.newPage();
        pages.set(firstName, page);
        page.setDefaultTimeout(15_000);
        await page.goto('/login');
        await page.getByLabel('Email', { exact: true }).fill(`${firstName}@itsm.demo`);
        await page.getByLabel('Password', { exact: true }).fill('demo1234');
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await expect(page).toHaveURL(baseURL + '/');
        return page;
      });
    } finally {
      for (const [person, page] of pages) {
        if (testInfo.status !== 'passed') {
          const body = await page
            .screenshot({ fullPage: true, timeout: 5000 })
            .catch(() => undefined);
          if (body) await testInfo.attach(`${person} screen`, { body, contentType: 'image/png' });
        }
        await page.context().close();
      }
    }
  },
});

export { expect };

export const outageDescription =
  'Payment Gateway checkout rejects every card with payment error PG-503. All customer payments fail and no orders can complete.';

export async function fillReport(page: Page, title: string, description = outageDescription) {
  await page.goto('/report');
  await page.getByLabel('What is the problem?', { exact: true }).fill(title);
  await page.getByLabel('What happens?', { exact: true }).fill(description);
  await page
    .getByRole('combobox', { name: 'Which service is affected?', exact: true })
    .selectOption({ label: 'Payment Gateway' });
  await page.getByRole('radio', { name: /The business has stopped/ }).check();
  await page.getByRole('radio', { name: 'Right now', exact: true }).check();
  await page.getByLabel('About how many people are affected?', { exact: true }).fill('5000');
}

export async function sendReport(page: Page) {
  await page.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'We have your report' })).toBeVisible();
  await expect(page.getByText('P1 · CRITICAL', { exact: true })).toBeVisible();
  // The confirmation's semantic definition list is the source of the assignee and targets.
  const assigneeRow = page
    .locator('dl > div')
    .filter({ has: page.getByText('Who is on it', { exact: true }) });
  const assignee = (await assigneeRow.locator('dd > div').innerText())
    .replace(/^[A-Z]{2}\s+/, '')
    .trim();
  expect(assignee).toMatch(/\S+ \S+/);
  expect(assignee).not.toBe('Waiting for assignment');
  const follow = page.getByRole('link', { name: 'Follow this incident', exact: true });
  const href = await follow.getAttribute('href');
  expect(href).toMatch(/^\/incidents\/[\w-]+$/);
  await expect(page.getByText(/Respond by\s+.*\d{2}:\d{2}\s+·\s+in /)).toBeVisible();
  await expect(page.getByText(/Resolve by\s+.*\d{2}:\d{2}\s+·\s+in /)).toBeVisible();
  const number = (await page.getByText(/INC\d+ ·/).innerText()).match(/INC\d+/)![0];
  return { path: href!, number, assignee, login: assignee.split(' ')[0]!.toLowerCase() };
}

export function rail(page: Page) {
  return page.getByRole('list', { name: 'Lifecycle', exact: true });
}

export function step(page: Page, label: string) {
  return rail(page)
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`^${label},`) });
}

export async function reached(page: Page, label: string) {
  const item = step(page, label);
  await expect(item).toContainText(`${label}, done`);
  await expect(item.getByRole('time')).toBeVisible();
}

export async function active(page: Page, label: string) {
  await expect(step(page, label)).toHaveAttribute('aria-current', 'step');
  await expect(step(page, label)).toContainText(`${label}, in progress`);
}

export async function expectAssignmentReasons(page: Page, name: string) {
  const context = page.getByRole('complementary', { name: 'Incident context' });
  await expect(context.getByText(`Why ${name.split(' ')[0]}`, { exact: true })).toBeVisible();
  const reasons = context
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Assignee', exact: true }) });
  await expect(reasons.getByRole('listitem')).not.toHaveCount(0);
  await expect(reasons).toContainText(/skill|capacity|load|experience|rotation/i);
}

export function activity(page: Page): Locator {
  return page.getByRole('region', { name: /^Activity/ });
}
