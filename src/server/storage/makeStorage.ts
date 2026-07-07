import { Persistence } from "../../core/interfaces/Persistence";
import PGStorage, { PGTestStorage, PGDevStorage } from "./PGStorage";

export default function makeStorage(): Persistence {
  return process.env.NODE_ENV === "production"
    ? new PGStorage()
    : process.env.NODE_ENV === "test"
      ? new PGTestStorage()
      : new PGDevStorage();
}
