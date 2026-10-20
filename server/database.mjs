import { neon } from '@neondatabase/serverless';

const normalize = (value) => value instanceof Date ? value.toISOString() : value;
export function postgresAdapter(query) {
  function prepare(statement, values = []) {
    // Only application-owned SQL reaches this adapter. Values are always bound separately.
    let position = 0;
    const sql = statement.replace(/\?/g, () => `$${++position}`);
    async function execute() {
      const result = await query(sql, values);
      const rows = Array.isArray(result) ? result : result.rows;
      return (rows || []).map((row) => Object.fromEntries(Object.entries(row).map(([key,value]) => [key,normalize(value)])));
    }
    return {
      bind(...params) { return prepare(statement, params); },
      async first() { return (await execute())[0] || null; },
      async all() { return { results:await execute() }; },
      async run() { await execute(); return { success:true }; },
    };
  }
  return { prepare };
}

export function databaseFor(env) {
  if (env.DB?.prepare) return env.DB; // In-process Postgres adapter for tests/local preview.
  if (!env.DATABASE_URL) return null;
  const sql = neon(env.DATABASE_URL);
  return postgresAdapter((statement,values) => sql.query(statement,values,{fetchOptions:{signal:AbortSignal.timeout(15000)}}));
}
