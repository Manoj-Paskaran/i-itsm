import { EventType } from '../../domain/events/index.js';
import type { NotificationMessage } from '../../application/notifications/notification-message.js';

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO_STACK =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

const EVENT_LABELS: Partial<Record<EventType, string>> = {
  [EventType.IncidentCreated]: 'Reported',
  [EventType.IncidentAssigned]: 'Assigned',
  [EventType.IncidentAcknowledged]: 'Acknowledged',
  [EventType.WorkStarted]: 'Work started',
  [EventType.PriorityChanged]: 'Priority changed',
  [EventType.InfoRequested]: 'Information requested',
  [EventType.InfoProvided]: 'Information provided',
  [EventType.SlaWarningRaised]: 'SLA at risk',
  [EventType.SlaBreached]: 'SLA breached',
  [EventType.IncidentEscalated]: 'Escalated',
  [EventType.IncidentResolved]: 'Resolved',
  [EventType.IncidentVerified]: 'Verified',
  [EventType.IncidentReopened]: 'Reopened',
  [EventType.IncidentClosed]: 'Closed',
};

const REPORTER_EVENTS = new Set<EventType>([
  EventType.IncidentCreated,
  EventType.InfoRequested,
  EventType.IncidentResolved,
  EventType.IncidentClosed,
]);

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br />');
}

function firstName(name?: string): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function buildSubject(message: NotificationMessage): string {
  const number = message.incidentNumber?.trim();
  if (!number) return singleLine(message.title);
  const label = EVENT_LABELS[message.eventType] ?? 'Update';
  const incidentTitle = message.incidentTitle?.trim();
  return singleLine(
    incidentTitle ? `[${number}] ${label}: ${incidentTitle}` : `[${number}] ${label}`,
  );
}

function buildHeadline(message: NotificationMessage): string {
  switch (message.eventType) {
    case EventType.IncidentResolved:
      return 'Your incident has been resolved';
    case EventType.InfoRequested: {
      const actor = firstName(message.actorName);
      return actor ? `${actor} needs more information` : 'More information is needed';
    }
    case EventType.IncidentAssigned:
      return message.title.includes('to you')
        ? 'An incident has been assigned to you'
        : 'An incident has been assigned';
    case EventType.SlaWarningRaised:
      return 'An incident SLA is at risk';
    case EventType.SlaBreached:
      return 'An incident SLA has been breached';
    case EventType.IncidentEscalated:
      return 'An incident has been escalated';
    case EventType.IncidentReopened:
      return 'An incident has been reopened';
    case EventType.InfoProvided:
      return 'New information has been provided';
    case EventType.IncidentCreated:
      return 'Your incident has been reported';
    case EventType.IncidentClosed:
      return 'Your incident has been closed';
    case EventType.PriorityChanged:
      return 'Incident priority has changed';
    default:
      return message.title;
  }
}

function buildButtonLabel(eventType: EventType): string {
  switch (eventType) {
    case EventType.IncidentResolved:
      return 'Review and confirm the fix';
    case EventType.InfoRequested:
      return 'Answer the question';
    default:
      return 'View incident';
  }
}

function buildFooter(message: NotificationMessage): string {
  if (!message.incidentId && !message.incidentNumber) {
    return 'You get this email from I-ITSM.';
  }
  if (REPORTER_EVENTS.has(message.eventType)) {
    return 'You get this email because you reported this incident.';
  }
  return 'You get this email because you are notified about this incident in I-ITSM.';
}

