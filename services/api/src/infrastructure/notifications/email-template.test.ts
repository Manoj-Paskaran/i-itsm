import { describe, expect, it } from 'vitest';
import type { NotificationMessage } from '../../application/notifications/notification-message.js';
import { EventType } from '../../domain/events/index.js';
import { asIncidentId, asUserId, Instant } from '../../domain/shared/index.js';
import { renderNotificationEmail } from './email-template.js';

const baseMessage: NotificationMessage = {
  recipientId: asUserId('00000000-0000-4000-8000-000000000001'),
  recipientName: 'Priya Sharma',
  recipientEmail: 'priya@itsm.demo',
  eventType: EventType.IncidentResolved,
  title: 'INC0215 resolved',
  body: 'Restarted the gateway connector and confirmed successful checkout with all card types.',
  incidentId: asIncidentId('00000000-0000-4000-8000-000000000002'),
  incidentNumber: 'INC0215',
  incidentTitle: 'Payment Gateway declines every card at checkout',
  resolutionSummary:
    'Restarted the gateway connector and confirmed successful checkout with all card types.',
  rootCause: 'TLS certificate pool exhausted after rotation.',
  createdAt: Instant.fromIso('2026-11-21T15:56:00.000Z'),
};

const incidentLink = 'http://localhost:5173/incidents/00000000-0000-4000-8000-000000000002';

