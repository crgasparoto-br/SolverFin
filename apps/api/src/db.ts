import "./load-env.js";

import { AsyncLocalStorage } from "node:async_hooks";

import { Pool, type QueryResultRow } from "pg";

export type QueryExecutor = <TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[],
) => Promise<TRow[]>;

interface SharedTransactionContext {
  executeQuery: QueryExecutor;
  savepointCounter: number;
}

const sharedTransactionStorage = new AsyncLocalStorage<SharedTransactionContext>();
let pool: Pool | undefined;

export function getPool(): Pool {
  pool ??= new Pool({ connectionString: requireDatabaseUrl() });

  return pool;
}

export async function query<TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<TRow[]> {
  const context = sharedTransactionStorage.getStore();
  if (context) {
    return context.executeQuery<TRow>(text, params);
  }

  const result = await getPool().query<TRow>(text, params as unknown[]);

  return result.rows;
}

export async function withTransaction<TResult>(
  run: (executeQuery: QueryExecutor) => Promise<TResult>,
): Promise<TResult> {
  const sharedContext = sharedTransactionStorage.getStore();
  if (sharedContext) {
    return runNestedTransaction(sharedContext, run);
  }

  return runRootTransaction(run, false);
}

/**
 * Runs a transaction whose connection is also used by repository helpers that
 * call the global `query` function. Nested `withTransaction` calls become
 * savepoints only inside this explicit scope. Regular transactions retain the
 * repository's previous independent-connection behavior.
 */
export async function withSharedTransaction<TResult>(
  run: (executeQuery: QueryExecutor) => Promise<TResult>,
): Promise<TResult> {
  const sharedContext = sharedTransactionStorage.getStore();
  if (sharedContext) {
    return runNestedTransaction(sharedContext, run);
  }

  return runRootTransaction(run, true);
}

async function runRootTransaction<TResult>(
  run: (executeQuery: QueryExecutor) => Promise<TResult>,
  shareWithGlobalQueries: boolean,
): Promise<TResult> {
  const client = await getPool().connect();
  const scopedQuery: QueryExecutor = async <TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<TRow[]> => {
    const result = await client.query<TRow>(text, params as unknown[]);
    return result.rows;
  };
  const context: SharedTransactionContext = {
    executeQuery: scopedQuery,
    savepointCounter: 0,
  };

  try {
    await client.query("BEGIN");

    const result = shareWithGlobalQueries
      ? await sharedTransactionStorage.run(context, () => run(scopedQuery))
      : await run(scopedQuery);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function runNestedTransaction<TResult>(
  context: SharedTransactionContext,
  run: (executeQuery: QueryExecutor) => Promise<TResult>,
): Promise<TResult> {
  context.savepointCounter += 1;
  const savepoint = `solverfin_nested_${context.savepointCounter}`;

  await context.executeQuery(`SAVEPOINT ${savepoint}`);

  try {
    const result = await run(context.executeQuery);
    await context.executeQuery(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    await context.executeQuery(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await context.executeQuery(`RELEASE SAVEPOINT ${savepoint}`);
    throw error;
  }
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = undefined;
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
  }

  return databaseUrl;
}
