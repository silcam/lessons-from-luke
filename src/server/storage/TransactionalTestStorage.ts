import postgres from "postgres";
import { PGTestStorage, transformCol } from "./PGStorage";
import pgLoadFixtures from "./pgLoadFixtures";
import secrets from "../util/secrets";
import { TString } from "../../core/models/TString";

export class TransactionalTestStorage extends PGTestStorage {
  private rootSql: any;
  private txPool: any;
  private rollbackFn: ((e: Error) => void) | null = null;
  private transactionDone: Promise<void> | null = null;
  private inTransaction = false;

  constructor() {
    super();
    this.rootSql = (this as any).sql;
    // Single-connection pool used to wrap each test in a transaction
    this.txPool = postgres({
      ...secrets.testDb,
      max: 1,
      transform: { column: transformCol },
    } as any);
  }

  async beginTransaction(): Promise<void> {
    let signalReady!: () => void;
    const ready = new Promise<void>(r => {
      signalReady = r;
    });

    let triggerRollback!: (e: Error) => void;
    const holdUntilRollback = new Promise<void>((_, reject) => {
      triggerRollback = reject;
    });

    this.rollbackFn = triggerRollback;

    this.transactionDone = this.txPool
      .begin(async (txSql: any) => {
        (this as any).sql = txSql;
        this.inTransaction = true;
        signalReady();
        await holdUntilRollback;
      })
      .catch(() => {
        // swallow the rejection used to trigger rollback; sql was already
        // reset to rootSql in rollbackTransaction() but set it here too as a
        // safety net for close() calling rollbackTransaction() directly.
        (this as any).sql = this.rootSql;
      });

    await ready;
  }

  async rollbackTransaction(): Promise<void> {
    if (this.rollbackFn) {
      // Mark as outside transaction before swapping sql so that any
      // updateProgress() calls that start after this point are no-ops.
      this.inTransaction = false;
      // Swap this.sql back to rootSql BEFORE triggering rollback so that any
      // fire-and-forget async operations still in flight (e.g. defaultTranslations)
      // use rootSql rather than txSql. This prevents them from queuing more work
      // onto the txPool connection, which would block txPool.end().
      (this as any).sql = this.rootSql;
      this.rollbackFn(new Error("test rollback"));
      await this.transactionDone;
      this.rollbackFn = null;
      this.transactionDone = null;
      // PostgreSQL sequences are non-transactional: ROLLBACK does not restore
      // them. Reset all sequences to fixture values so every test sees the same
      // auto-increment baseline and assertions on generated IDs stay stable.
      await this.rootSql`ALTER SEQUENCE languages_languageid_seq RESTART 4`;
      await this.rootSql`ALTER SEQUENCE lessons_lessonid_seq RESTART 16`;
      await this.rootSql`ALTER SEQUENCE lessonstrings_lessonstringid_seq RESTART 1409`;
      await this.rootSql`ALTER SEQUENCE tstrings_masterid_seq RESTART 655`;
    }
  }

  // Override updateProgress() to be a no-op outside a transaction. This
  // prevents fire-and-forget progress recalculations that race across the
  // transaction boundary from writing stale progress values to the real DB.
  async updateProgress(): Promise<void> {
    if (!this.inTransaction) return;
    return super.updateProgress();
  }

  // Override withProgressUpdate() to AWAIT progress instead of firing it
  // and forgetting. Combined with the updateProgress() guard above, this
  // ensures progress is either calculated fully inside the transaction
  // (and rolled back with it) or skipped entirely — never written via rootSql
  // with data that came from a now-rolled-back transaction.
  async withProgressUpdate<T>(cb: () => Promise<T>): Promise<T> {
    const val = await cb();
    await this.updateProgress();
    return val;
  }

  // Override saveTStrings() to be a no-op outside a transaction, and to
  // always await progress inside one. Outside a transaction the call comes
  // from fire-and-forget code (e.g. defaultTranslations) that races across
  // the rollback boundary; those writes would produce orphaned rows in the
  // real DB and pollute subsequent tests.
  async saveTStrings(
    tStrings: TString[],
    opts: { awaitProgress?: boolean } = {}
  ) {
    if (!this.inTransaction) return [];
    return super.saveTStrings(tStrings, { ...opts, awaitProgress: true });
  }

  // Override reset() to use rootSql so pgLoadFixtures runs outside the
  // active transaction (avoids accidentally committing it).
  async reset(): Promise<void> {
    await pgLoadFixtures(this.rootSql);
  }

  async close(): Promise<void> {
    if (this.rollbackFn) {
      await this.rollbackTransaction();
    }
    await this.txPool.end();
    await this.rootSql.end();
  }
}
