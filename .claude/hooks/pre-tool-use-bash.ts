import * as readline from 'readline';

import { evaluateCommand } from './guard-rules';

/**
 * Reads all of stdin into a string.
 *
 * @returns Promise resolving to the complete stdin content.
 */
async function readStdin(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  let input = '';
  for await (const line of rl) {
    input += line + '\n';
  }
  return input;
}

/** Pre-tool-use hook entry point. Thin I/O wrapper around evaluateCommand(). */
async function main(): Promise<void> {
  const TIMEOUT_MS = 5000;
  try {
    const raw = await Promise.race([
      readStdin(),
      new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve(''), TIMEOUT_MS);
        timer.unref();
      }),
    ]);
    const data: unknown = JSON.parse(raw === '' ? '{}' : raw);
    const obj = data as Record<string, unknown>;
    const toolInput =
      typeof obj?.['tool_input'] === 'object' && obj['tool_input'] !== null
        ? (obj['tool_input'] as Record<string, unknown>)
        : undefined;
    const cmd = typeof toolInput?.['command'] === 'string' ? toolInput['command'] : '';
    const result = evaluateCommand(cmd);
    if (result.action === 'block') {
      console.error(result.message);
      process.exitCode = 2;
    }
  } catch {
    // Malformed JSON or unexpected error — allow (fail-open per E1).
    process.stderr.write('guard-hook: failed to parse stdin, allowing command\n');
  }
}

main().catch((err: unknown) => {
  process.stderr.write(String(err) + '\n');
});
