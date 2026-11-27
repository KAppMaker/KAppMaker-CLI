/**
 * A failure the CLI reports as one plain message and a non-zero exit code,
 * without a stack trace. Thrown from services instead of calling
 * process.exit() so orchestrators can record the step as FAILED and tests can
 * assert on it. src/index.ts prints `message` and exits with `exitCode`.
 */
export class CliError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message);
    this.name = 'CliError';
  }
}

/** A remote API answered with a non-2xx status. `body` is the raw response text. */
export class ApiError extends CliError {
  constructor(
    readonly label: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${label}: HTTP ${status}${body ? `\n${truncate(body)}` : ''}`);
    this.name = 'ApiError';
  }
}

/** An external CLI (asc, adapty, ...) exited non-zero. */
export class ToolError extends CliError {
  constructor(
    readonly label: string,
    readonly tool: string,
    readonly toolExitCode: number,
    readonly output: string,
  ) {
    super(`${label}: ${tool} exited ${toolExitCode}${output ? `\n${truncate(output)}` : ''}`);
    this.name = 'ToolError';
  }
}

export function truncate(text: string, max = 4000): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}\n... (${t.length - max} more characters)` : t;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
