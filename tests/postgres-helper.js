import {PGlite} from '@electric-sql/pglite';
import {createPostgresStore} from '../api/database.js';

// A real PostgreSQL engine in WASM, with an exclusive connection for transactions.
// It does not contact Neon or use any real credentials.
export async function memoryPostgres(dataDir) {
  const engine=await PGlite.create(dataDir||'memory://');
  let tail=Promise.resolve(),queries=0;
  const acquire=async()=>{
    let release;const previous=tail;
    tail=new Promise(resolve=>{release=resolve;});
    await previous;return release;
  };
  const direct=async(sql,args=[])=>{queries++;return engine.query(sql,args);};
  const pool={
    query:async(sql,args)=>{const release=await acquire();try{return await direct(sql,args);}finally{release();}},
    connect:async()=>{const release=await acquire();return {query:direct,release};},
    end:async()=>{const release=await acquire();try{await engine.close();}finally{release();}}
  };
  const store=createPostgresStore(pool);
  return Object.assign(store,{queryCount:()=>queries});
}
