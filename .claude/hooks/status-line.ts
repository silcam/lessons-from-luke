import { execSync } from 'child_process';

interface StatusLineInput {
  workspace?: {
    current_dir?: string;
    project_dir?: string;
  };
  context_window?: {
    used_percentage?: number;
    total_input_tokens?: number;
    context_window_size?: number;
    current_usage?: {
      input_tokens?: number;
    };
  };
}

/**
 * Reads all data from stdin.
 *
 * @returns Promise resolving to the stdin content as a string
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}

/**
 * Formats token count to a human-readable string.
 *
 * @param tokens - Number of tokens
 * @returns Formatted token string (e.g., "129.8K" or "1234")
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Gets the current git branch name.
 *
 * @returns The current git branch name, or 'no-git' if not in a git repository
 */
function getGitBranch(): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return branch.length > 0 ? branch : 'no-git';
  } catch {
    return 'no-git';
  }
}

/**
 * Main function that outputs the status line.
 *
 * @returns Promise that resolves when the status line is output
 */
async function main(): Promise<void> {
  const inputText = await readStdin();
  const input: StatusLineInput =
    inputText.length > 0 ? (JSON.parse(inputText) as StatusLineInput) : {};

  const percent = input.context_window?.used_percentage ?? 0;
  const contextSize = input.context_window?.context_window_size ?? 200000;
  const tokens = Math.round((contextSize * percent) / 100);
  const currentDir = input.workspace?.current_dir ?? process.cwd();
  const folderName = currentDir.split('/').pop() ?? 'unknown';
  const gitBranch = getGitBranch();

  const formattedTokens = formatTokens(tokens);
  const percentFormatted = Math.round(percent);

  // ANSI color codes: green=32, cyan=36, yellow=33
  const folderColor = '\x1b[32m';
  const branchColor = '\x1b[36m';
  const contextColor = '\x1b[33m';
  const reset = '\x1b[0m';

  // Output plain text (not JSON) with colors
  console.log(
    `${folderColor}${folderName}${reset}:${branchColor}${gitBranch}${reset} [${contextColor}${formattedTokens} ${percentFormatted}%${reset}]`
  );
}

main().catch((_error: unknown) => {
  console.error('Error');
  process.exit(0);
});
