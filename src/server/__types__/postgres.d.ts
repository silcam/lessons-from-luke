declare module "postgres" {
  interface Options {
    database?: string;
    username?: string;
    password?: string;
    host?: string;
    port?: number;
    // Extra Postgres startup parameters, sent to every physical connection
    // this pool opens (not just the first query run on it). Used to set
    // `default_transaction_read_only` for PGSnapshotStorage.
    connection?: Record<string, string | boolean | number>;
    transform?: {
      column: (col: string) => string;
    };
    debug?: (con: any, query: string, params: any) => void;
  }

  interface SqlFunc {
    (literals: TemplateStringsArray, ...placeholders: any[]): Promise<any[]>;
    (models: any, ...fields: string[]): string;

    begin: (cb: (sql: SqlFunc) => Promise<any>) => Promise<any>;

    end: () => Promise<void>;

    json: (obj: any) => string;
  }

  export default function postgres(opts: Options): SqlFunc;
  export default function postgres(url: string, opts?: Options): SqlFunc;
}