describe('email template rules', () => {
  it('subjectNamesNumberEventAndTitle', () => {
    const resolved = renderNotificationEmail(baseMessage, incidentLink);
    expect(resolved.subject).toBe(
      '[INC0215] Resolved: Payment Gateway declines every card at checkout',
    );

    const infoReq = renderNotificationEmail(
      {
        ...baseMessage,
        eventType: EventType.InfoRequested,
        title: 'Information requested for INC0215',
        question: 'Are all cards failing or only Visa?',
      },
      incidentLink,
    );
    expect(infoReq.subject).toBe(
      '[INC0215] Information requested: Payment Gateway declines every card at checkout',
    );
  });

  it('resolvedEmailShowsSummaryAndRootCause', () => {
    const email = renderNotificationEmail(baseMessage, incidentLink);

    expect(email.html).toContain('I-ITSM');
    expect(email.html).toContain('Hi Priya,');
    expect(email.html).toContain('Your incident has been resolved');
    expect(email.html).toContain('INC0215');
    expect(email.html).toContain('Payment Gateway declines every card at checkout');
    expect(email.html).toContain('What we did');
    expect(email.html).toContain(
      'Restarted the gateway connector and confirmed successful checkout with all card types.',
    );
    expect(email.html).toContain('Root cause');
    expect(email.html).toContain('TLS certificate pool exhausted after rotation.');
    expect(email.html).toContain('Review and confirm the fix');
    expect(email.html).toContain(`href="${incidentLink}"`);
    expect(email.html).toContain('You get this email because you reported this incident.');

    expect(email.text).toContain('I-ITSM');
    expect(email.text).toContain('Hi Priya,');
    expect(email.text).toContain('Your incident has been resolved');
    expect(email.text).toContain('INC0215 — Payment Gateway declines every card at checkout');
    expect(email.text).toContain('What we did:');
    expect(email.text).toContain(
      'Restarted the gateway connector and confirmed successful checkout with all card types.',
    );
    expect(email.text).toContain('Root cause:');
    expect(email.text).toContain('TLS certificate pool exhausted after rotation.');
    expect(email.text).toContain(`Review and confirm the fix: ${incidentLink}`);
    expect(email.text).toContain('You get this email because you reported this incident.');
  });

  it('resolvedEmailOmitsRootCauseWhenAbsent', () => {
    const email = renderNotificationEmail({ ...baseMessage, rootCause: undefined }, incidentLink);

    expect(email.html).toContain('What we did');
    expect(email.html).not.toContain('Root cause');
    expect(email.text).toContain('What we did:');
    expect(email.text).not.toContain('Root cause');
  });

  it('infoRequestedEmailQuotesQuestionAndNamesTechnician', () => {
    const email = renderNotificationEmail(
      {
        ...baseMessage,
        eventType: EventType.InfoRequested,
        title: 'Information requested for INC0215',
        body: 'Which card networks are failing at checkout?',
        question: 'Which card networks are failing at checkout?',
        actorName: 'Farah Nair',
      },
      incidentLink,
    );

    expect(email.html).toContain('Hi Priya,');
    expect(email.html).toContain('Farah needs more information');
    expect(email.html).toContain('&ldquo;Which card networks are failing at checkout?&rdquo;');
    expect(email.html).toContain('Answer the question');
    expect(email.html).toContain(`href="${incidentLink}"`);
    expect(email.html).toContain('You get this email because you reported this incident.');

    expect(email.text).toContain('Farah needs more information');
    expect(email.text).toContain('> Which card networks are failing at checkout?');
    expect(email.text).toContain(`Answer the question: ${incidentLink}`);
  });

  it('infoRequestedEmailFallsBackWithoutActorName', () => {
    const email = renderNotificationEmail(
      {
        ...baseMessage,
        eventType: EventType.InfoRequested,
        title: 'Information requested for INC0215',
        body: 'Which office are you in?',
        question: 'Which office are you in?',
      },
      incidentLink,
    );

    expect(email.html).toContain('More information is needed');
    expect(email.text).toContain('More information is needed');
  });

  it('greetsRecipientByFirstNameOrFallsBackToHi', () => {
    const unnamed = renderNotificationEmail({ ...baseMessage, recipientName: '   ' }, incidentLink);
    expect(unnamed.html).toContain('Hi,');
    expect(unnamed.html).not.toContain('Hi  ');
    expect(unnamed.text).toContain('Hi,');
  });

  it('usesViewIncidentButtonForOtherEvents', () => {
    const assigned = renderNotificationEmail(
      {
        ...baseMessage,
        eventType: EventType.IncidentAssigned,
        recipientName: 'Farah Nair',
        title: 'INC0215 assigned to you',
        body: 'Payment Gateway declines every card at checkout',
      },
      incidentLink,
    );

    expect(assigned.subject).toBe(
      '[INC0215] Assigned: Payment Gateway declines every card at checkout',
    );
    expect(assigned.html).toContain('Hi Farah,');
    expect(assigned.html).toContain('An incident has been assigned to you');
    expect(assigned.html).toContain('View incident');
    expect(assigned.text).toContain(`View incident: ${incidentLink}`);
  });

  it('escapesUserTextInHtml', () => {
    const xss = `<script>alert("x")</script> & 'quoted'`;
    const email = renderNotificationEmail(
      {
        ...baseMessage,
        recipientName: `<b>Priya</b>`,
        incidentTitle: xss,
        resolutionSummary: xss,
        rootCause: `<img src=x onerror=alert(1)>`,
      },
      `http://localhost:5173/incidents/1?a=1&b="2"`,
    );

    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>Priya</b>');
    expect(email.html).not.toContain('<img ');
    expect(email.html).toContain('&lt;b&gt;Priya&lt;/b&gt;');
    expect(email.html).toContain(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;',
    );
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(email.html).toContain(
      'href="http://localhost:5173/incidents/1?a=1&amp;b=&quot;2&quot;"',
    );
  });

  it('fallsBackWithoutIncident', () => {
    const email = renderNotificationEmail(
      {
        recipientId: asUserId('00000000-0000-4000-8000-000000000001'),
        recipientName: 'Priya Sharma',
        recipientEmail: 'priya@itsm.demo',
        eventType: EventType.IncidentEscalated,
        title: 'Incident escalated to Team Lead',
        body: 'Needs immediate review.',
        incidentId: null,
        incidentNumber: null,
        createdAt: Instant.fromIso('2026-11-21T15:56:00.000Z'),
      },
      null,
    );

    expect(email.subject).toBe('Incident escalated to Team Lead');
    expect(email.html).toContain('Hi Priya,');
    expect(email.html).toContain('Needs immediate review.');
    expect(email.html).not.toContain('<a ');
    expect(email.text).toContain('Needs immediate review.');
    expect(email.text).not.toContain('View incident:');
  });

  it('usesInlineStylesAndTableLayoutWithoutExternalCssOrImages', () => {
    const email = renderNotificationEmail(baseMessage, incidentLink);

    expect(email.html).toContain('<table role="presentation"');
    expect(email.html).toContain('max-width:560px');
    expect(email.html).not.toContain('<style');
    expect(email.html).not.toContain('<link');
    expect(email.html).not.toContain('<img');
  });
});
