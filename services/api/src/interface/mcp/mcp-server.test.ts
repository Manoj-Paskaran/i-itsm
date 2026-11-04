import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { IncidentNotFoundException } from '../../domain/exceptions/index.js';
import { Permission, type User } from '../../domain/users/index.js';
import { McpServer, RpcError } from './mcp-server.js';
import { createMcpTools, incidentNumber } from './mcp-tools.js';
import { defineTool } from './mcp-tool.js';

const userWith = (...permissions: Permission[]) =>
  ({ can: (p: Permission) => permissions.includes(p) }) as unknown as User;
const employee = userWith(Permission.INCIDENT_REPORT, Permission.INCIDENT_VIEW_OWN);
const lead = userWith(Permission.INCIDENT_VIEW_ALL, Permission.REPORTS_VIEW);
const rpc = (method: string, params?: object) => ({
  jsonrpc: '2.0',
  id: 1,
  method,
  ...(params ? { params } : {}),
});

const incidents = {
  list: vi.fn(() =>
    Promise.resolve([
      { id: 'id-215', number: 'INC0215', slaStatus: 'BREACHED', status: 'IN_PROGRESS' },
    ]),
  ),
  get: vi.fn((_u: User, id: string) =>
    id === 'id-215'
      ? Promise.resolve({ id, number: 'INC0215', allowedActions: ['resolve'] })
      : Promise.reject(new IncidentNotFoundException(id)),
  ),
};
const reports = {
  sla: vi.fn(() => Promise.resolve({ met: 1 })),
  workload: vi.fn(() => Promise.resolve([])),
};
const PG = '0199a000-0000-7000-8000-000000000001';
const services = {
  listActive: vi.fn(() => Promise.resolve([{ id: () => PG, name: () => 'Payment Gateway' }])),
};
const server = new McpServer(createMcpTools({ incidents, reports, services } as never));
const call = (user: User, name: string, args: object = {}) =>
  server.handle(user, rpc('tools/call', { name, arguments: args })) as Promise<{
    result: {
      isError?: boolean;
      content: { text: string }[];
      structuredContent?: { result: unknown };
    };
  }>;

describe('MCP server', () => {
  it('answersInitializeWithToolsCapability', async () =>
    expect(await server.handle(employee, rpc('initialize', {}))).toMatchObject({
      id: 1,
      result: { capabilities: { tools: {} }, serverInfo: { name: 'i-itsm' } },
    }));
  it('listsOnlyTheToolsTheCallerIsAllowedToUse', async () => {
    const names = async (user: User) =>
      (
        (await server.handle(user, rpc('tools/list'))) as { result: { tools: { name: string }[] } }
      ).result.tools.map((t) => t.name);
    expect(await names(employee)).toEqual([
      'search_incidents',
      'get_incident',
      'create_incident_draft',
    ]);
    expect(await names(lead)).toEqual([
      'search_incidents',
      'get_incident',
      'sla_status',
      'technician_workload',
    ]);
  });
  it('publishesEachToolInputAsJsonSchema', async () => {
    const res = (await server.handle(employee, rpc('tools/list'))) as {
      result: { tools: { name: string; inputSchema: { type: string; required?: string[] } }[] };
    };
    expect(res.result.tools.find((t) => t.name === 'get_incident')?.inputSchema).toMatchObject({
      type: 'object',
      required: ['incident'],
    });
  });
  it('refusesAToolCallWithoutItsPermission', async () => {
    const res = await call(employee, 'technician_workload');
    expect(res.result.isError).toBe(true);
    expect(reports.workload).not.toHaveBeenCalled();
  });
  it('rejectsInvalidToolArgumentsAsAToolError', async () =>
    expect((await call(employee, 'get_incident', {})).result).toMatchObject({ isError: true }));
  it('returnsBusinessExceptionsAsToolErrorsNotProtocolErrors', async () => {
    expect((await call(employee, 'get_incident', { incident: 'nope' })).result).toMatchObject({
      isError: true,
      content: [{ text: 'Incident nope was not found.' }],
    });
    expect(incidents.get).not.toHaveBeenCalledWith(employee, 'nope');
  });
  it('reportsUnknownMethodsAsMethodNotFound', async () =>
    expect(await server.handle(employee, rpc('resources/list'))).toMatchObject({
      error: { code: RpcError.METHOD_NOT_FOUND },
    }));
  it('reportsMalformedMessagesAsInvalidRequest', async () =>
    expect(await server.handle(employee, { method: 'tools/list' })).toMatchObject({
      error: { code: RpcError.INVALID_REQUEST },
    }));
  it('sendsNoResponseToNotifications', async () =>
    expect(
      await server.handle(employee, { jsonrpc: '2.0', method: 'notifications/initialized' }),
    ).toBeNull());
  it('hidesUnexpectedFailuresBehindAnInternalError', async () => {
    const broken = new McpServer([
      defineTool({
        name: 'boom',
        description: '',
        permission: null,
        input: z.object({}),
        run: () => Promise.reject(new Error('db down')),
      }),
    ]);
    expect(await broken.handle(employee, rpc('tools/call', { name: 'boom' }))).toMatchObject({
      error: { code: RpcError.INTERNAL, message: 'The tool failed unexpectedly.' },
    });
  });
});

describe('MCP tools', () => {
  it('findsAnIncidentByItsNumberAndDropsTheActionList', async () => {
    const res = await call(lead, 'get_incident', { incident: 'inc0215' });
    expect(res.result.structuredContent?.result).toEqual({ id: 'id-215', number: 'INC0215' });
  });
  it('draftsAnIncidentWithoutSavingIt', async () => {
    const res = await call(employee, 'create_incident_draft', {
      title: 'Checkout payments fail',
      description: 'Every card payment at checkout times out.',
      service: 'payment gateway',
      impact: 4,
      urgency: 4,
      affectedUsers: 8000,
    });
    expect(res.result.structuredContent?.result).toMatchObject({
      saved: false,
      draft: { serviceId: PG, impact: 4 },
      service: { name: 'Payment Gateway' },
    });
  });
  it('namesTheKnownServicesWhenTheDraftServiceIsUnknown', async () =>
    expect(
      (
        await call(employee, 'create_incident_draft', {
          title: 'Printer jam',
          description: 'The office printer is jammed again.',
          service: 'Printers',
          impact: 1,
          urgency: 1,
        })
      ).result.content[0]?.text,
    ).toMatch(/Known services: Payment Gateway/));
  it('listsBreachedIncidentsInSlaStatus', async () => {
    const res = await call(lead, 'sla_status');
    expect(res.result.structuredContent?.result).toMatchObject({
      summary: { met: 1 },
      watch: [{ number: 'INC0215', slaStatus: 'BREACHED' }],
    });
  });
  it('normalisesLooselyWrittenIncidentNumbers', () =>
    expect(['INC-0215', '#inc0215', '215', 'INC0215', 'printer'].map(incidentNumber)).toEqual([
      'INC0215',
      'INC0215',
      'INC0215',
      'INC0215',
      null,
    ]));
});
