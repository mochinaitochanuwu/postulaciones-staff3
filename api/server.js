import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stages, validateAnswers } from '../web/questions.js';
import {sanitizeAvatar} from './avatar.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = text => createHash('sha256').update(text).digest('hex');
const emailOK = s => typeof s==='string' && s.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const normalizeEmail = s => typeof s==='string' ? s.trim().toLowerCase() : '';
const fail = (status, message, fields) => { throw Object.assign(new Error(message), {status,fields}); };
const clean = value => typeof value==='string' ? value.trim() : '';
// El destinatario nunca sale hacia los revisores ni hacia Discord.
// También se oculta si se repite en el alias o en una respuesta.
function redactRecipient(value, email) {
  if(typeof value==='string') {
    const lower=value.toLowerCase(), needle=email.toLowerCase();
    let output='',from=0,index;
    while((index=lower.indexOf(needle,from))!==-1) {
      output+=value.slice(from,index)+'[correo privado]';
      from=index+email.length;
    }
    return output+value.slice(from);
  }
  if(Array.isArray(value)) return value.map(item=>redactRecipient(item,email));
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[redactRecipient(key,email),redactRecipient(item,email)]));
  return value;
}
export function envConfig() {
  return {production:process.env.NODE_ENV==='production',port:Number(process.env.PORT||3000),
    webURL:process.env.PUBLIC_WEB_URL||'http://localhost:3000',dbPath:process.env.DB_PATH||'./data/staff.sqlite',
    secret:process.env.APP_SECRET||'',adminDiscordId:process.env.ADMIN_DISCORD_ID||'',adminName:process.env.ADMIN_NAME||'Administradora',
    botToken:process.env.DISCORD_BOT_TOKEN||'',
    webhook:process.env.DISCORD_WEBHOOK_URL||'',trustProxy:process.env.TRUST_PROXY==='true',volumeMount:process.env.RAILWAY_VOLUME_MOUNT_PATH||'',
    discordClientId:process.env.DISCORD_CLIENT_ID||'',discordClientSecret:process.env.DISCORD_CLIENT_SECRET||'',discordRedirect:process.env.DISCORD_REDIRECT_URI||''};
}
export async function createApp(config, fetcher=fetch) {
  const c={...config};
  const privateHost=url=>url.hostname==='railway.internal'||url.hostname.endsWith('.railway.internal');
  const localHost=url=>['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  let webURL,callback;
  try{webURL=new URL(c.webURL);}catch{throw new Error('PUBLIC_WEB_URL debe incluir http:// o https:// y el dominio de la web.');}
  if(!['http:','https:'].includes(webURL.protocol)||webURL.username||webURL.password||webURL.search||webURL.hash) throw new Error('PUBLIC_WEB_URL debe ser la dirección HTTP o HTTPS de la web, sin credenciales, parámetros ni fragmentos.');
  if(privateHost(webURL)) throw new Error('PUBLIC_WEB_URL necesita un dominio público; .railway.internal no es accesible desde el navegador.');
  if(c.discordRedirect) {
    try{callback=new URL(c.discordRedirect);}catch{throw new Error('DISCORD_REDIRECT_URI debe incluir http:// o https:// y terminar en /api/auth/discord/callback.');}
    if(privateHost(callback)) throw new Error('DISCORD_REDIRECT_URI necesita el dominio público de la API, no .railway.internal.');
    if(!['http:','https:'].includes(callback.protocol)||callback.pathname!=='/api/auth/discord/callback'||callback.search||callback.hash||callback.username||callback.password) throw new Error('DISCORD_REDIRECT_URI debe ser la URL de la API seguida de /api/auth/discord/callback, sin parámetros ni fragmentos.');
    if(callback.protocol==='http:'&&!localHost(callback)) throw new Error('DISCORD_REDIRECT_URI debe usar HTTPS; HTTP solo se permite para localhost.');
  }
  if(c.production) {
    const errors=[];
    if(webURL.protocol!=='https:') errors.push('PUBLIC_WEB_URL debe usar HTTPS.');
    if(localHost(webURL)) errors.push('PUBLIC_WEB_URL debe usar el dominio público de Netlify en producción.');
    if(!c.secret || c.secret.length<48 || c.secret.includes('REEMPLAZAR')) errors.push('Configura APP_SECRET aleatorio de al menos 48 caracteres.');
    if(!c.botToken) errors.push('Configura DISCORD_BOT_TOKEN con el token del bot.');
    if(!c.webhook) errors.push('Configura DISCORD_WEBHOOK_URL.');
    if(!c.dbPath.startsWith('/data/')) errors.push('Producción requiere DB_PATH=/data/staff.sqlite y un volumen en /data.');
    if(c.volumeMount!=='/data') errors.push('Monta un volumen de Railway en /data antes de iniciar la API.');
    if(!c.discordClientId || !c.discordClientSecret || !c.discordRedirect) errors.push('Configura DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET y DISCORD_REDIRECT_URI.');
    if(callback && (callback.protocol!=='https:'||localHost(callback))) errors.push('DISCORD_REDIRECT_URI debe ser la URL HTTPS pública de la API seguida de /api/auth/discord/callback.');
    if(!/^[0-9]{17,20}$/.test(c.adminDiscordId||'')) errors.push('Configura ADMIN_DISCORD_ID con el ID de tu cuenta personal de Discord.');
    if(errors.length) throw new Error(errors.join('\n'));
  }
  if(c.webhook && !/^https:\/\/(?:discord\.com|discordapp\.com)\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(c.webhook)) throw new Error('DISCORD_WEBHOOK_URL debe ser un webhook HTTPS de Discord sin parámetros.');
  if(!c.secret) c.secret=randomBytes(32).toString('hex');
  if(c.dbPath!==':memory:') mkdirSync(dirname(resolve(c.dbPath)),{recursive:true});
  const db=new DatabaseSync(c.dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
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
  if(!db.prepare('PRAGMA table_info(applications)').all().some(column=>column.name==='user_id')) db.exec('ALTER TABLE applications ADD COLUMN user_id TEXT REFERENCES users(id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS application_owner ON applications(user_id) WHERE user_id IS NOT NULL');
  // Los correos pendientes pasan a MD; el historial ya entregado se conserva.
  db.prepare("UPDATE outbox SET kind='dm',attempts=0,next_try=?,last_error=NULL WHERE kind='email' AND delivered IS NULL").run(Date.now());
  if(!/^[0-9]{17,20}$/.test(c.adminDiscordId||'')) {db.close();throw new Error('Configura ADMIN_DISCORD_ID con el ID de tu cuenta personal de Discord.');}
  if(!db.prepare('PRAGMA table_info(staff)').all().some(column=>column.name==='discord_id')) db.exec('ALTER TABLE staff ADD COLUMN discord_id TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS staff_discord ON staff(discord_id) WHERE discord_id IS NOT NULL');
  const existingAdmin=db.prepare("SELECT id,discord_id FROM staff WHERE role='admin'").get();
  if(existingAdmin) {
    if(existingAdmin.discord_id && existingAdmin.discord_id!==c.adminDiscordId) {db.close();throw new Error('ADMIN_DISCORD_ID no coincide con la administradora registrada.');}
    if(!existingAdmin.discord_id) db.prepare('UPDATE staff SET discord_id=? WHERE id=?').run(c.adminDiscordId,existingAdmin.id);
  }else db.prepare('INSERT INTO staff (id,email,name,password,role,discord_id) VALUES (?,?,?,?,?,?)').run(randomUUID(),`staff-${c.adminDiscordId}@internal.invalid`,c.adminName,'discord-only','admin',c.adminDiscordId);
  const tokenFor = app => createHmac('sha256',c.secret).update(`app:${app.id}:${app.created}`).digest('hex');
  const linkFor = app => `${c.webURL.replace(/\/$/,'')}/#postulacion=${app.id}${app.user_id?'':'.'+tokenFor(app)}`;
  function transaction(fn) {db.exec('BEGIN IMMEDIATE');try { const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
  function audit(staff,action,target) {db.prepare('INSERT INTO audit (staff_id,action,target,created) VALUES (?,?,?,?)').run(staff.id,action,target,Date.now());}
  function enqueue(app,event,stage,reason='') {
    for(const kind of ['dm','webhook']) db.prepare('INSERT INTO outbox (id,app_id,kind,event,stage,reason,next_try) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),app.id,kind,event,stage,reason,Date.now());
  }
  function limit(key,max,window) {
    const time=Date.now(), row=db.prepare('SELECT * FROM rates WHERE key=?').get(key);
    if(!row || row.expires<=time) db.prepare('INSERT OR REPLACE INTO rates VALUES (?,?,?)').run(key,1,time+window);
    else { if(row.count>=max) fail(429,'Demasiados intentos. Espera un poco antes de volver a intentarlo.'); db.prepare('UPDATE rates SET count=count+1 WHERE key=?').run(key); }
  }
  function staffFor(discordId) {return db.prepare('SELECT id,name,role,discord_id discordId FROM staff WHERE discord_id=? AND active=1').get(discordId)||null;}
  function staffAuth(req) {
    const user=userAuth(req),staff=staffFor(user.discord_id);
    if(!staff) fail(403,'Tu cuenta de Discord no está autorizada para acceder al panel.');
    return staff;
  }
  function adminAuth(req) { const staff=staffAuth(req);if(staff.role!=='admin') fail(403,'Esta acción corresponde a la administradora.');return staff; }
  function userAuth(req) {
    const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if(!token) fail(401,'Entra con Discord para acceder a tu postulación.');
    const user=db.prepare('SELECT u.* FROM user_sessions se JOIN users u ON u.id=se.user_id WHERE se.token_hash=? AND se.expires>?').get(hash(token),Date.now());
    if(!user) fail(401,'Tu sesión venció. Vuelve a entrar con Discord.');
    return user;
  }
  function applicant(req) {
    const user=userAuth(req),app=db.prepare('SELECT * FROM applications WHERE user_id=?').get(user.id);
    if(!app) fail(404,'Todavía no has enviado tu primera etapa.');
    return app;
  }
  function avatarFor(user){return user?.avatar?`data:image/png;base64,${Buffer.from(user.avatar).toString('base64')}`:null;}
  function userProfile(user){const app=db.prepare('SELECT id,stage,state FROM applications WHERE user_id=?').get(user.id);return {id:user.id,discordId:user.discord_id,name:user.name,email:user.email,code:user.code,avatar:avatarFor(user),application:app||null,staff:staffFor(user.discord_id)};}
  function staffView(value,app){
    const addresses=[app.email,...(app.user_id?db.prepare('SELECT email FROM user_private_emails WHERE user_id=?').all(app.user_id).map(row=>row.email):[])];
    return addresses.reduce((result,email)=>redactRecipient(result,email),value);
  }
  function details(app,internal=false) {
    const submissions=db.prepare('SELECT stage,answers,submitted FROM submissions WHERE app_id=? ORDER BY stage').all(app.id).map(s=>({...s,answers:JSON.parse(s.answers)}));
    const decisions=db.prepare('SELECT d.stage,d.decision,d.reason,d.created,s.name reviewer FROM decisions d JOIN staff s ON d.staff_id=s.id WHERE app_id=? ORDER BY created').all(app.id);
    const user=app.user_id?db.prepare('SELECT avatar FROM users WHERE id=?').get(app.user_id):null;
    const notifications=internal?db.prepare('SELECT id,kind,event,stage,attempts,delivered,last_error FROM outbox WHERE app_id=? ORDER BY rowid').all(app.id):db.prepare("SELECT kind,event,stage,attempts,delivered,last_error FROM outbox WHERE app_id=? AND kind='dm' ORDER BY rowid").all(app.id);
    const detail={id:app.id,name:app.name,avatar:avatarFor(user),...(!internal?{email:app.email}:{}),stage:app.stage,state:app.state,version:app.version,created:app.created,submissions,decisions:internal?decisions:decisions.map(({reviewer,...d})=>d),notifications};
    return internal?staffView(detail,app):detail;
  }
  async function body(req,maxBytes=350000) {
    if(!req.headers['content-type']?.startsWith('application/json')) fail(415,'Envía JSON.');
    let bytes=0;const chunks=[];
    for await(const chunk of req) { bytes+=chunk.length;if(bytes>maxBytes) fail(413,'La solicitud es demasiado grande.');chunks.push(chunk); }
    let result;try {result=JSON.parse(Buffer.concat(chunks).toString());}catch {fail(400,'JSON inválido.');}
    if(!result || typeof result!=='object' || Array.isArray(result)) fail(400,'Solicitud inválida.');
    return result;
  }
  const reply=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  const redirect=(res,url)=>{res.writeHead(302,{Location:url});res.end();};
  const stateCookie=(res,state)=>res.setHeader('Set-Cookie',`staff_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/api/auth/discord; Max-Age=${state?600:0}${c.production?'; Secure':''}`);
  async function handler(req,res) {
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    const origin=req.headers.origin;
    if(origin && origin!==webURL.origin) return reply(res,403,{error:'Origen no permitido.'});
    if(origin) {res.setHeader('Access-Control-Allow-Origin',webURL.origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS') {res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');res.writeHead(204);return res.end();}
    try {
      const url=new URL(req.url,'http://localhost'), path=url.pathname;
      const ip=c.trustProxy?clean(req.headers['x-forwarded-for']?.split(',').at(-1))||req.socket.remoteAddress:req.socket.remoteAddress;
      const ipKey=hash(String(ip));
      if(path.startsWith('/api/')) limit(`all:${ipKey}`,600,60000);
      if(req.method==='GET' && path==='/health') return reply(res,200,{ok:true});
      if(req.method==='GET' && path==='/api/info') return reply(res,200,{local:!c.production,dmConfigured:!!c.botToken,webhookConfigured:!!c.webhook,discordConfigured:!!(c.discordClientId&&c.discordClientSecret&&c.discordRedirect)});
      if(req.method==='GET' && path==='/api/auth/discord/start') {
        limit(`oauth:${ipKey}`,20,600000);
        if(!c.discordClientId || !c.discordClientSecret || !c.discordRedirect) fail(503,'El acceso con Discord todavía no está configurado.');
        const state=randomBytes(32).toString('hex');
        db.prepare('INSERT INTO oauth_states VALUES (?,?)').run(hash(state),Date.now()+600000);
        stateCookie(res,state);
        const authorize=new URL('https://discord.com/oauth2/authorize');
        authorize.search=new URLSearchParams({client_id:c.discordClientId,redirect_uri:c.discordRedirect,response_type:'code',scope:'identify email',state,prompt:'consent'}).toString();
        return redirect(res,authorize.toString());
      }
      if(req.method==='GET' && path==='/api/auth/discord/callback') {
        try {
          const state=url.searchParams.get('state')||'',cookie=req.headers.cookie?.match(/(?:^|;\s*)staff_oauth_state=([a-f0-9]{64})(?:;|$)/)?.[1];
          if(!/^[a-f0-9]{64}$/.test(state) || !cookie || !timingSafeEqual(Buffer.from(state),Buffer.from(cookie))) fail(401,'La solicitud de acceso no corresponde a este navegador. Vuelve a entrar con Discord.');
          const entry=db.prepare('SELECT * FROM oauth_states WHERE state_hash=? AND expires>?').get(hash(state),Date.now());
          if(!entry) fail(401,'La solicitud de acceso venció o ya se utilizó.');
          db.prepare('DELETE FROM oauth_states WHERE state_hash=?').run(hash(state));
          stateCookie(res,'');
          if(url.searchParams.has('error')) fail(401,'Cancelaste el acceso con Discord. Puedes volver a intentarlo.');
          const code=url.searchParams.get('code');if(!code || code.length>2048) fail(400,'Discord no devolvió una autorización válida.');
          const response=await fetcher('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.discordClientId,client_secret:c.discordClientSecret,grant_type:'authorization_code',code,redirect_uri:c.discordRedirect}),signal:AbortSignal.timeout(15000)});
          if(!response.ok) fail(502,'No se pudo validar el acceso con Discord. Inténtalo otra vez.');
          const credentials=await response.json();if(typeof credentials.access_token!=='string') fail(502,'Discord no devolvió una sesión válida.');
          const identityResponse=await fetcher('https://discord.com/api/v10/users/@me',{headers:{Authorization:`Bearer ${credentials.access_token}`},signal:AbortSignal.timeout(15000)});
          if(!identityResponse.ok) fail(502,'No se pudo consultar tu cuenta de Discord.');
          const identity=await identityResponse.json(),email=normalizeEmail(identity.email);
          if(!/^[0-9]{17,20}$/.test(identity.id||'') || !emailOK(email) || identity.verified!==true || identity.bot===true) fail(403,'Debes usar una cuenta de Discord con correo verificado. Confirma tu correo en Discord y vuelve a entrar.');
          const old=db.prepare('SELECT * FROM users WHERE discord_id=?').get(identity.id),emailOwner=db.prepare('SELECT id FROM users WHERE email=?').get(email);
          if(emailOwner && emailOwner.id!==old?.id) fail(409,'Ese correo verificado ya está vinculado a otra cuenta de postulante.');
          const token=randomBytes(32).toString('hex');
          transaction(()=>{
            const id=old?.id||randomUUID();
            if(old) {
              if(old.email!==email && db.prepare("SELECT id FROM applications WHERE email=? AND (user_id IS NULL OR user_id<>?) AND state NOT IN ('accepted','rejected','expired')").get(email,id)) fail(409,'Ese correo tiene otra postulación pendiente. Contacta al Staff.');
              db.prepare('UPDATE users SET email=? WHERE id=?').run(email,id);
              db.prepare('UPDATE applications SET email=? WHERE user_id=?').run(email,id);
            }else db.prepare('INSERT INTO users (id,discord_id,email,name,code,created) VALUES (?,?,?,?,?,?)').run(id,identity.id,email,clean(identity.global_name||identity.username).slice(0,80)||'Postulante',randomBytes(16).toString('hex'),Date.now());
            if(old)db.prepare('INSERT OR IGNORE INTO user_private_emails VALUES (?,?)').run(id,old.email);
            db.prepare('INSERT OR IGNORE INTO user_private_emails VALUES (?,?)').run(id,email);
            db.prepare('INSERT INTO user_sessions VALUES (?,?,?)').run(hash(token),id,Date.now()+8*3600000);
          });
          const reviewer=staffFor(identity.id);if(reviewer)audit(reviewer,'login',reviewer.id);
          return redirect(res,`${c.webURL.replace(/\/$/,'')}/#sesion=${token}`);
        }catch(error) {
          stateCookie(res,'');
          return redirect(res,`${c.webURL.replace(/\/$/,'')}/#error=${encodeURIComponent(error.status?error.message:'No se pudo iniciar sesión. Inténtalo nuevamente.')}`);
        }
      }
      if(req.method==='GET' && path==='/api/profile') return reply(res,200,userProfile(userAuth(req)));
      if(req.method==='POST' && path==='/api/profile') {
        const user=userAuth(req),b=await body(req,450000),name=clean(b.name);
        if(name.length<2 || name.length>80) fail(400,'Escribe un alias de entre 2 y 80 caracteres.');
        let avatar=user.avatar;
        if(b.avatar===null)avatar=null;
        else if(b.avatar!==undefined) {try{avatar=sanitizeAvatar(b.avatar);}catch(error){fail(400,'No se pudo guardar esa imagen. Selecciona otro archivo PNG, JPG, WebP o GIF.');}}
        db.prepare('UPDATE users SET name=?,avatar=? WHERE id=?').run(name,avatar,user.id);
        return reply(res,200,userProfile(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)));
      }
      if(req.method==='POST' && path==='/api/auth/logout') {
        userAuth(req);db.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(hash(req.headers.authorization.slice(7)));return reply(res,200,{ok:true});
      }
      if(req.method==='POST' && path==='/api/applicant/claim') {
        const user=userAuth(req),b=await body(req),credentials=typeof b.legacyToken==='string'?b.legacyToken.match(/^([a-f0-9-]{36})\.([a-f0-9]{64})$/):null;
        if(!credentials)fail(400,'El enlace anterior no es válido.');
        const app=db.prepare('SELECT * FROM applications WHERE id=?').get(credentials[1]);
        if(!app || !timingSafeEqual(Buffer.from(tokenFor(app)),Buffer.from(credentials[2])))fail(403,'Este enlace no corresponde a tu cuenta.');
        if(app.user_id && app.user_id!==user.id)fail(403,'Esta postulación pertenece a otra cuenta.');
        const previous=db.prepare('SELECT answers FROM submissions WHERE app_id=? AND stage=1').get(app.id);
        if(app.email!==user.email || !previous || JSON.parse(previous.answers).discordId!==user.discord_id)fail(403,'Tu cuenta de Discord y correo deben coincidir con los de la postulación anterior.');
        if(db.prepare('SELECT id FROM applications WHERE user_id=? AND id<>?').get(user.id,app.id))fail(409,'Tu cuenta ya tiene una postulación vinculada.');
        db.prepare('UPDATE applications SET user_id=? WHERE id=?').run(user.id,app.id);
        db.prepare("UPDATE outbox SET attempts=0,next_try=?,last_error=NULL WHERE app_id=? AND kind='dm' AND delivered IS NULL").run(Date.now(),app.id);
        return reply(res,200,details(db.prepare('SELECT * FROM applications WHERE id=?').get(app.id)));
      }
      if(req.method==='POST' && path==='/api/applications') {
        const user=userAuth(req);
        db.prepare("UPDATE applications SET state='expired',version=version+1 WHERE expires<? AND state IN ('waiting','draft')").run(Date.now());
        limit(`apply:${ipKey}`,6,3600000);
        const b=await body(req), email=user.email, name=user.name;
        if(b.email!==undefined && normalizeEmail(b.email)!==email)fail(403,'El correo debe ser el confirmado por tu cuenta de Discord.');
        if(b.consent!==true) fail(400,'Acepta la declaración antes de continuar.');
        if(!/^[a-f0-9-]{36}$/.test(b.requestId||'')) fail(400,'Identificador de envío inválido.');
        const errors=validateAnswers(1,b.answers);if(Object.keys(errors).length) fail(400,'Hay respuestas incompletas.',errors);
        if(b.answers.discordId!==user.discord_id)fail(403,'El ID del formulario debe coincidir con tu cuenta de Discord.');
        const prior=db.prepare('SELECT * FROM applications WHERE request_id=?').get(b.requestId);
        if(prior) {if(prior.user_id!==user.id) fail(403,'Esta postulación pertenece a otra cuenta.');return reply(res,200,{id:prior.id});}
        if(db.prepare('SELECT id FROM applications WHERE user_id=?').get(user.id))fail(409,'Tu cuenta ya tiene una postulación. Consúltala desde tu perfil.');
        if(db.prepare("SELECT id FROM applications WHERE email=? AND state NOT IN ('rejected','accepted','expired')").get(email)) fail(409,'Ya existe una postulación pendiente con este correo verificado. Vincula tu postulación anterior o contacta con el Staff.');
        limit(`email:${hash(email)}`,3,86400000);
        const app={id:randomUUID(),requestId:b.requestId,email,name,stage:1,state:'waiting',created:Date.now(),expires:Date.now()+90*86400000};
        transaction(()=>{
          db.prepare('INSERT INTO applications (id,request_id,email,name,stage,state,created,expires,user_id) VALUES (?,?,?,?,?,?,?,?,?)').run(app.id,app.requestId,email,name,1,'waiting',app.created,app.expires,user.id);
          db.prepare('INSERT INTO submissions VALUES (?,?,?,?)').run(app.id,1,JSON.stringify(b.answers),Date.now());
          enqueue(app,'submitted',1);
        });
        return reply(res,201,{id:app.id});
      }
      if(path==='/api/applicant' && req.method==='GET') return reply(res,200,details(applicant(req)));
      if(path==='/api/applicant/submit' && req.method==='POST') {
        const app=applicant(req), b=await body(req);
        if(app.expires<Date.now())fail(410,'Esta postulación venció. Contacta al Staff.');
        if(app.state!=='draft' || b.stage!==app.stage) fail(409,'Esta etapa todavía no está habilitada o ya fue enviada.');
        const errors=validateAnswers(app.stage,b.answers);if(Object.keys(errors).length) fail(400,'Hay respuestas incompletas.',errors);
        transaction(()=>{
          db.prepare('INSERT INTO submissions VALUES (?,?,?,?)').run(app.id,app.stage,JSON.stringify(b.answers),Date.now());
          db.prepare("UPDATE applications SET state='waiting',version=version+1 WHERE id=?").run(app.id);
          enqueue(app,'submitted',app.stage);
        });
        return reply(res,200,details(db.prepare('SELECT * FROM applications WHERE id=?').get(app.id)));
      }
      if(['/api/staff/login','/api/staff/password','/api/staff/invites','/api/staff/invites/accept','/api/staff/logout'].includes(path)) fail(410,'Este acceso anterior fue reemplazado. Entra con Discord desde la página principal.');
      if(path==='/api/staff/applications' && req.method==='GET') {
        staffAuth(req);
        const apps=db.prepare('SELECT id,name,email,user_id,stage,state,version,created FROM applications ORDER BY created DESC LIMIT 200').all();
        return reply(res,200,{applications:apps.map(app=>{const {email,user_id,...summary}=app;return staffView(summary,app);})});
      }
      const detailMatch=path.match(/^\/api\/staff\/applications\/([a-f0-9-]{36})$/);
      if(detailMatch && req.method==='GET') {staffAuth(req);const app=db.prepare('SELECT * FROM applications WHERE id=?').get(detailMatch[1]);if(!app) fail(404,'Postulación no encontrada.');return reply(res,200,details(app,true));}
      const decisionMatch=path.match(/^\/api\/staff\/applications\/([a-f0-9-]{36})\/decision$/);
      if(decisionMatch && req.method==='POST') {
        const staff=staffAuth(req), b=await body(req), app=db.prepare('SELECT * FROM applications WHERE id=?').get(decisionMatch[1]);
        if(!app) fail(404,'Postulación no encontrada.');
        if(app.state!=='waiting' || app.version!==b.version) fail(409,'Otro Staff ya revisó esta postulación. Actualiza la página.');
        if(app.expires<Date.now()) fail(410,'Postulación vencida.');
        if(!['approve','reject'].includes(b.decision)) fail(400,'Decisión inválida.');
        const reason=clean(b.reason);if(reason.length<20 || reason.length>2000) fail(400,'Justifica la decisión con entre 20 y 2000 caracteres. Este motivo será visible para el postulante.');
        transaction(()=>{
          const state=b.decision==='reject'?'rejected':app.stage===3?'accepted':'draft';
          const stage=b.decision==='approve' && app.stage<3?app.stage+1:app.stage;
          db.prepare('UPDATE applications SET state=?,stage=?,version=version+1 WHERE id=?').run(state,stage,app.id);
          db.prepare('INSERT INTO decisions VALUES (?,?,?,?,?,?,?)').run(randomUUID(),app.id,app.stage,b.decision,reason,staff.id,Date.now());
          audit(staff,b.decision,app.id);enqueue(app,b.decision==='approve'?'approved':'rejected',app.stage,reason);
        });
        return reply(res,200,details(db.prepare('SELECT * FROM applications WHERE id=?').get(app.id),true));
      }
      if(path==='/api/staff/team' && req.method==='GET') {adminAuth(req);return reply(res,200,{team:db.prepare('SELECT id,name,discord_id discordId,role,active FROM staff').all(),audit:db.prepare('SELECT a.action,a.created,s.name reviewer FROM audit a LEFT JOIN staff s ON s.id=a.staff_id ORDER BY a.id DESC LIMIT 100').all()});}
      if(path==='/api/staff/team' && req.method==='POST') {
        const staff=adminAuth(req),b=await body(req),discordId=clean(b.discordId),name=clean(b.name);
        if(!/^[0-9]{17,20}$/.test(discordId) || name.length<2 || name.length>80) fail(400,'Escribe un nombre y un ID de usuario de Discord válido.');
        if(b.role!==undefined && b.role!=='staff') fail(400,'Solo se puede otorgar el rol Staff.');
        const existing=db.prepare('SELECT * FROM staff WHERE discord_id=?').get(discordId);
        if(existing && (existing.role==='admin' || existing.active))fail(409,'Esta cuenta ya tiene acceso.');
        let target=existing;
        if(b.memberId){
          target=db.prepare('SELECT * FROM staff WHERE id=?').get(b.memberId);
          if(!target || target.role!=='staff' || target.discord_id || existing)fail(409,'No se puede vincular esta cuenta anterior.');
        }
        transaction(()=>{
          if(target){db.prepare('UPDATE staff SET discord_id=?,name=?,active=1 WHERE id=?').run(discordId,name,target.id);audit(staff,target.discord_id?'reactivated':'linked_staff',target.id);}
          else {const id=randomUUID();db.prepare('INSERT INTO staff (id,email,name,password,role,discord_id) VALUES (?,?,?,?,?,?)').run(id,`staff-${discordId}@internal.invalid`,name,'discord-only','staff',discordId);audit(staff,'granted_staff',id);}
        });
        return reply(res,201,{ok:true});
      }
      const memberMatch=path.match(/^\/api\/staff\/team\/([a-f0-9-]{36})$/);
      if(memberMatch && req.method==='DELETE') {
        const staff=adminAuth(req), target=db.prepare('SELECT * FROM staff WHERE id=?').get(memberMatch[1]);
        if(!target || target.role==='admin') fail(400,'No se puede desactivar esta cuenta.');
        transaction(()=>{db.prepare('UPDATE staff SET active=0 WHERE id=?').run(target.id);db.prepare('DELETE FROM sessions WHERE staff_id=?').run(target.id);audit(staff,'deactivated',target.id);});return reply(res,200,{ok:true});
      }
      if(path==='/api/staff/notifications/retry' && req.method==='POST') {
        const staff=staffAuth(req), b=await body(req), job=db.prepare('SELECT * FROM outbox WHERE id=?').get(b.id);
        if(!job || job.delivered) fail(400,'Este envío no necesita reintento.');
        db.prepare('UPDATE outbox SET attempts=0,next_try=?,last_error=NULL WHERE id=?').run(Date.now(),job.id);audit(staff,'notification_retry',job.id);return reply(res,200,{ok:true});
      }
      if(!c.production && req.method==='GET') {
        const routes={'/':'index.html','/index.html':'index.html','/staff.html':'staff.html','/app.js':'app.js','/staff.js':'staff.js','/common.js':'common.js','/style.css':'style.css','/config.js':'config.js','/questions.js':'questions.js'};
        if(routes[path]) {const file=readFileSync(resolve(root,'web',routes[path]));const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css'};res.setHeader('Content-Type',`${mime[extname(routes[path])]} ; charset=utf-8`);res.setHeader('X-Frame-Options','DENY');res.writeHead(200);return res.end(file);}
      }
      fail(404,'Ruta no encontrada.');
    }catch(e){if(!e.status) console.error('Error interno en solicitud');reply(res,e.status||500,{error:e.status?e.message:'Error interno. Inténtalo de nuevo.',fields:e.fields});}
  }
  function notificationMessage(job) {
    const messages={submitted:`Recibimos tu etapa ${job.stage}. Está pendiente de revisión.`,approved:job.stage===3?'Tu postulación fue aprobada. El equipo se pondrá en contacto contigo.':`Tu etapa ${job.stage} fue aprobada. Ya puedes completar la etapa ${job.stage+1}.`,rejected:`Tu postulación fue rechazada durante la etapa ${job.stage}.`};
    return messages[job.event];
  }
  const notificationError=(message,retryAfterMs=0)=>Object.assign(new Error(message),{notificationError:true,retryAfterMs});
  let discordPauseUntil=0;
  async function botRequest(path,payload) {
    const response=await fetcher(`https://discord.com/api/v10${path}`,{method:'POST',headers:{Authorization:`Bot ${c.botToken}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    let data;try{data=await response.json();}catch{}
    if(!response.ok) {
      if(response.status===429) {
        const seconds=Number(data?.retry_after??response.headers.get('retry-after')??1);
        const delay=Number.isFinite(seconds)&&seconds>0?Math.ceil(seconds*1000)+250:1000;
        discordPauseUntil=Date.now()+delay;
        throw notificationError('MD: Discord limitó los envíos. Se reintentará más tarde.',delay);
      }
      if(response.status===401) throw notificationError('MD: token del bot inválido. Revisa DISCORD_BOT_TOKEN.');
      if(data?.code===50007) throw notificationError('MD: no se pudo enviar. El usuario debe permitir MD del bot y compartir un servidor con él.');
      throw notificationError(`MD: Discord respondió HTTP ${response.status}.`);
    }
    return data;
  }
  function dmPayload(job,app) {
    const fields=[],reason=staffView(job.reason,app).slice(0,4000);
    for(let from=0;from<reason.length;) {
      let end=Math.min(from+1000,reason.length);
      if(end<reason.length && /[\uD800-\uDBFF]/.test(reason[end-1]))end--;
      fields.push({name:fields.length?'Motivo (continuación)':'Motivo del Staff',value:reason.slice(from,end)});from=end;
    }
    fields.push({name:'Consulta tu postulación',value:linkFor(app).slice(0,1000)});
    return {content:'Actualización de tu postulación al Staff.',allowed_mentions:{parse:[]},
      nonce:hash(job.id).slice(0,24),enforce_nonce:true,
      embeds:[{title:`Etapa ${job.stage} · ${job.event==='submitted'?'Recibida':job.event==='approved'?'Aprobada':'Rechazada'}`,
        description:`Hola ${staffView(app.name,app).slice(0,80)}.\n${notificationMessage(job)}\n\nEntra con la misma cuenta de Discord para ver el motivo completo y continuar.`,
        color:job.event==='rejected'?0xB83F51:job.event==='approved'?0x31866A:0x4A65AD,fields,
        footer:{text:'Las etapas pendientes vencen a los 90 días desde el inicio. Completar las etapas no garantiza tu entrada al Staff.'}}]};
  }
  async function deliver(job) {
    const app=db.prepare('SELECT * FROM applications WHERE id=?').get(job.app_id);
    if(!app) throw notificationError('Postulación no encontrada.');
    if(job.kind==='dm') {
      if(!c.botToken) throw notificationError('MD: bot sin configurar');
      // Solo el ID confirmado por OAuth puede recibir el aviso; nunca una respuesta editable.
      const user=app.user_id?db.prepare('SELECT discord_id FROM users WHERE id=?').get(app.user_id):null;
      if(!user) throw notificationError('MD: la postulación anterior debe vincularse a una cuenta de Discord verificada.');
      const channel=await botRequest('/users/@me/channels',{recipient_id:user.discord_id});
      if(!/^[0-9]{17,20}$/.test(channel?.id||'')) throw notificationError('MD: Discord no devolvió un canal válido.');
      const message=await botRequest(`/channels/${channel.id}/messages`,dmPayload(job,app));
      if(!/^[0-9]{17,20}$/.test(message?.id||'')) throw notificationError('MD: Discord no confirmó la entrega.');
    } else if(job.kind==='webhook') {
      if(!c.webhook) throw notificationError('Webhook sin configurar');
      const snapshot=db.prepare('SELECT answers FROM submissions WHERE app_id=? AND stage=?').get(app.id,job.stage);
      const answers=JSON.parse(snapshot.answers);
      const lines=stages[job.stage-1].questions.map((question,i)=>`${i+1}. ${question.title}\n${question.description}\n${question.fields.map(f=>`${f.label}:\n${answers[f.id]}`).join('\n\n')}`).join('\n\n---\n\n');
      const text=staffView(`POSTULACIÓN STAFF\nID: ${app.id}\nPostulante: ${app.name}\nEtapa: ${job.stage}\nEvento: ${job.event}\nMotivo: ${job.reason}\n\n${lines}`,app);
      const form=new FormData();
      form.append('payload_json',JSON.stringify({content:`**Postulación Staff · Etapa ${job.stage}**\nEvento: ${job.event==='submitted'?'Recibida':job.event==='approved'?'Aprobada':'Rechazada'}\nID: ${app.id}\nRespuestas completas en el archivo adjunto.\nPanel: ${c.webURL.replace(/\/$/,'')}/staff.html`,allowed_mentions:{parse:[]},attachments:[{id:0,filename:`postulacion-${app.id}-etapa-${job.stage}.txt`}]}));
      form.append('files[0]',new Blob([text],{type:'text/plain;charset=utf-8'}),`postulacion-${app.id}-etapa-${job.stage}.txt`);
      const response=await fetcher(`${c.webhook}?wait=true`,{method:'POST',body:form,signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw notificationError(`Webhook: HTTP ${response.status}`);
    } else throw notificationError('Tipo de notificación desconocido.');
  }
  let busy=false;
  async function work() {
    if(busy) return;busy=true;
    try {
      const jobs=db.prepare('SELECT * FROM outbox WHERE delivered IS NULL AND attempts<8 AND next_try<=? ORDER BY rowid LIMIT 8').all(Date.now());
      for(const job of jobs) {
        if(job.kind==='dm' && discordPauseUntil>Date.now()) {
          db.prepare('UPDATE outbox SET next_try=? WHERE id=?').run(discordPauseUntil,job.id);continue;
        }
        try { await deliver(job);db.prepare('UPDATE outbox SET delivered=?,last_error=NULL WHERE id=?').run(Date.now(),job.id); }
        catch(e) {db.prepare('UPDATE outbox SET attempts=attempts+1,next_try=?,last_error=? WHERE id=?').run(Date.now()+Math.max(Math.min(3600000,30000*2**job.attempts),e.retryAfterMs||0),e.notificationError?e.message:'Error de conexión',job.id);}
      }
      db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('DELETE FROM rates WHERE expires<?').run(Date.now());
      db.prepare('DELETE FROM user_sessions WHERE expires<?').run(Date.now());db.prepare('DELETE FROM oauth_states WHERE expires<?').run(Date.now());
      db.prepare("UPDATE applications SET state='expired',version=version+1 WHERE expires<? AND state IN ('waiting','draft')").run(Date.now());
    } finally {busy=false;}
  }
  const server=http.createServer((req,res)=>handler(req,res));
  server.requestTimeout=30000;server.headersTimeout=10000;
  return {server,db,work,close:()=>{server.close();db.close();}};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const config=envConfig();
  const app=await createApp(config);
  app.server.listen(config.port,'0.0.0.0',()=>console.log(`Portal iniciado en puerto ${config.port}`));
  const interval=setInterval(()=>app.work().catch(()=>console.error('Error procesando notificaciones')),5000);
  interval.unref();
  process.on('SIGTERM',()=>{clearInterval(interval);app.server.close(()=>{app.db.close();process.exit(0);});});
}
