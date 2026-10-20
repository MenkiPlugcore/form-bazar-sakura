import { PGlite } from '@electric-sql/pglite';
import { postgresAdapter } from '../server/database.mjs';
export async function localPostgres(directory) {
  const pg=new PGlite(directory);
  await pg.waitReady;
  return {...postgresAdapter((statement,values)=>pg.query(statement,values)),async exec(sql){await pg.exec(sql);},async close(){await pg.close();}};
}
