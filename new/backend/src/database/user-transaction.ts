import { sql, SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { VerifiedIdentity } from '../auth/auth.types';
import { timedQuery } from '../common/request-context';

export interface SessionConnection {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}
export interface UserTransaction {
  query<Row extends Record<string, unknown>>(statement: SQL): Promise<Row[]>;
}
const dialect = new PgDialect();

// The caller must already have verified identity. Never accept identity/claims
// from request bodies. SET LOCAL and COMMIT/ROLLBACK reset pooled session state.
export async function withUserTransaction<T>(
  client: SessionConnection,
  identity: VerifiedIdentity,
  operation: (transaction: UserTransaction) => Promise<T>,
): Promise<T> {
  const execute = async <Row extends Record<string, unknown>>(
    statement: SQL,
  ): Promise<Row[]> => {
    const query = dialect.sqlToQuery(statement);
    const result = await timedQuery(() =>
      client.query(query.sql, query.params),
    );
    return result.rows as Row[];
  };
  await execute(sql`begin`);
  try {
    await execute(sql`set local role authenticated`);
    await execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: identity.userId, role: 'authenticated', aud: 'authenticated', email: identity.email, phone: identity.phone, session_id: identity.sessionId })}, true), set_config('request.jwt.claim.sub', ${identity.userId}, true)`,
    );
    const result = await operation({ query: execute });
    await execute(sql`commit`);
    return result;
  } catch (error) {
    try {
      await execute(sql`rollback`);
    } catch {
      /* DatabaseService discards failed connections. */
    }
    throw error;
  }
}
