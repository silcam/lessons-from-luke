declare module "postgres" {
  interface Options {
    database?: string;
    username?: string;
    password?: string;
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
}