function quoteLines(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

export function renderNotificationEmail(
  message: NotificationMessage,
  link: string | null,
): RenderedEmail {
  const subject = buildSubject(message);
  const recipientFirst = firstName(message.recipientName);
  const greeting = recipientFirst ? `Hi ${recipientFirst},` : 'Hi,';
  const headline = buildHeadline(message);
  const buttonLabel = buildButtonLabel(message.eventType);
  const footer = buildFooter(message);

  const incidentNumber = message.incidentNumber?.trim() || null;
  const incidentTitle = message.incidentTitle?.trim() || null;
  const body = message.body.trim();
  const isResolved = message.eventType === EventType.IncidentResolved;
  const isInfoRequested = message.eventType === EventType.InfoRequested;

  const summary = isResolved ? message.resolutionSummary?.trim() || body : '';
  const rootCause = isResolved ? message.rootCause?.trim() || '' : '';
  const question = isInfoRequested ? message.question?.trim() || body : '';
  const showGenericBody =
    !isResolved && !isInfoRequested && body.length > 0 && body !== incidentTitle;

  const hasCardHeader = Boolean(incidentNumber || incidentTitle);
  const hasCardBody = Boolean(
    (isResolved && (summary || rootCause)) || (isInfoRequested && question) || showGenericBody,
  );

  // Plain-text version
  const textParts: string[] = ['I-ITSM', greeting, headline];
  if (incidentNumber && incidentTitle) {
    textParts.push(`${incidentNumber} — ${incidentTitle}`);
  } else if (incidentNumber) {
    textParts.push(incidentNumber);
  } else if (incidentTitle) {
    textParts.push(incidentTitle);
  }
  if (isResolved) {
    if (summary) textParts.push(`What we did:\n${summary}`);
    if (rootCause) textParts.push(`Root cause:\n${rootCause}`);
  } else if (isInfoRequested) {
    if (question) textParts.push(quoteLines(question));
  } else if (showGenericBody) {
    textParts.push(body);
  }
  if (link) {
    textParts.push(`${buttonLabel}: ${link}`);
  }
  textParts.push(footer);
  const text = textParts.join('\n\n');

  // HTML card sections
  const cardHeaderRows: string[] = [];
  if (incidentNumber) {
    cardHeaderRows.push(
      `<tr><td style="font-family:${MONO_STACK};font-size:12px;font-weight:600;line-height:16px;letter-spacing:0.04em;color:#475467;padding:0${incidentTitle ? ' 0 4px 0' : ''};">${escapeHtml(incidentNumber)}</td></tr>`,
    );
  }
  if (incidentTitle) {
    cardHeaderRows.push(
      `<tr><td style="font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:22px;color:#181d27;padding:0;">${escapeHtml(incidentTitle)}</td></tr>`,
    );
  }

  const cardBodyBlocks: string[] = [];
  if (isResolved) {
    if (summary) {
      cardBodyBlocks.push(
        `<tr><td style="font-family:${FONT_STACK};font-size:12px;font-weight:600;line-height:16px;color:#667085;padding:0 0 4px 0;">What we did</td></tr>` +
          `<tr><td style="font-family:${FONT_STACK};font-size:14px;font-weight:400;line-height:22px;color:#181d27;padding:0;">${escapeMultiline(summary)}</td></tr>`,
      );
    }
    if (rootCause) {
      const topPad = summary ? '14px' : '0';
      cardBodyBlocks.push(
        `<tr><td style="font-family:${FONT_STACK};font-size:12px;font-weight:600;line-height:16px;color:#667085;padding:${topPad} 0 4px 0;">Root cause</td></tr>` +
          `<tr><td style="font-family:${FONT_STACK};font-size:14px;font-weight:400;line-height:22px;color:#344054;padding:0;">${escapeMultiline(rootCause)}</td></tr>`,
      );
    }
  } else if (isInfoRequested && question) {
    cardBodyBlocks.push(
      `<tr><td style="padding:0;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-left:3px solid #98a2b3;border-radius:0 4px 4px 0;">` +
        `<tr><td style="font-family:${FONT_STACK};font-size:14px;font-weight:400;line-height:22px;color:#181d27;padding:12px 14px;">&ldquo;${escapeMultiline(question)}&rdquo;</td></tr>` +
        `</table>` +
        `</td></tr>`,
    );
  } else if (showGenericBody) {
    cardBodyBlocks.push(
      `<tr><td style="font-family:${FONT_STACK};font-size:14px;font-weight:400;line-height:22px;color:#344054;padding:0;">${escapeMultiline(body)}</td></tr>`,
    );
  }

  const dividerRow =
    hasCardHeader && hasCardBody
      ? `<tr><td style="padding:14px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #e4e7ec;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`
      : '';

  const cardHtml =
    hasCardHeader || hasCardBody
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e4e7ec;border-radius:6px;">` +
        `<tr><td style="padding:16px 18px;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
        `${cardHeaderRows.join('')}${dividerRow}${cardBodyBlocks.join('')}` +
        `</table>` +
        `</td></tr>` +
        `</table>`
      : '';

  const buttonHtml = link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">` +
      `<tr><td align="center" bgcolor="#2355b8" style="background-color:#2355b8;border-radius:6px;">` +
      `<a href="${escapeHtml(link)}" target="_blank" style="display:inline-block;padding:12px 20px;font-family:${FONT_STACK};font-size:14px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(buttonLabel)}</a>` +
      `</td></tr>` +
      `</table>`
    : '';

  const html =
    `<!DOCTYPE html>` +
    `<html lang="en">` +
    `<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:#f4f6f8;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;">` +
    `<tr><td align="center" style="padding:32px 16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;">` +
    `<tr><td style="font-family:${FONT_STACK};font-size:13px;font-weight:700;line-height:18px;letter-spacing:0.06em;color:#181d27;padding:0 0 14px 2px;">I-ITSM</td></tr>` +
    `<tr><td style="background-color:#ffffff;border:1px solid #e4e7ec;border-radius:8px;padding:28px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td style="font-family:${FONT_STACK};font-size:14px;font-weight:400;line-height:20px;color:#475467;padding:0 0 6px 0;">${escapeHtml(greeting)}</td></tr>` +
    `<tr><td style="font-family:${FONT_STACK};font-size:20px;font-weight:600;line-height:28px;letter-spacing:-0.01em;color:#181d27;padding:0 0 20px 0;">${escapeHtml(headline)}</td></tr>` +
    (cardHtml ? `<tr><td style="padding:0;">${cardHtml}</td></tr>` : '') +
    (buttonHtml ? `<tr><td style="padding:0;">${buttonHtml}</td></tr>` : '') +
    `</table>` +
    `</td></tr>` +
    `<tr><td style="font-family:${FONT_STACK};font-size:12px;font-weight:400;line-height:18px;color:#667085;padding:16px 2px 0 2px;">${escapeHtml(footer)}</td></tr>` +
    `</table>` +
    `</td></tr>` +
    `</table>` +
    `</body>` +
    `</html>`;

  return { subject, text, html };
}
