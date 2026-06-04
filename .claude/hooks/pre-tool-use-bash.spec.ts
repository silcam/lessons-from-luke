import { execFile } from 'child_process';

import { describe, expect, it } from 'vitest';

describe('pre-tool-use-bash entry point', () => {
  it('exits promptly when stdin closes (timer must be unreffed)', async () => {
    const MAX_EXIT_MS = 5000;
    const start = Date.now();

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = execFile(
        'npx',
        ['tsx', '.claude/hooks/pre-tool-use-bash.ts'],
        { timeout: MAX_EXIT_MS + 1000 },
        (error) => {
          if (error !== null && 'killed' in error && error.killed === true) {
            reject(
              new Error(`Process did not exit within ${MAX_EXIT_MS}ms — timer likely not unreffed`)
            );
            return;
          }
          resolve(error !== null ? ((error as { code?: number }).code ?? 1) : 0);
        }
      );
      // Send valid JSON then close stdin immediately
      child.stdin?.end(JSON.stringify({ tool_input: { command: 'echo hello' } }) + '\n');
    });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(MAX_EXIT_MS);
    expect(exitCode).toBe(0);
  });
});
