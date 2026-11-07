import {
  test,
  expect,
  fillReport,
  sendReport,
  reached,
  active,
  step,
  expectAssignmentReasons,
} from './fixtures.js';

test('workflow 1: report, auto-prioritise, assign and notify the assignee', async ({ persona }) => {
  const priya = await persona('priya');
  const title = 'Payment Gateway declines every card at checkout';
  await fillReport(priya, title);
  const incident = await sendReport(priya);
  await priya.getByRole('link', { name: 'Follow this incident', exact: true }).click();
  await expect(priya.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await reached(priya, 'Reported');
  await reached(priya, 'Assigned');
  await active(priya, 'Acknowledged');
  await expect(step(priya, 'Acknowledged')).toContainText(
    `waiting for ${incident.assignee.split(' ')[0]}`,
  );

  const assignee = await persona(incident.login);
  // Open the actual bell and follow its assignment, rather than navigating by an API response.
  await assignee.getByRole('button', { name: /^Notifications/ }).click();
  const notification = assignee.getByRole('button', {
    name: new RegExp(`${incident.number} assigned to you`),
  });
  await expect(notification).toBeVisible();
  await expect(notification).toContainText('Assignment');
  await expect(notification).toContainText('Unread');
  await expect(notification).toContainText(title);
  await notification.click();
  await expect(assignee).toHaveURL(new RegExp(incident.path + '$'));
  const context = assignee.getByRole('complementary', { name: 'Incident context' });
  await expect(context.getByText('4 × 4 × 4', { exact: true })).toBeVisible();
  await expect(context.getByText('5,000 affected users', { exact: true })).toBeVisible();
  await expect(context.getByText('96.0', { exact: true })).toBeVisible();
  await expect(context.getByText(/96\.0 · ≥ 32 \(P1 threshold\)/)).toBeVisible();
  await expectAssignmentReasons(assignee, incident.assignee);
});
