import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {memoryPostgres} from './postgres-helper.js';
import {postgresSQL} from '../api/database.js';
import {createApp} from '../api/server.js';
import {importSQLite} from '../scripts/import-sqlite.mjs';
const config={production:false,webURL:'http://localhost:3000',dbPath:':memory:',secret:'testing-only-'.repeat(8),adminDiscordId:'987654321098765432',adminName:'Admin'};

test('Postgres conserva parámetros y literales separados',()=>{
  assert.equal(postgresSQL("SELECT '?' AS literal,? AS value"),"SELECT '?' AS literal,$1 AS value");
  assert.match(postgresSQL('SELECT discord_id discordId FROM staff WHERE discord_id=?'),/AS "discordId".*\$1/);
});

test('Postgres revierte todas las escrituras si una transacción falla',async()=>{
  const db=await memoryPostgres();
  try{
    await db.exec('CREATE TABLE atomic_example (id TEXT PRIMARY KEY)');
    await assert.rejects(db.transaction(async()=>{
      await db.prepare('INSERT INTO atomic_example VALUES (?)').run('one');
      await db.prepare('INSERT INTO atomic_example VALUES (?)').run('one');
    }));
    assert.equal((await db.prepare('SELECT count(*) n FROM atomic_example').get()).n,0);
  }finally{await db.close();}
});

test('Postgres conserva cuentas tras reabrir la base y el worker vacío no impide el reposo',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'uie-pg-'));
  let db,app;
  try{
    db=await memoryPostgres(directory);app=await createApp({...config,database:db});
    await db.prepare('INSERT INTO users (id,discord_id,email,name,code,created) VALUES (?,?,?,?,?,?)').run('user-one','123456789012345678','private@example.com','Example','unique-code',Date.now());
    await app.work({force:false});const queries=db.queryCount();
    await app.work({force:false});assert.equal(db.queryCount(),queries);
    await app.close();db=null;
    db=await memoryPostgres(directory);app=await createApp({...config,database:db});
    assert.equal((await db.prepare('SELECT name FROM users WHERE id=?').get('user-one')).name,'Example');
  }finally{if(db)await app.close();rmSync(directory,{recursive:true,force:true});}
});

test('Importa el respaldo SQLite íntegro y rechaza un destino ocupado sin alterar registros',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'uie-import-')),path=join(directory,'source.sqlite');
  const source=await createApp({...config,dbPath:path});
  source.db.prepare('INSERT INTO users (id,discord_id,email,name,code,created) VALUES (?,?,?,?,?,?)').run('u','123456789012345678','private@example.com','Example','unique-code',Date.now());
  source.db.prepare('INSERT INTO user_private_emails VALUES (?,?)').run('u','private@example.com');
  source.db.prepare('INSERT INTO audit (id,staff_id,action,target,created) VALUES (?,?,?,?,?)').run(50,'legacy-admin','sample','u',Date.now());
  await source.close();
  const db=await memoryPostgres();
  try{
    const result=await importSQLite(path,db);assert.equal(result.users,1);assert.equal(result.staff,1);assert.equal(result.audit,1);
    assert.equal((await db.prepare('SELECT email FROM user_private_emails WHERE user_id=?').get('u')).email,'private@example.com');
    await db.prepare('INSERT INTO audit (staff_id,action,target,created) VALUES (?,?,?,?)').run('a','next','u',Date.now());
    assert.equal((await db.prepare('SELECT MAX(id) n FROM audit').get()).n,51);
    await assert.rejects(importSQLite(path,db),/destino contiene datos/);
    assert.equal((await db.prepare('SELECT count(*) n FROM users').get()).n,1);
  }finally{await db.close();rmSync(directory,{recursive:true,force:true});}
});

test('Render Free pide DATABASE_URL sin sugerir un disco de pago',async()=>{
  await assert.rejects(createApp({...config,production:true,databaseMode:'postgres',databaseURL:'',webURL:'https://uie-staff-forms-main.netlify.app'}),error=>{
    assert.ok(error.message.includes('DATABASE_URL'));assert.ok(!error.message.includes('Monta un disco'));return true;
  });
});
