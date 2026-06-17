import { Pool, type QueryResultRow } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  pool ??= new Pool({ connectionString: requireDatabaseUrl() });

  return pool;
}

export async function query<TRow extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<TRow[]> {
  const result = await getPool().query<TRow>(text, params as unknown[]);

  return result.rows;
}

export async function withTransaction<TResult>(
  run: (executeQuery: typeof query) => Promise<TResult>,
): Promise<TResult> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const scopedQuery = async <TRow extends QueryResultRow = QueryResultRow>(
      text: string,
      params: readonly unknown[] = [],
    ): Promise<TRow[]> => {
      const result = await client.query<TRow>(text, params as unknown[]);

      return result.rows;
    };

    const result = await run(scopedQuery);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
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
