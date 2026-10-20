import { DatabaseSync } from 'node:sqlite';
// Test/local adapter for the small D1 API surface used by the app; production uses native D1.
export function localD1(filename=':memory:') {
  const db=new DatabaseSync(filename);db.exec('PRAGMA foreign_keys = ON;');
  function prepare(sql,args=[]){
    return {bind(...params){return prepare(sql,params);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args),success:true};},async run(){const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}};
  }
  return {prepare,async exec(sql){db.exec(sql);},close(){db.close();}};
}
