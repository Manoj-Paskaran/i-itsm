import {
  test,
  expect,
  fillReport,
  sendReport,
  reached,
  active,
  step,
  rail,
  activity,
} from './fixtures.js';

test('workflow 2: investigate, pause SLA, answer, monitor, resolve and verify with feedback', async ({
  persona,
}) => {
  const priya = await persona('priya');
  await fillReport(priya, 'Payment Gateway checkout fails during investigation');
  const incident = await sendReport(priya);
  await priya.getByRole('link', { name: 'Follow this incident', exact: true }).click();
  const assignee = await persona(incident.login);
  await assignee.goto(incident.path);
  await assignee.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  await reached(assignee, 'Acknowledged');
  await expect(rail(assignee).getByText(/^Response met/)).toBeVisible();
  await assignee.getByRole('button', { name: 'Start work', exact: true }).click();
  await reached(assignee, 'In progress');
  const note = 'Confirmed PG-503 across all cards; checking the gateway connection pool.';
  await assignee.getByLabel('Investigation note', { exact: true }).fill(note);
  await assignee.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(activity(assignee).getByRole('listitem').first()).toContainText(note);
  await expect(
    activity(assignee).getByRole('button', { name: 'Newest', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');

  const question = 'When did the payment errors start, and which error code do you see?';
  await assignee.getByRole('button', { name: 'Request info', exact: true }).click();
  await assignee.getByLabel('Question', { exact: true }).fill(question);
  await assignee.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(assignee.getByText('SLA paused', { exact: true })).toBeVisible();
  await active(assignee, 'Resolved');
  await expect(step(assignee, 'Resolved')).toContainText('Waiting for info from Priya');
  // Assert the viewer's amber treatment as well as its words.
  await expect(
    step(assignee, 'Resolved').getByText('Waiting for info from Priya').locator('..'),
  ).toHaveClass(/text-warning-foreground/);
  await expect(step(assignee, 'Resolved')).toContainText('paused');

  // Priya's already-open page must update through its normal polling, with no reload.
  await expect(priya.getByText(question, { exact: true })).toBeVisible();
  await priya.getByRole('button', { name: 'Answer question', exact: true }).click();
  const answer = 'It started at 09:15 today. Every checkout shows PG-503 for all cards.';
  await priya.getByLabel('Answer', { exact: true }).fill(answer);
  await priya.getByRole('button', { name: 'Answer question', exact: true }).last().click();
  await expect(assignee.getByText(answer, { exact: true })).toBeVisible();
  await expect(assignee.getByText('SLA paused', { exact: true })).toHaveCount(0);
  await expect(step(assignee, 'Resolved')).toContainText('Resolving · your turn');

  const vikram = await persona('vikram');
  await vikram.getByRole('link', { name: 'SLA monitor', exact: true }).click();
  await expect(vikram.getByRole('heading', { name: 'SLA monitor', exact: true })).toBeVisible();
  for (const label of [
    'Breached, still open',
    'At risk now',
    'SLA compliance',
    'SLA targets met',
  ]) {
    const tile = vikram
      .locator('dl > div')
      .filter({ has: vikram.getByText(label, { exact: true }) });
    await expect(tile.locator('dd').first()).toHaveText(
      label === 'SLA compliance' ? /^\d+(\.\d+)?%$/ : /^\d+$/,
    );
    if (label === 'SLA targets met') {
      await expect(tile.locator('dd').nth(1)).toHaveText(/^\d+ breached · all time$/);
    }
  }
  const watchlist = vikram.getByRole('region', { name: 'SLA watchlist', exact: true });
  await expect(
    watchlist.getByRole('row').filter({ hasText: 'SLA breached' }).first(),
  ).toBeVisible();
  await expect(watchlist.getByRole('row').filter({ hasText: 'SLA at risk' }).first()).toBeVisible();
  await expect(
    watchlist.getByRole('columnheader', { name: 'Escalated to', exact: true }),
  ).toBeVisible();
  await expect(
    watchlist
      .getByRole('row')
      .filter({ hasText: /SLA (breached|at risk)/ })
      .filter({ hasText: /Not escalated|Team lead|System admin|IT manager/ })
      .first(),
  ).toBeVisible();

  const summary =
    'Restarted the gateway connector and confirmed successful checkout with all card types.';
  const cause =
    'The payment gateway connection pool was exhausted after a stale connector deployment.';
  await assignee.getByRole('button', { name: 'Resolve', exact: true }).click();
  await assignee.getByLabel('Resolution summary', { exact: true }).fill(summary);
  await assignee.getByLabel('Root cause', { exact: false }).fill(cause);
  await assignee.getByRole('button', { name: 'Resolve', exact: true }).last().click();
  await reached(assignee, 'Resolved');
  await active(assignee, 'Verified');
  await expect(step(assignee, 'Verified')).toContainText('Confirming fix · waiting for Priya');
  await expect(assignee.getByText(summary, { exact: true })).toBeVisible();
  await expect(assignee.getByText(cause, { exact: true })).toBeVisible();

  // The reporter sees the resolution, its notification and the confirmation action without reload.
  await expect(priya.getByRole('button', { name: 'Confirm fix', exact: true })).toBeVisible();
  await priya.getByRole('button', { name: /^Notifications/ }).click();
  const resolution = priya.getByRole('button', { name: new RegExp(`${incident.number} resolved`) });
  await expect(resolution).toContainText(summary);
  await resolution.click();
  await priya.getByRole('button', { name: 'Confirm fix', exact: true }).click();
  await reached(priya, 'Verified');
  const rating = priya.getByRole('radio', { name: '4 out of 5', exact: true });
  // Stars visually cover the sr-only input; use its supported keyboard activation.
  await rating.press('Space');
  await expect(rating).toBeChecked();
  const comment = 'Checkout works again. Clear updates from IT throughout the outage.';
  await priya.getByLabel('Comment', { exact: false }).fill(comment);
  await priya.getByRole('button', { name: 'Send feedback', exact: true }).click();
  await expect(priya.getByLabel('Rated 4 out of 5', { exact: true })).toBeVisible();
  await expect(priya.getByText(comment, { exact: true })).toBeVisible();
  await expect(priya.getByRole('button', { name: 'Send feedback', exact: true })).toHaveCount(0);
});
