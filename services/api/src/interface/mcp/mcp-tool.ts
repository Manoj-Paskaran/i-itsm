import type { z } from 'zod';
import type { Permission, User } from '../../domain/users/index.js';

/**
 * One MCP tool (Command pattern): a name, a Zod input schema the server publishes as JSON Schema,
 * the permission a caller needs to see and call it, and a run method that delegates to an
 * existing application service. Tools add no business rules of their own.
 */
export interface McpTool<S extends z.ZodType = z.ZodType> {
  readonly name: string;
  readonly description: string;
  readonly input: S;
  /** null: any signed-in user; the application service still applies its own object-level checks. */
  readonly permission: Permission | null;
  run(user: User, args: z.infer<S>): Promise<unknown>;
}

export const defineTool = <S extends z.ZodType>(tool: McpTool<S>): McpTool => tool;
