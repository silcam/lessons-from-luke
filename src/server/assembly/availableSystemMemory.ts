import * as fs from "fs";

/**
 * Linux `MemAvailable` — the kernel's own estimate of how much memory a new
 * workload can claim without swapping. This is the number we want, and it is
 * NOT `os.freemem()`: on the deployed Lightsail box `freemem` reported 303 MB
 * while `MemAvailable` was 1.31 GB, because page cache counts as reclaimable.
 * (`os.availableMemory()` does not exist in this Node build.)
 */
const MEMINFO_PATH = "/proc/meminfo";

/**
 * Parse `MemAvailable` out of `/proc/meminfo` contents, in bytes.
 *
 * Split from the file read so it is unit-testable on macOS, where
 * `/proc/meminfo` does not exist and the whole guard is otherwise inert.
 * Returns `undefined` when the field is absent or unparseable.
 */
export function parseMemAvailable(contents: string): number | undefined {
  const match = /^MemAvailable:\s+(\d+) kB$/m.exec(contents);
  if (!match) {
    return undefined;
  }
  const kilobytes = Number(match[1]);
  if (!Number.isFinite(kilobytes)) {
    return undefined;
  }
  return kilobytes * 1024;
}

/**
 * `MemAvailable` in bytes, or `undefined` where it cannot be read (macOS dev,
 * a container without `/proc`, a permissions failure).
 *
 * `undefined` disables the caller's low-memory guard, so dev and test are
 * unaffected by it.
 */
export function availableSystemMemory(): number | undefined {
  try {
    return parseMemAvailable(fs.readFileSync(MEMINFO_PATH, "utf8"));
  } catch {
    return undefined;
  }
}
