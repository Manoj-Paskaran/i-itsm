import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '../../domain/users/index.js';
import { CurrentUser } from '../auth/decorators.js';
import { McpServer } from './mcp-server.js';

/**
 * MCP over Streamable HTTP, stateless: each POST carries one JSON-RPC message and the caller's
 * bearer token (checked by the global AuthGuard), so every tool runs as that user.
 */
@Controller('mcp')
export class McpController {
  constructor(private readonly server: McpServer) {}

  @Post() async message(@CurrentUser() user: User, @Body() body: unknown, @Res() res: Response) {
    const reply = await this.server.handle(user, body);
    if (reply === null) res.status(202).end();
    else res.status(200).json(reply);
  }

  /** No server-initiated stream: this server only answers requests. */
  @Get() @HttpCode(405) stream() {
    return { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for MCP messages.' } };
  }
}
