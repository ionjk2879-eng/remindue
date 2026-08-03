import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface BoundStatement {
  run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }>;
  first<T>(column?: string): Promise<T | null>;
  all<T>(): Promise<{ results: T[]; success: true }>;
}

export interface IntegrationD1 {
  prepare(sql: string): BoundStatement & { bind(...args: unknown[]): BoundStatement };
  batch(statements: BoundStatement[]): Promise<unknown[]>;
  raw: DatabaseSync;
}

/** A real in-memory SQLite database with every production migration applied. */
export function createIntegrationD1(): IntegrationD1 {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');

  const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  for (const filename of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(migrationsDir, filename), 'utf8'));
  }

  const prepare = (sql: string) => {
    const bound = (args: unknown[]): BoundStatement => ({
      async run() {
        const info = db.prepare(sql).run(...(args as never[]));
        return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
      },
      async first<T>(column?: string) {
        const row = db.prepare(sql).get(...(args as never[])) as Record<string, unknown> | undefined;
        if (!row) return null;
        return (column ? row[column] : row) as T | null;
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...(args as never[])) as T[], success: true };
      },
    });
    return { ...bound([]), bind: (...args: unknown[]) => bound(args) };
  };

  return {
    raw: db,
    prepare,
    async batch(statements) {
      const results: unknown[] = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
}
