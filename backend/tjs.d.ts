// Minimal fallback typing for the txiki.js runtime global.
// For full types: `npm i -D @txikijs/types`, then delete this file and add
// "types": ["@txikijs/types"] to your tsconfig.
declare const tjs: any;

// txiki.js built-in SQLite module (fully synchronous)
declare module 'tjs:sqlite' {
  export interface Statement {
    /** rows as plain objects */
    all(...params: unknown[]): any[];
    /** executes without returning rows (returns void) */
    run(...params: unknown[]): void;
    finalize(): void;
  }

  export class Database {
    constructor(path?: string, options?: { create?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }
}
