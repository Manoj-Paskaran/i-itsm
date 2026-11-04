import {
  CreateIncidentRequestSchema,
  IncidentListQuerySchema,
  IncidentStatusSchema,
  PrioritySchema,
} from '@itsm/contracts';
import { z } from 'zod';
import type { IncidentService } from '../../application/incidents/incident.service.js';
import type { ReportService } from '../../application/reports/report.service.js';
import { IncidentNotFoundException, InvalidInputException } from '../../domain/exceptions/index.js';
import { Permission, type User } from '../../domain/users/index.js';
import type { ItServiceRepository } from '../../ports/index.js';
import { defineTool, type McpTool } from './mcp-tool.js';

const level = z.number().int().min(1).max(4);

/** The API's per-viewer action list is filtered in the HTTP controller; an MCP client reads, so it is left out. */
function withoutActions<T extends { allowedActions?: unknown }>(detail: T) {
  const rest: Partial<T> = { ...detail };
  delete rest.allowedActions;
  return rest;
}

/** Assistants write numbers loosely ("INC-0215", "#INC0215", "215"); normalise to INC0215. */
export function incidentNumber(ref: string) {
  const digits = /^#?(?:INC-?)?(\d{1,})$/i.exec(ref.trim())?.[1];
  return digits ? `INC${digits.padStart(4, '0')}` : null;
}

async function findIncident(incidents: IncidentService, user: User, ref: string) {
  if (z.uuid().safeParse(ref).success) return incidents.get(user, ref);
  const number = incidentNumber(ref);
  if (!number) throw new IncidentNotFoundException(ref);
  const [match] = (
    await incidents.list(user, IncidentListQuerySchema.parse({ q: number, limit: 20 }))
  ).filter((i) => i.number === number);
  if (!match) throw new IncidentNotFoundException(number);
  return incidents.get(user, match.id);
}

export function createMcpTools(deps: {
  incidents: IncidentService;
  reports: ReportService;
  services: ItServiceRepository;
}): McpTool[] {
  const { incidents, reports, services } = deps;
  return [
    defineTool({
      name: 'search_incidents',
      description:
        'Search the incidents you can see (technicians: assigned to you; employees: reported by you; staff: all). Matches title, description and number, newest first.',
      permission: null,
      input: z.object({
        query: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Text or an incident number such as INC0215'),
        status: IncidentStatusSchema.optional(),
        priority: PrioritySchema.optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      run: async (user, args) =>
        incidents.list(
          user,
          IncidentListQuerySchema.parse({
            limit: args.limit,
            ...(args.query ? { q: args.query } : {}),
            ...(args.status ? { status: args.status } : {}),
            ...(args.priority ? { priority: args.priority } : {}),
          }),
        ),
    }),
    defineTool({
      name: 'get_incident',
      description:
        'One incident in full: priority with its rationale, SLA deadlines, assignee with the assignment reasons, notes, information requests and resolution.',
      permission: null,
      input: z.object({
        incident: z.string().trim().min(1).describe('Incident number (INC0215) or id'),
      }),
      run: async (user, args) => withoutActions(await findIncident(incidents, user, args.incident)),
    }),
    defineTool({
      name: 'sla_status',
      description:
        'SLA compliance overall and per priority, plus the incidents that are breached or at risk right now, most urgent first.',
      permission: Permission.REPORTS_VIEW,
      input: z.object({}),
      run: async (user) => {
        const [summary, list] = await Promise.all([
          reports.sla(user),
          incidents.list(user, IncidentListQuerySchema.parse({ limit: 200 })),
        ]);
        const watch = list
          .filter(
            (i) =>
              (i.slaStatus === 'BREACHED' || i.slaStatus === 'AT_RISK') && i.status !== 'CLOSED',
          )
          .sort((a, b) => Number(b.slaStatus === 'BREACHED') - Number(a.slaStatus === 'BREACHED'))
          .map((i) => ({
            number: i.number,
            title: i.title,
            priority: i.priority,
            slaStatus: i.slaStatus,
            escalationLevel: i.escalationLevel,
            assignee: i.assignee?.name ?? null,
          }));
        return { summary, watch };
      },
    }),
    defineTool({
      name: 'technician_workload',
      description:
        'Each technician: open incidents against capacity, utilisation, incidents resolved in the last 30 days and availability.',
      permission: Permission.REPORTS_VIEW,
      input: z.object({}),
      run: async (user) => reports.workload(user),
    }),
    defineTool({
      name: 'create_incident_draft',
      description:
        'Prepare an incident report from a conversation. It validates the fields and resolves the service, but saves nothing: the person submits it in the Report form or with POST /api/incidents.',
      permission: Permission.INCIDENT_REPORT,
      input: z.object({
        title: z.string(),
        description: z.string(),
        service: z.string().trim().min(1).describe('Service name (e.g. Payment Gateway) or id'),
        impact: level.describe('1 small annoyance … 4 the business has stopped'),
        urgency: level.describe('1 whenever someone is free … 4 right now'),
        affectedUsers: z.number().int().min(1).default(1),
      }),
      run: async (_user, args) => {
        const active = await services.listActive();
        const service = active.find(
          (s) => s.id() === args.service || s.name().toLowerCase() === args.service.toLowerCase(),
        );
        if (!service)
          throw new InvalidInputException(
            `Unknown service "${args.service}". Known services: ${active.map((s) => s.name()).join(', ')}.`,
            {},
          );
        const draft = CreateIncidentRequestSchema.safeParse({
          title: args.title,
          description: args.description,
          serviceId: service.id(),
          impact: args.impact,
          urgency: args.urgency,
          affectedUsers: args.affectedUsers,
        });
        if (!draft.success)
          throw new InvalidInputException(
            draft.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
            {},
          );
        return {
          saved: false,
          draft: draft.data,
          service: { id: service.id(), name: service.name() },
          nextStep:
            'Review the draft, then submit it in the Report a problem form or with POST /api/incidents.',
        };
      },
    }),
  ];
}
