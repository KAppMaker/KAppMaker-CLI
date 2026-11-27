import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../mcp/server.js';

/**
 * `kappmaker mcp` — the CLI as an MCP server on stdio, for any MCP agent
 * (Claude Code, Codex, Gemini CLI). stdout carries the protocol only; every
 * command runs in a child process, and diagnostics go to stderr.
 * Local only: it talks to nothing itself; each tool's command talks to the
 * services the buyer configured, exactly as when run by hand.
 */
export async function mcpCommand(): Promise<void> {
  const { version } = createRequire(import.meta.url)('../../package.json') as { version: string };
  const server = await createMcpServer({ version });
  await server.connect(new StdioServerTransport());
  console.error(`kappmaker mcp ${version} ready on stdio`);
}
