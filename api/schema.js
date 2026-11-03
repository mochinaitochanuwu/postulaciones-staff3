// Shared baseline; the database adapter selects SQLite or PostgreSQL syntax.
export async function initializeSchema(db) {
  await db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,staff_id TEXT REFERENCES staff(id),expires INTEGER);
    CREATE TABLE IF NOT EXISTS invites (token_hash TEXT PRIMARY KEY,email TEXT,name TEXT,expires INTEGER,used INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY,request_id TEXT UNIQUE,email TEXT NOT NULL,name TEXT NOT NULL,stage INTEGER NOT NULL,state TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created INTEGER,expires INTEGER);
    CREATE UNIQUE INDEX IF NOT EXISTS active_email ON applications(email) WHERE state NOT IN ('rejected','accepted','expired');
    CREATE TABLE IF NOT EXISTS submissions (app_id TEXT REFERENCES applications(id),stage INTEGER,answers TEXT,submitted INTEGER,PRIMARY KEY(app_id,stage));
    CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY,app_id TEXT REFERENCES applications(id),stage INTEGER,decision TEXT,reason TEXT,staff_id TEXT REFERENCES staff(id),created INTEGER);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY,staff_id TEXT,action TEXT,target TEXT,created INTEGER);
    CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY,app_id TEXT,kind TEXT,event TEXT,stage INTEGER,reason TEXT,attempts INTEGER DEFAULT 0,next_try INTEGER,delivered INTEGER,last_error TEXT);
    CREATE TABLE IF NOT EXISTS rates (key TEXT PRIMARY KEY,count INTEGER,expires INTEGER);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,discord_id TEXT UNIQUE NOT NULL,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,code TEXT UNIQUE NOT NULL,avatar BLOB,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS user_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER);
    CREATE TABLE IF NOT EXISTS user_private_emails (user_id TEXT REFERENCES users(id),email TEXT,PRIMARY KEY(user_id,email));
    CREATE TABLE IF NOT EXISTS oauth_states (state_hash TEXT PRIMARY KEY,expires INTEGER);`);
  const columns=[['applications','user_id','TEXT REFERENCES users(id)'],['staff','discord_id','TEXT']];
  for(const [table,column,type] of columns){
    const existing=await db.prepare(`PRAGMA table_info(${table})`).all();
    if(!existing.some(item=>item.name===column))await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS application_owner ON applications(user_id) WHERE user_id IS NOT NULL');
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS staff_discord ON staff(discord_id) WHERE discord_id IS NOT NULL');
}
