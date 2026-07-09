import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

/**
 * Re-packs an extracted ODT directory into `outPath`, honoring the
 * ODF-required constraint that the `mimetype` entry be stored first and
 * uncompressed (`-0`) so ODF-aware consumers can identify the file type by
 * reading only the first bytes of the archive.
 *
 * Shared by `flattenFooterFields.ts` and `renameMasterPageStyles.ts`, both
 * of which re-pack an ODT after mutating its extracted XML in place.
 */
export function rezipWithMimetypeFirst(extractDirPath: string, outPath: string): void {
  const absOutPath = path.resolve(outPath);
  fs.rmSync(absOutPath, { force: true });
  execFileSync("zip", ["-X", "-q", "-0", absOutPath, "mimetype"], { cwd: extractDirPath });
  execFileSync("zip", ["-X", "-q", "-r", "-D", absOutPath, ".", "-x", "mimetype"], {
    cwd: extractDirPath,
  });
}
