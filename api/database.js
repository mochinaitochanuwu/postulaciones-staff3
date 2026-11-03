import {DatabaseSync} from 'node:sqlite';
import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

export function createMutex() {
  let tail=Promise.resolve();
  return async function locked(fn) {
    const previous=tail;let release;
    tail=new Promise(r=>{release=r;});
    await previous;
    try{return await fn();}finally{release();}
  };
}

function sqliteStore(path) {
  if(path!==':memory:')mkdirSync(dirname(resolve(path)),{recursive:true});
  const raw=new DatabaseSync(path),context=new AsyncLocalStorage(),locked=createMutex();
  const access=fn=>context.getStore()?fn():locked(()=>context.run(true,fn));
  return {
    dialect:'sqlite',raw,
    exec:sql=>access(()=>raw.exec(sql)),
    prepare:sql=>Object.fromEntries(['get','all','run'].map(method=>[method,(...args)=>access(()=>raw.prepare(sql)[method](...args))])),
    transaction:fn=>access(async()=>{
      raw.exec('BEGIN IMMEDIATE');
      try{const result=await fn();raw.exec('COMMIT');return result;}
      catch(error){raw.exec('ROLLBACK');throw error;}
    }),
    close:()=>raw.close()
  };
}

export function postgresSQL(input) {
  let sql=input.trim();
  if(/^PRAGMA\b/i.test(sql))return null;
  sql=sql.replace(/\baudit\s*\(id INTEGER PRIMARY KEY/i,'audit (id BIGSERIAL PRIMARY KEY');
  sql=sql.replace(/\bINTEGER\b/g,'BIGINT').replace(/\bBLOB\b/g,'BYTEA');
  if(/^CREATE TABLE IF NOT EXISTS outbox\b/i.test(sql))sql=sql.replace(/\)\s*$/,' ,_order BIGSERIAL)');
  sql=sql.replace(/\bADD COLUMN (?!IF NOT EXISTS)/g,'ADD COLUMN IF NOT EXISTS ');
  sql=sql.replace(/\bdiscord_id discordId\b/g,'discord_id AS "discordId"');
  sql=sql.replace(/\browid\b/g,'_order');
  if(/^INSERT INTO outbox VALUES\b/i.test(sql))sql=sql.replace(/outbox VALUES/i,'outbox (id,app_id,kind,event,stage,reason,attempts,next_try,delivered,last_error) VALUES');
  if(/^INSERT OR IGNORE\b/i.test(sql))sql=sql.replace(/^INSERT OR IGNORE/i,'INSERT')+' ON CONFLICT DO NOTHING';
  if(/^INSERT OR REPLACE INTO rates\b/i.test(sql))sql=sql.replace(/^INSERT OR REPLACE/i,'INSERT')+' ON CONFLICT (key) DO UPDATE SET count=excluded.count,expires=excluded.expires';
  // Placeholders inside quoted SQL literals and identifiers are not parameters.
  let output='',quote=null,index=0;
  for(let i=0;i<sql.length;i++){
    const char=sql[i];
    if(quote){output+=char;if(char===quote){if(sql[i+1]===quote){output+=sql[++i];}else quote=null;}}
    else if(char==="'"||char==='"'){quote=char;output+=char;}
    else output+=char==='?'?`$${++index}`:char;
  }
  return output;
}

function normalize(result) {
  const numeric=new Set((result.fields||[]).filter(f=>f.dataTypeID===20).map(f=>f.name));
  return (result.rows||[]).map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>{
    if(numeric.has(key)&&value!==null){value=Number(value);if(!Number.isSafeInteger(value))throw new Error('Valor numérico fuera del rango permitido.');}
    if(value instanceof Uint8Array&&!Buffer.isBuffer(value))value=Buffer.from(value);
    return [key,value];
  })));
}

export function createPostgresStore(pool) {
  const context=new AsyncLocalStorage();
  const query=(sql,args=[])=>{
    const table=sql.match(/^PRAGMA table_info\((\w+)\)$/i)?.[1];
    if(table)return (context.getStore()||pool).query('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position',[table]);
    const translated=postgresSQL(sql);
    if(!translated)return Promise.resolve({rows:[],rowCount:0});
    return (context.getStore()||pool).query(translated,args.map(v=>v instanceof Uint8Array?Buffer.from(v):v));
  };
  return {
    dialect:'postgres',
    exec:async sql=>{for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await query(statement);},
    prepare:sql=>({
      get:async(...args)=>normalize(await query(sql,args))[0],
      all:async(...args)=>normalize(await query(sql,args)),
      run:async(...args)=>({changes:(await query(sql,args)).rowCount||0})
    }),
    transaction:async fn=>{
      if(context.getStore())return fn();
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const result=await context.run(client,fn);
        await client.query('COMMIT');return result;
      }catch(error){await client.query('ROLLBACK');throw error;}
      finally{client.release();}
    },
    close:()=>pool.end()
  };
}

export async function openDatabase(config) {
  if(!config.databaseURL)return sqliteStore(config.dbPath);
  let url;try{url=new URL(config.databaseURL);}catch{throw new Error('DATABASE_URL debe ser una conexión Postgres válida.');}
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('DATABASE_URL debe usar postgres:// o postgresql://.');
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(config.production&&local)throw new Error('DATABASE_URL debe apuntar a una base externa persistente.');
  // Explicit verification prevents a weaker sslmode in a copied connection URL.
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
  const {Pool}=await import('pg');
  const pool=new Pool({connectionString:url.toString(),ssl:local&&!config.production?false:{rejectUnauthorized:true},max:3,connectionTimeoutMillis:15000,idleTimeoutMillis:10000,allowExitOnIdle:true});
  pool.on('error',()=>console.error('Se interrumpió una conexión a la base de datos.'));
  return createPostgresStore(pool);
}
