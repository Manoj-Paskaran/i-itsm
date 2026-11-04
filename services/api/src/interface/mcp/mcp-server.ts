import { z } from 'zod';
import { ItsmException } from '../../domain/exceptions/index.js';
import type { User } from '../../domain/users/index.js';
import type { McpTool } from './mcp-tool.js';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
type Id = string | number | null;
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: Id;
  method: string;
  params?: Record<string, unknown>;
}
export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: Id; result: unknown }
  | { jsonrpc: '2.0'; id: Id; error: { code: number; message: string; data?: unknown } };

const RequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});
const CallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

/** JSON-RPC error codes from the JSON-RPC 2.0 spec that MCP reuses. */
export const RpcError = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
} as const;

/**
 * A minimal, stateless MCP server over JSON-RPC 2.0 (initialize, ping, tools/list, tools/call).
 * RBAC: a caller only sees and can call the tools their permissions allow; every call runs as
 * the caller, so the application services' own checks (e.g. a technician sees only assigned
 * incidents) still apply.
 */
export class McpServer {
  private readonly tools: ReadonlyMap<string, McpTool>;
  constructor(tools: readonly McpTool[]) {
    this.tools = new Map(tools.map((tool) => [tool.name, tool]));
  }

  allowedTools(user: User) {
    return [...this.tools.values()].filter((t) => t.permission === null || user.can(t.permission));
  }

  /** Returns the response, or null for a notification (a request without an id). */
  async handle(user: User, message: unknown): Promise<JsonRpcResponse | null> {
    const parsed = RequestSchema.safeParse(message);
    if (!parsed.success)
      return this.error(null, RpcError.INVALID_REQUEST, 'Invalid JSON-RPC request.');
    const { id, method, params } = parsed.data;
    if (id === undefined) return null;
    switch (method) {
      case 'initialize':
        return this.ok(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'i-itsm', version: '1.0.0' },
          instructions:
            'Tools act as the signed-in I-ITSM user and only return what that user may see.',
        });
      case 'ping':
        return this.ok(id, {});
      case 'tools/list':
        return this.ok(id, {
          tools: this.allowedTools(user).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: z.toJSONSchema(t.input, { io: 'input' }),
          })),
        });
      case 'tools/call':
        return this.call(user, id, params);
      default:
        return this.error(id, RpcError.METHOD_NOT_FOUND, `Unknown method ${method}.`);
    }
  }

  private async call(user: User, id: Id, params: unknown): Promise<JsonRpcResponse> {
    const call = CallSchema.safeParse(params);
    if (!call.success)
      return this.error(id, RpcError.INVALID_PARAMS, 'tools/call needs a tool name.');
    const tool = this.tools.get(call.data.name);
    if (!tool) return this.error(id, RpcError.INVALID_PARAMS, `Unknown tool ${call.data.name}.`);
    if (tool.permission !== null && !user.can(tool.permission))
      return this.toolError(id, `You do not have permission to use ${tool.name}.`);
    const args = tool.input.safeParse(call.data.arguments ?? {});
    if (!args.success)
      return this.toolError(
        id,
        `Invalid arguments: ${args.error.issues.map((i) => `${i.path.join('.') || 'input'} ${i.message}`).join('; ')}`,
      );
    try {
      const result = await tool.run(user, args.data);
      return this.ok(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: { result },
      });
    } catch (error) {
      // Business and security failures are the tool's answer, not a protocol fault.
      if (error instanceof ItsmException) return this.toolError(id, error.message);
      return this.error(id, RpcError.INTERNAL, 'The tool failed unexpectedly.');
    }
  }

  private ok(id: Id, result: unknown): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result };
  }
  private toolError(id: Id, text: string): JsonRpcResponse {
    return this.ok(id, { content: [{ type: 'text', text }], isError: true });
  }
  private error(id: Id, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }
}
