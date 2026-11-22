import {
  test,
  expect,
  fillReport,
  sendReport,
  reached,
  rail,
  outageDescription,
} from './fixtures.js';

test('workflow 3: detect duplicates, escalate through the demo chain, reassign and switch strategies', async ({
  persona,
}) => {
  test.setTimeout(220_000);
  const priya = await persona('priya');
  await fillReport(priya, 'Payment Gateway checkout outage: every card declined');
  const original = await sendReport(priya);
  await fillReport(priya, 'Checkout shows payment error', outageDescription);
  const warning = priya.getByRole('region', { name: 'Is this already reported?' });
  await expect(warning.getByText(/These open incidents look similar/)).toBeVisible();
  await expect(
    warning.getByRole('link', { name: new RegExp(`^${original.number} · `) }),
  ).toBeVisible();
  await expect(warning).toContainText('same service');
  await expect(warning.getByText('Advisory', { exact: true })).toBeVisible();
  const duplicate = await sendReport(priya);

  // Script step 2 before step 3: watch the chip climb while the 60/90/120 s demo policy runs.
  const arjun = await persona('arjun');
  await arjun.getByRole('link', { name: 'All incidents', exact: true }).first().click();
  await arjun.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('P1');
  const originalRow = arjun.getByRole('listitem').filter({
    has: arjun.getByRole('link', {
      name: /Payment Gateway checkout outage: every card declined/,
    }),
  });
  await expect(originalRow).toBeVisible();
  await expect(originalRow).toContainText('Escalated · Team lead', { timeout: 80_000 });
  await expect(originalRow).toContainText('Escalated · System admin', { timeout: 45_000 });
  await expect(originalRow).toContainText('Escalated · IT manager', { timeout: 45_000 });
  await originalRow.getByRole('link').click();
  await expect(arjun.getByText('Escalated to IT manager', { exact: true })).toBeVisible();

  await arjun.goto(duplicate.path);
  const related = arjun.getByRole('complementary', { name: 'Incident context' });
  await expect(
    related.getByRole('heading', { name: 'Possibly related', exact: true }),
  ).toBeVisible();
  await expect(related.getByRole('link', { name: original.number, exact: true })).toBeVisible();
  await expect(
    related.getByText('Advisory suggestion · rules', { exact: true }).first(),
  ).toBeVisible();
  await arjun.getByRole('button', { name: 'Close as duplicate…', exact: true }).click();
  await arjun.getByRole('combobox', { name: 'Duplicate of', exact: true }).selectOption({
    label: `${original.number} · Payment Gateway checkout outage: every card declined`,
  });
  await arjun.getByRole('button', { name: 'Close as duplicate', exact: true }).click();
  await expect(rail(arjun).getByRole('listitem')).toHaveCount(2);
  await reached(arjun, 'Reported');
  await reached(arjun, 'Closed');
  await expect(rail(arjun)).toContainText(`Duplicate of ${original.number}`);
  await expect(arjun.getByText('Closed as duplicate', { exact: true }).first()).toBeVisible();

  // Admin has AUDIT_VIEW; Divya does not have it for another technician's incident.
  await arjun.getByRole('link', { name: 'Audit', exact: true }).click();
  await arjun
    .getByRole('combobox', { name: 'Action', exact: true })
    .selectOption({ label: 'Incident escalated' });
  await arjun
    .getByRole('button', { name: `Filter to incident ${original.number}`, exact: true })
    .first()
    .click();
  await expect(arjun.getByRole('combobox', { name: 'Action', exact: true })).toHaveValue(
    'IncidentEscalated',
  );
  await expect(
    arjun.getByRole('button', { name: `Remove Incident: ${original.number} filter`, exact: true }),
  ).toBeVisible();
  // Workflow 1's unacknowledged P1 escalates too; only the original incident's rows may remain.
  const incidentLinks = arjun.getByRole('button', { name: /^Filter to incident INC/ });
  await expect(incidentLinks.filter({ hasNotText: original.number })).toHaveCount(0);
  for (const level of ['Team lead', 'System admin', 'IT manager']) {
    await expect(
      arjun
        .getByRole('listitem')
        .filter({ hasText: new RegExp(`Escalated to ${level}`, 'i') })
        .filter({
          has: arjun.getByRole('button', {
            name: `Filter to incident ${original.number}`,
            exact: true,
          }),
        })
        .first(),
    ).toBeVisible();
  }

  const divya = await persona('divya');
  await divya.goto(original.path);
  await divya.getByRole('button', { name: 'Reassign', exact: true }).click();
  const context = divya.getByRole('complementary', { name: 'Incident context' });
  await expect(context.getByText('Suggestions · advisory', { exact: true })).toBeVisible();
  const assignOther = divya.getByRole('button', {
    name: /^Assign to (?!yourself$)/,
    disabled: false,
  });
  const candidate = context.getByRole('listitem').filter({ has: assignOther }).first();
  await expect(candidate).toContainText(/match \d+%/);
  await expect(candidate).toContainText(/skill|capacity|load|experience|rotation/i);
  const assignButton = candidate.getByRole('button', {
    name: /^Assign to (?!yourself$)/,
    disabled: false,
  });
  const nextName = (await assignButton.innerText()).replace('Assign to ', '');
  // The button shows only the first name; the Assignee section shows the full name.
  expect(nextName).not.toBe(original.assignee.split(' ')[0]);
  await assignButton.click();
  // The panel lives inside the Assignee section, so check the name only once it has closed.
  await expect(context.getByText('Suggestions · advisory', { exact: true })).toHaveCount(0);
  const assigneeSection = context
    .locator('section')
    .filter({ has: divya.getByRole('heading', { name: 'Assignee', exact: true }) });
  await expect(assigneeSection.getByText(new RegExp(`^${nextName} \\S+$`))).toBeVisible();
  await expect(assigneeSection.getByText(original.assignee, { exact: true })).toHaveCount(0);

  await arjun.getByRole('link', { name: 'Configuration', exact: true }).click();
  await arjun.getByRole('tab', { name: 'Strategies', exact: true }).click();
  const priority = arjun.getByRole('group', { name: 'Priority strategy', exact: true });
  const weighted = priority.getByRole('radio', { name: /Weighted score/ });
  const matrix = priority.getByRole('radio', { name: /Impact urgency matrix/ });
  await expect(weighted).toBeChecked();
  try {
    await matrix.click();
    await expect(arjun.getByRole('status').filter({ hasText: 'Strategy saved.' })).toBeVisible();
    await expect(matrix).toBeChecked();
    await arjun.reload();
    await expect(matrix).toBeChecked();
  } finally {
    await weighted.click();
    await expect(arjun.getByRole('status').filter({ hasText: 'Strategy saved.' })).toBeVisible();
    await expect(weighted).toBeChecked();
    await arjun.reload();
    await expect(weighted).toBeChecked();
  }
});
