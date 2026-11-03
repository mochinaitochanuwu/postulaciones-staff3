import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../api/database.js';
import {initializeSchema} from '../api/schema.js';

const tables=['staff','users','sessions','invites','applications','submissions','decisions','audit','outbox','rates','user_sessions','user_private_emails','oauth_states'];
const identifier=value=>'"'+value.replaceAll('"','""')+'"';

export async function importSQLite(path,db) {
  if(db.dialect!=='postgres')throw new Error('El destino debe ser Postgres.');
  const source=new DatabaseSync(path,{readOnly:true});
  try{
    const integrity=source.prepare('PRAGMA integrity_check').get();
    if(Object.values(integrity)[0]!=='ok')throw new Error('El respaldo SQLite no supera la comprobación de integridad.');
    return await db.transaction(async()=>{
      await initializeSchema(db);
      for(const table of tables){
        const row=await db.prepare(`SELECT count(*) n FROM ${identifier(table)}`).get();
        if(row.n!==0)throw new Error('El destino contiene datos. La importación requiere una base vacía y no combina ni reemplaza registros.');
      }
      const counts={};
      for(const table of tables){
        const from=source.prepare(`PRAGMA table_info(${identifier(table)})`).all().map(row=>row.name);
        if(!from.length){counts[table]=0;continue;}
        const to=new Set((await db.prepare(`PRAGMA table_info(${table})`).all()).map(row=>row.name));
        const columns=from.filter(name=>to.has(name));
        const rows=source.prepare(`SELECT ${columns.map(identifier).join(',')} FROM ${identifier(table)} ORDER BY rowid`).all();
        for(const row of rows)await db.prepare(`INSERT INTO ${identifier(table)} (${columns.map(identifier).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(name=>row[name]));
        counts[table]=rows.length;
      }
      await db.exec("SELECT setval(pg_get_serial_sequence('audit','id'),COALESCE((SELECT MAX(id) FROM audit),0)+1,false)");
      return counts;
    });
  }finally{source.close();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv.includes('--confirm-empty-target')||!process.argv[2]||!process.env.DATABASE_URL){
    console.error('Uso: DATABASE_URL configurada en el entorno; node scripts/import-sqlite.mjs RUTA_SQLITE --confirm-empty-target');
    process.exitCode=1;
  }else{
    const db=await openDatabase({databaseURL:process.env.DATABASE_URL,production:true});
    try{console.log(JSON.stringify({imported:await importSQLite(process.argv[2],db)}));}
    catch(error){console.error(error.message==='El destino contiene datos. La importación requiere una base vacía y no combina ni reemplaza registros.'?error.message:'No se pudo importar el respaldo. La operación fue cancelada.');process.exitCode=1;}
    finally{await db.close();}
  }
}
