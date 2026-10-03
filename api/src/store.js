import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export class Store {
  constructor(path=':memory:') {
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,owner TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS record_owner ON records(kind,owner);
      CREATE TABLE IF NOT EXISTS commands(owner TEXT NOT NULL,key TEXT NOT NULL,body_hash TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(owner,key));`);
  }
  get(kind,id) {const r=this.db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind,id);return r?JSON.parse(r.data):null;}
  put(kind,data,owner=data.owner) {this.db.prepare('INSERT INTO records VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data').run(kind,data.id,owner,JSON.stringify(data));return data;}
  list(kind,owner) {return (owner?this.db.prepare('SELECT data FROM records WHERE kind=? AND owner=?').all(kind,owner):this.db.prepare('SELECT data FROM records WHERE kind=?').all(kind)).map(r=>JSON.parse(r.data));}
  remove(kind,id){this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind,id);}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  close(){this.db.close();}
}
