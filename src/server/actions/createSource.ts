import { readSourceManifest, writeSourceLanguage } from "../FileStorage";
import { findBy } from "../../core/util/arrayUtils";
import { newSource } from "../../core/Source";

export default function createSource(language: string) {
  const manifest = readSourceManifest();
  if (findBy(manifest, "language", language)) return;
  const source = newSource(language);
  writeSourceLanguage(source);
}
