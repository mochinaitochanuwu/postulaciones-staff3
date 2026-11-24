import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../api/server.js';
import {stages,validateAnswers} from '../web/questions.js';
import {randomUUID,createHmac} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const config={production:false,webURL:'http://localhost:3000',dbPath:':memory:',secret:'test-secret-'.repeat(8),adminDiscordId:'987654321098765432',adminEmail:'admin@example.com',adminName:'Admin',adminPassword:'Admin-test-password-2026',botToken:'fake-bot-token',webhook:'https://discord.com/api/webhooks/123456789012345678/fake-test-token',trustProxy:false,discordClientId:'123456789012345678',discordClientSecret:'fake-discord-secret',discordRedirect:'http://localhost:3000/api/auth/discord/callback'};
const validAnswers=stage=>Object.fromEntries(stages[stage-1].questions.flatMap(q=>q.fields).map(f=>[f.id,f.type==='number'?String(f.minimum):f.pattern?'123456789012345678':'Una respuesta desarrollada para la prueba con suficiente explicación. '.repeat(4)]));
async function harness(t,options={}) {
  const sent=[],dmChannels=[],oauthRequests=[],subjects=new Map();
  const app=await createApp({...config,...options},async(url,init)=>{
    if(url==='https://discord.com/api/oauth2/token'){
      oauthRequests.push({url,init});const code=new URLSearchParams(init.body).get('code');
      return new Response(JSON.stringify({access_token:code}),{status:subjects.has(code)?200:400});
    }
    if(url==='https://discord.com/api/v10/users/@me'){
      oauthRequests.push({url,init});return new Response(JSON.stringify(subjects.get(init.headers.Authorization.slice(7))),{status:200});
    }
    if(url==='https://discord.com/api/v10/users/@me/channels'){
      dmChannels.push({url,init});
      const custom=await options.dmResponse?.(url,init);if(custom)return custom;
      return new Response(JSON.stringify({id:'444444444444444444'}));
    }
    sent.push({url,init});
    if(url.includes('/channels/')){
      const custom=await options.dmResponse?.(url,init);if(custom)return custom;
      return new Response(JSON.stringify({id:'555555555555555555'}));
    }
    return new Response('{}',{status:200});
  });
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  t.after(async()=>{await new Promise(r=>app.server.close(r));app.db.close();});
  let defaultToken;
  async function request(path,method='GET',body,token=defaultToken,origin=config.webURL,headers={}){
    const r=await fetch(base+path,{method,redirect:'manual',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{ }),...headers},...(body?{body:JSON.stringify(body)}:{})});
    let data={};if(r.headers.get('content-type')?.includes('application/json'))data=await r.json();
    return {status:r.status,data,headers:r.headers};
  }
  async function loginUser(id='123456789012345678',email='user@example.com',name='Postulante <script>',extra={}){
    const start=await request('/api/auth/discord/start');assert.equal(start.status,302);
    const authorize=new URL(start.headers.get('location')),cookie=start.headers.get('set-cookie').split(';')[0],state=authorize.searchParams.get('state'),code=randomUUID();
    subjects.set(code,{id,email,global_name:name,username:'tester',verified:true,...extra});
    const result=await request(`/api/auth/discord/callback?state=${state}&code=${code}`,'GET',undefined,null,config.webURL,{Cookie:cookie});
    assert.equal(result.status,302);const fragment=new URLSearchParams(new URL(result.headers.get('location')).hash.slice(1));
    return {token:fragment.get('sesion'),error:fragment.get('error'),start,callback:result};
  }
  const adminLogin=await loginUser(config.adminDiscordId,config.adminEmail,'Admin');assert.ok(adminLogin.token,adminLogin.error);
  const userLogin=await loginUser('123456789012345678',options.userEmail||'user@example.com',options.userName||'Postulante <script>');
  assert.ok(userLogin.token,userLogin.error);defaultToken=userLogin.token;
  return {app,sent,dmChannels,request,admin:adminLogin.token,user:userLogin.token,loginUser,oauthRequests,subjects};
}
test('Formulario completo: 7, 8 y 13 preguntas; validación explicativa en servidor',()=>{
  assert.deepEqual(stages.map(s=>s.questions.length),[7,8,13]);
  for(let stage=1;stage<=3;stage++)assert.deepEqual(validateAnswers(stage,validAnswers(stage)),{});
  const answers=validAnswers(1);answers.actividadDetalle='sí';answers.discordId='nombre';answers.edad='13.5';const errors=validateAnswers(1,answers);assert.ok(errors.actividadDetalle);assert.ok(errors.discordId);assert.ok(errors.edad);
});
test('Flujo completo, roles, bloqueo, concurrencia, notificaciones y desactivación',async t=>{
  const h=await harness(t),req=h.request;
  assert.equal((await req('/api/staff/applications')).status,403);
  assert.equal((await req('/api/info','GET',undefined,undefined,'https://malicious.example')).status,403);
  const bad=await req('/api/applications','POST',{name:'Tester',email:'user@example.com',consent:true,requestId:randomUUID(),answers:{}});assert.equal(bad.status,400);
  const requestId=randomUUID(),submission={name:'Postulante <script>',email:'user@example.com',consent:true,requestId,answers:validAnswers(1)};
  const created=await req('/api/applications','POST',submission);assert.equal(created.status,201);assert.ok(!created.data.token);
  const id=created.data.id,applicant=h.user;
  const retry=await req('/api/applications','POST',submission);assert.equal(retry.data.id,id);assert.equal(h.app.db.prepare('SELECT count(*) n FROM applications').get().n,1);
  assert.equal((await req('/api/applicant/submit','POST',{stage:2,answers:validAnswers(2)},applicant)).status,409);
  assert.equal((await req('/api/staff/team','POST',{discordId:'234567890123456789',name:'Revisor'},h.admin)).status,201);
  const login=await h.loginUser('234567890123456789','reviewer@example.com','Revisor'),reviewer=login.token;assert.ok(reviewer);
  assert.equal((await req('/api/staff/team','GET',undefined,reviewer)).status,403);
  assert.equal((await req('/api/staff/team','POST',{discordId:'345678901234567890',name:'Otra'},reviewer)).status,403);
  let detail=await req(`/api/staff/applications/${id}`,'GET',undefined,reviewer);assert.equal(detail.data.submissions.length,1);
  const decision={decision:'approve',reason:'La respuesta demuestra criterio e imparcialidad.',version:detail.data.version};
  const results=await Promise.all([req(`/api/staff/applications/${id}/decision`,'POST',decision,reviewer),req(`/api/staff/applications/${id}/decision`,'POST',decision,h.admin)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  let own=await req('/api/applicant','GET',undefined,applicant);assert.equal(own.data.stage,2);assert.equal(own.data.state,'draft');assert.ok(!own.data.decisions[0].reviewer);
  assert.equal((await req('/api/applicant/submit','POST',{stage:3,answers:validAnswers(3)},applicant)).status,409);
  assert.equal((await req('/api/applicant/submit','POST',{stage:2,answers:validAnswers(2)},applicant)).status,200);
  detail=await req(`/api/staff/applications/${id}`,'GET',undefined,reviewer);
  assert.equal((await req(`/api/staff/applications/${id}/decision`,'POST',{...decision,version:detail.data.version},reviewer)).status,200);
  assert.equal((await req('/api/applicant/submit','POST',{stage:3,answers:validAnswers(3)},applicant)).status,200);
  detail=await req(`/api/staff/applications/${id}`,'GET',undefined,reviewer);
  assert.equal((await req(`/api/staff/applications/${id}/decision`,'POST',{...decision,version:detail.data.version},reviewer)).data.state,'accepted');
  await h.app.work();await h.app.work();
  assert.equal(h.sent.length,12);assert.equal(h.app.db.prepare('SELECT count(*) n FROM outbox WHERE delivered IS NULL').get().n,0);
  const messages=h.sent.filter(s=>s.url.includes('/channels/'));assert.equal(messages.length,6);
  const dm=JSON.parse(messages[1].init.body);assert.ok(dm.embeds[0].description.includes('etapa 2'));assert.equal(dm.enforce_nonce,true);assert.ok(dm.nonce.length<=25);assert.deepEqual(dm.allowed_mentions.parse,[]);
  assert.ok(h.dmChannels.every(s=>JSON.parse(s.init.body).recipient_id==='123456789012345678'&&s.init.headers.Authorization==='Bot fake-bot-token'));
  assert.ok(h.sent.every(s=>!s.url.includes('resend')));
  assert.equal(new Set(messages.map(s=>JSON.parse(s.init.body).nonce)).size,6);
  const discord=h.sent.find(s=>s.url.includes('/webhooks/'));
  const payload=JSON.parse(discord.init.body.get('payload_json'));assert.deepEqual(payload.allowed_mentions.parse,[]);assert.ok(!payload.content.includes(applicant));
  const attachment=await discord.init.body.get('files[0]').text();assert.ok(attachment.includes('Tu situación dentro de la comunidad'));assert.ok(attachment.includes(submission.answers.comunidad));
  const team=await req('/api/staff/team','GET',undefined,h.admin),member=team.data.team.find(s=>s.discordId==='234567890123456789');
  assert.equal((await req(`/api/staff/team/${member.id}`,'DELETE',undefined,h.admin)).status,200);
  assert.equal((await req('/api/staff/applications','GET',undefined,reviewer)).status,403);
});
test('Rechazo cierra postulación; logout invalida la sesión compartida con Staff',async t=>{
  const h=await harness(t,{userEmail:'reject@example.com'}),req=h.request;
  const created=await req('/api/applications','POST',{name:'Rechazado',email:'reject@example.com',consent:true,requestId:randomUUID(),answers:validAnswers(1)});
  const token=h.user;
  const detail=await req(`/api/staff/applications/${created.data.id}`,'GET',undefined,h.admin);
  const rejected=await req(`/api/staff/applications/${created.data.id}/decision`,'POST',{version:detail.data.version,decision:'reject',reason:'Las respuestas necesitan más ejemplos concretos.'},h.admin);assert.equal(rejected.data.state,'rejected');
  assert.equal((await req('/api/applicant/submit','POST',{stage:2,answers:validAnswers(2)},token)).status,409);
  assert.equal((await req('/api/staff/password','POST',{oldPassword:config.adminPassword,newPassword:'Nueva-password-de-test-2026'},h.admin)).status,410);
  assert.equal((await req('/api/auth/logout','POST',{},h.admin)).status,200);
  assert.equal((await req('/api/staff/applications','GET',undefined,h.admin)).status,401);
  const again=await h.loginUser(config.adminDiscordId,config.adminEmail,'Admin');assert.ok(again.token);
  assert.equal((await req('/api/staff/applications','GET',undefined,again.token)).status,200);

});
test('Fallos de entrega quedan en cola y se pueden reintentar',async t=>{
  const h=await harness(t,{botToken:'',webhook:'',userEmail:'queue@example.com'});
  const created=await h.request('/api/applications','POST',{name:'Cola',email:'queue@example.com',consent:true,requestId:randomUUID(),answers:validAnswers(1)});
  await h.app.work();const jobs=h.app.db.prepare('SELECT * FROM outbox').all();assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.attempts===1&&!j.delivered&&j.last_error));
  assert.equal((await h.request('/api/staff/notifications/retry','POST',{id:jobs[0].id},h.admin)).status,200);
  assert.equal(h.app.db.prepare('SELECT attempts FROM outbox WHERE id=?').get(jobs[0].id).attempts,0);
  const app=await h.request(`/api/staff/applications/${created.data.id}`,'GET',undefined,h.admin);assert.equal(app.data.notifications.length,2);
});
test('Datos y cuentas sobreviven a reiniciar el proceso',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'staff-test-')),dbPath=join(directory,'staff.sqlite');
  let h=await createApp({...config,dbPath});
  const id=randomUUID(),created=Date.now();h.db.prepare('INSERT INTO applications (id,request_id,email,name,stage,state,created,expires) VALUES (?,?,?,?,?,?,?,?)').run(id,randomUUID(),'persist@example.com','Persistencia',1,'waiting',created,created+100000);
  h.db.close();h=await createApp({...config,dbPath});assert.equal(h.db.prepare('SELECT name FROM applications WHERE id=?').get(id).name,'Persistencia');assert.equal(h.db.prepare('SELECT count(*) n FROM staff').get().n,1);h.db.close();rmSync(directory,{recursive:true});
});
test('Producción rechaza credenciales incompletas y volúmenes ausentes',async()=>{
  await assert.rejects(createApp({...config,production:true,webURL:'https://community.netlify.app',secret:'short'}),/APP_SECRET/);
  await assert.rejects(createApp({...config,production:true,webURL:'https://community.netlify.app',dbPath:'/data/staff.sqlite',volumeMount:''}),/volumen de Railway/);
});
test('La cuenta conserva una sola postulación incluso si vence',async t=>{
  const h=await harness(t,{userEmail:'expired@example.com'}),body={name:'Vencida',email:'expired@example.com',consent:true,requestId:randomUUID(),answers:validAnswers(1)};
  const first=await h.request('/api/applications','POST',body);assert.equal(first.status,201);
  h.app.db.prepare('UPDATE applications SET expires=? WHERE id=?').run(Date.now()-1000,first.data.id);
  const second=await h.request('/api/applications','POST',{...body,requestId:randomUUID()});assert.equal(second.status,409);
  assert.equal(h.app.db.prepare('SELECT state FROM applications WHERE id=?').get(first.data.id).state,'expired');
});
test('Correo privado para administradora, Staff y Discord; avisos al destinatario correcto',async t=>{
  const email='private+tag@example.com',h=await harness(t,{userEmail:email,userName:`Alias ${email.toUpperCase()}`}),req=h.request;
  const answers=validAnswers(1);
  answers.comunidad+=` Mi correo personal es ${email.toUpperCase()} y prefiero mantenerlo privado.`;
  const created=await req('/api/applications','POST',{name:`Alias ${email.toUpperCase()}`,email,consent:true,requestId:randomUUID(),answers});
  assert.equal(created.status,201);
  const id=created.data.id,applicant=h.user;
  assert.equal((await req('/api/staff/team','POST',{name:'Revisor privacidad',discordId:'234567890123456789'},h.admin)).status,201);
  const login=await h.loginUser('234567890123456789','privacy-reviewer@example.com','Revisor privacidad');
  const reviewer=login.token;assert.ok(reviewer);
  for(const staffToken of [h.admin,reviewer]) {
    const list=await req('/api/staff/applications','GET',undefined,staffToken);
    assert.equal(list.status,200);
    assert.ok(!Object.hasOwn(list.data.applications[0],'email'));
    assert.ok(!JSON.stringify(list.data).toLowerCase().includes(email));
    const detail=await req(`/api/staff/applications/${id}`,'GET',undefined,staffToken);
    assert.equal(detail.status,200);
    assert.ok(!Object.hasOwn(detail.data,'email'));
    assert.ok(!JSON.stringify(detail.data).toLowerCase().includes(email));
    assert.ok(detail.data.submissions[0].answers.comunidad.includes('[correo privado]'));
  }
  const own=await req('/api/applicant','GET',undefined,applicant);
  assert.equal(own.data.email,email);
  assert.equal(h.app.db.prepare('SELECT email FROM applications WHERE id=?').get(id).email,email);
  const approved=await req(`/api/staff/applications/${id}/decision`,'POST',{version:own.data.version,decision:'approve',reason:`Aprobamos por sus ejemplos; su correo ${email} debe mantenerse privado.`},reviewer);
  assert.equal(approved.status,200);
  assert.equal(approved.data.stage,2);
  assert.ok(!Object.hasOwn(approved.data,'email'));
  assert.ok(!JSON.stringify(approved.data).toLowerCase().includes(email));
  await h.app.work();
  const notifications=h.sent.filter(s=>s.url.includes('/channels/'));
  assert.equal(notifications.length,2);
  for(const notification of notifications) assert.ok(!notification.init.body.toLowerCase().includes(email));
  assert.ok(h.dmChannels.every(s=>JSON.parse(s.init.body).recipient_id==='123456789012345678'));
  assert.ok(JSON.parse(notifications[1].init.body).embeds[0].description.includes('etapa 2'));
  const webhooks=h.sent.filter(s=>s.url.includes('/webhooks/'));
  assert.equal(webhooks.length,2);
  for(const webhook of webhooks) {
    const payload=webhook.init.body.get('payload_json');
    const attachment=await webhook.init.body.get('files[0]').text();
    assert.ok(!payload.toLowerCase().includes(email));
    assert.ok(!attachment.toLowerCase().includes(email));
    assert.ok(!/^Correo:/m.test(attachment));
    assert.ok(attachment.includes('Tu situación dentro de la comunidad'));
    assert.ok(attachment.includes('[correo privado]'));
  }
});
test('OAuth: cookie de estado, permisos mínimos, un solo uso y correo confirmado',async t=>{
  const h=await harness(t),req=h.request;
  const start=await req('/api/auth/discord/start');
  const authorization=new URL(start.headers.get('location'));
  assert.equal(authorization.origin,'https://discord.com');
  assert.equal(authorization.searchParams.get('scope'),'identify email');
  assert.ok(start.headers.get('set-cookie').includes('HttpOnly'));
  assert.ok(start.headers.get('set-cookie').includes('SameSite=Lax'));
  const state=authorization.searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0],calls=h.oauthRequests.length;
  const absentCookie=await req(`/api/auth/discord/callback?state=${state}&code=none`);
  assert.ok(new URLSearchParams(new URL(absentCookie.headers.get('location')).hash.slice(1)).get('error'));
  assert.equal(h.oauthRequests.length,calls);
  const denied=await req(`/api/auth/discord/callback?state=${state}&error=access_denied`,'GET',undefined,null,config.webURL,{Cookie:cookie});
  assert.ok(new URLSearchParams(new URL(denied.headers.get('location')).hash.slice(1)).get('error').includes('Cancelaste'));
  const replay=await req(`/api/auth/discord/callback?state=${state}&code=none`,'GET',undefined,null,config.webURL,{Cookie:cookie});
  assert.ok(new URLSearchParams(new URL(replay.headers.get('location')).hash.slice(1)).get('error').includes('ya se utilizó'));
  const unverified=await h.loginUser('234567890123456789','unverified@example.com','Sin verificar',{verified:false});
  assert.ok(!unverified.token);assert.ok(unverified.error.includes('correo verificado'));
  assert.equal(h.app.db.prepare('SELECT count(*) n FROM users').get().n,2);
  const repeatedEmail=await h.loginUser('234567890123456789','user@example.com','Otra cuenta');
  assert.ok(!repeatedEmail.token);assert.ok(repeatedEmail.error.includes('otra cuenta'));
});
test('Sin sesión no se puede postular; otra cuenta no puede abrir ni reutilizar la postulación',async t=>{
  const h=await harness(t),req=h.request,requestId=randomUUID();
  const body={consent:true,requestId,answers:validAnswers(1)};
  assert.equal((await req('/api/applications','POST',body,null)).status,401);
  assert.equal((await req('/api/profile','GET',undefined,h.admin)).status,200);
  assert.equal((await req('/api/staff/applications','GET',undefined,h.user)).status,403);
  const created=await req('/api/applications','POST',body);assert.equal(created.status,201);
  assert.equal((await req('/api/applications','POST',{...body,requestId:randomUUID()})).status,409);
  assert.equal((await req('/api/applications','POST',{...body,email:'forged@example.com'})).status,403);
  assert.equal((await req('/api/applications','POST',{...body,answers:{...body.answers,discordId:'999999999999999999'}})).status,403);
  const other=await h.loginUser('234567890123456789','other@example.com','Otra cuenta');assert.ok(other.token);
  assert.equal((await req(`/api/applicant?id=${created.data.id}`,'GET',undefined,other.token)).status,404);
  assert.equal((await req('/api/applicant/submit','POST',{stage:2,answers:validAnswers(2)},other.token)).status,404);
  assert.equal((await req('/api/applications','POST',{...body,answers:{...body.answers,discordId:'234567890123456789'}},other.token)).status,403);
  const app=h.app.db.prepare('SELECT * FROM applications WHERE id=?').get(created.data.id),legacyToken=`${app.id}.${createHmac('sha256',config.secret).update(`app:${app.id}:${app.created}`).digest('hex')}`;
  assert.equal((await req('/api/applicant','GET',undefined,legacyToken)).status,401);
  assert.equal((await req('/api/applicant/claim','POST',{legacyToken},other.token)).status,403);
});
test('Discord conserva usuario y código al cambiar de navegador; logout invalida el token',async t=>{
  const h=await harness(t),req=h.request,before=await req('/api/profile');
  const second=await h.loginUser();assert.ok(second.token);assert.notEqual(second.token,h.user);
  const after=await req('/api/profile','GET',undefined,second.token);
  assert.equal(after.data.id,before.data.id);assert.equal(after.data.code,before.data.code);
  assert.equal(h.app.db.prepare('SELECT count(*) n FROM users').get().n,2);
  assert.equal((await req('/api/auth/logout','POST',{},second.token)).status,200);
  assert.equal((await req('/api/profile','GET',undefined,second.token)).status,401);
  assert.equal((await req('/api/profile')).status,200);
});
test('Cambio de correo verificado mantiene la privacidad y el mismo destinatario de MD',async t=>{
  const h=await harness(t),req=h.request,answers=validAnswers(1);answers.comunidad+=' Mi correo es user@example.com.';
  const created=await req('/api/applications','POST',{consent:true,requestId:randomUUID(),answers});assert.equal(created.status,201);
  const changed=await h.loginUser('123456789012345678','new-address@example.com');assert.ok(changed.token);
  const own=await req('/api/profile','GET',undefined,changed.token);assert.equal(own.data.email,'new-address@example.com');
  const detail=await req(`/api/staff/applications/${created.data.id}`,'GET',undefined,h.admin);
  assert.ok(!JSON.stringify(detail.data).includes('user@example.com'));assert.ok(!JSON.stringify(detail.data).includes('new-address@example.com'));
  await h.app.work();
  assert.equal(h.dmChannels.length,1);assert.equal(JSON.parse(h.dmChannels[0].init.body).recipient_id,'123456789012345678');
  assert.ok(!h.sent.some(n=>n.url.includes('resend')));
  const webhook=h.sent.find(n=>n.url.includes('/webhooks/'));assert.ok(!(await webhook.init.body.get('files[0]').text()).includes('user@example.com'));
});
test('Imagen de perfil: PNG válido, metadatos retirados, acceso propio y formato activo rechazado',async t=>{
  const h=await harness(t),req=h.request;
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAF3RFWHRhdXRob3IAdXNlckBleGFtcGxlLmNvbe5hFB4AAAANSURBVHicY/jPwPAfAAUAAf+JmT0dAAAAAElFTkSuQmCC';
  const updated=await req('/api/profile','POST',{name:'Mi perfil custom',avatar:image});assert.equal(updated.status,200);
  assert.ok(updated.data.avatar.startsWith('data:image/png;base64,'));
  assert.ok(!Buffer.from(updated.data.avatar.split(',')[1],'base64').includes(Buffer.from('user@example.com')));
  assert.equal((await req('/api/profile','POST',{name:'Nombre',avatar:'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='})).status,400);
  assert.equal((await req('/api/profile','POST',{name:'Nombre',avatar:'data:image/png;base64,AA=='})).status,400);
  const created=await req('/api/applications','POST',{consent:true,requestId:randomUUID(),answers:validAnswers(1)});assert.equal(created.status,201);
  const detail=await req(`/api/staff/applications/${created.data.id}`,'GET',undefined,h.admin);assert.equal(detail.data.avatar,updated.data.avatar);assert.ok(!detail.data.email);
  const other=await h.loginUser('234567890123456789','another@example.com','Otro');
  assert.equal((await req('/api/profile','GET',undefined,other.token)).data.avatar,null);
  assert.equal((await req('/api/profile')).data.avatar,updated.data.avatar);
  assert.equal((await req('/api/profile','POST',{name:'Mi perfil custom',avatar:null})).data.avatar,null);
});
test('Las postulaciones anteriores solo se vinculan con Discord, correo y enlace coincidentes',async t=>{
  const h=await harness(t),id=randomUUID(),created=Date.now(),req=h.request;
  h.app.db.prepare('INSERT INTO applications (id,request_id,email,name,stage,state,created,expires) VALUES (?,?,?,?,?,?,?,?)').run(id,randomUUID(),'user@example.com','Postulación anterior',1,'waiting',created,created+86400000);
  h.app.db.prepare('INSERT INTO submissions VALUES (?,?,?,?)').run(id,1,JSON.stringify(validAnswers(1)),created);
  const legacyToken=`${id}.${createHmac('sha256',config.secret).update(`app:${id}:${created}`).digest('hex')}`;
  assert.equal((await req('/api/applicant')).status,404);
  assert.equal((await req(`/api/staff/applications/${id}/decision`,'POST',{version:1,decision:'approve',reason:'Cumple los criterios de revisión de esta primera etapa.'},h.admin)).status,200);
  await h.app.work();
  assert.equal(h.dmChannels.length,0);
  const pending=h.app.db.prepare("SELECT * FROM outbox WHERE kind='dm'").get();assert.ok(pending.last_error.includes('vincularse'));assert.equal(pending.delivered,null);
  assert.equal((await req('/api/applicant/claim','POST',{legacyToken})).status,200);
  assert.equal(h.app.db.prepare('SELECT attempts FROM outbox WHERE id=?').get(pending.id).attempts,0);
  await h.app.work();assert.equal(h.dmChannels.length,1);
  const message=JSON.parse(h.sent.find(job=>job.url.includes('/channels/')).init.body);
  assert.ok(JSON.stringify(message).includes(`#postulacion=${id}`));assert.ok(!JSON.stringify(message).includes(legacyToken));
  assert.equal((await req('/api/applicant')).data.id,id);
  assert.equal((await req('/api/profile')).data.application.id,id);
  assert.equal((await req('/api/applicant','GET',undefined,legacyToken)).status,401);
});

test('Permisos por Discord: perfil, autorización, revocación y cierre de accesos anteriores',async t=>{
  const h=await harness(t),req=h.request;
  assert.equal((await req('/api/profile')).data.staff,null);
  assert.equal((await req('/api/profile','GET',undefined,h.admin)).data.staff.role,'admin');
  assert.equal((await req('/api/profile','POST',{name:'Sigo siendo postulante',role:'admin',staff:{role:'admin'},discordId:config.adminDiscordId})).data.staff,null);
  assert.equal((await req('/api/staff/team','POST',{name:'Postulante',discordId:'123456789012345678',role:'admin'},h.admin)).status,400);
  assert.equal((await req('/api/staff/team','POST',{name:'Nuevo Staff',discordId:'123456789012345678'},h.admin)).status,201);
  assert.equal((await req('/api/profile')).data.staff.role,'staff');
  assert.equal((await req('/api/staff/applications')).status,200);
  assert.equal((await req('/api/staff/team','POST',{name:'Intruso',discordId:'345678901234567890'})).status,403);
  const team=await req('/api/staff/team','GET',undefined,h.admin),member=team.data.team.find(s=>s.discordId==='123456789012345678');
  assert.ok(team.data.team.every(s=>!Object.hasOwn(s,'email')));
  assert.equal((await req(`/api/staff/team/${member.id}`,'DELETE',undefined,h.admin)).status,200);
  assert.equal((await req('/api/profile')).data.staff,null);
  assert.equal((await req('/api/staff/applications')).status,403);
  assert.equal((await req('/api/staff/team','POST',{name:'Nuevo Staff',discordId:'123456789012345678'},h.admin)).status,201);
  assert.equal((await req('/api/staff/applications')).status,200);
  for(const route of ['login','password','invites','invites/accept','logout'])assert.equal((await req('/api/staff/'+route,'POST',{},h.admin)).status,410);
  const adminMember=team.data.team.find(s=>s.role==='admin');
  assert.equal((await req(`/api/staff/team/${adminMember.id}`,'DELETE',undefined,h.admin)).status,400);
});
test('Cuentas anteriores se vinculan a Discord y conservan el historial',async t=>{
  const h=await harness(t),id=randomUUID();
  h.app.db.prepare('INSERT INTO staff (id,email,name,password,role) VALUES (?,?,?,?,?)').run(id,'legacy@example.com','Staff anterior','old-encoded-password','staff');
  h.app.db.prepare('INSERT INTO audit (staff_id,action,target,created) VALUES (?,?,?,?)').run(id,'invited','legacy@example.com',Date.now());
  const reviewer=await h.loginUser('234567890123456789','legacy@example.com','Revisor');
  assert.equal((await h.request('/api/staff/applications','GET',undefined,reviewer.token)).status,403);
  assert.equal((await h.request('/api/staff/team','POST',{name:'Staff anterior',discordId:'234567890123456789',memberId:id},h.admin)).status,201);
  assert.equal((await h.request('/api/profile','GET',undefined,reviewer.token)).data.staff.id,id);
  assert.equal((await h.request('/api/staff/applications','GET',undefined,reviewer.token)).status,200);
  const team=await h.request('/api/staff/team','GET',undefined,h.admin);
  assert.ok(!JSON.stringify(team.data).includes('legacy@example.com'));
  assert.equal(h.app.db.prepare('SELECT staff_id FROM audit WHERE action=?').get('invited').staff_id,id);
});
test('El ID administrador es obligatorio y no cambia silenciosamente después de vincularlo',async()=>{
  await assert.rejects(createApp({...config,adminDiscordId:''}),/ADMIN_DISCORD_ID/);
  const directory=mkdtempSync(join(tmpdir(),'staff-admin-')),dbPath=join(directory,'staff.sqlite');
  let app=await createApp({...config,dbPath});const id=app.db.prepare("SELECT id FROM staff WHERE role='admin'").get().id;
  app.db.prepare('UPDATE staff SET discord_id=NULL WHERE id=?').run(id);app.db.close();
  app=await createApp({...config,dbPath});assert.equal(app.db.prepare("SELECT id,discord_id FROM staff WHERE role='admin'").get().id,id);app.db.close();
  await assert.rejects(createApp({...config,dbPath,adminDiscordId:'876543210987654321'}),/no coincide/);
  rmSync(directory,{recursive:true});
});

test('MD bloqueado no pierde la decisión; Staff puede reintentar con el mismo nonce',async t=>{
  let blocked=true;
  const h=await harness(t,{dmResponse:async(url)=>blocked&&url.includes('/channels/')?new Response(JSON.stringify({code:50007,message:'provider private data'}),{status:403}):null});
  const created=await h.request('/api/applications','POST',{consent:true,requestId:randomUUID(),answers:validAnswers(1)});
  await h.request(`/api/staff/applications/${created.data.id}/decision`,'POST',{version:1,decision:'approve',reason:'Los ejemplos cumplen los criterios para esta primera etapa.'},h.admin);
  await h.app.work();
  const own=await h.request('/api/applicant');assert.equal(own.data.state,'draft');assert.equal(own.data.stage,2);
  assert.equal(own.data.notifications.length,2);assert.ok(own.data.notifications.every(n=>!n.delivered&&n.last_error.includes('permitir MD')));
  assert.ok(!JSON.stringify(own.data).includes('provider private data'));
  assert.equal(h.app.db.prepare("SELECT count(*) n FROM outbox WHERE kind='webhook' AND delivered IS NOT NULL").get().n,2);
  const job=h.app.db.prepare("SELECT * FROM outbox WHERE kind='dm' AND event='approved'").get();
  assert.equal((await h.request('/api/staff/notifications/retry','POST',{id:job.id})).status,403);
  assert.equal((await h.request('/api/staff/notifications/retry','POST',{id:job.id},h.admin)).status,200);
  blocked=false;await h.app.work();
  assert.ok(h.app.db.prepare('SELECT delivered FROM outbox WHERE id=?').get(job.id).delivered);
  const messages=h.sent.filter(n=>n.url.includes('/channels/')).map(n=>JSON.parse(n.init.body));
  assert.equal(messages[1].nonce,messages[2].nonce);assert.equal(h.app.db.prepare('SELECT count(*) n FROM decisions').get().n,1);
});

test('Discord 429 respeta retry_after y pausa los MD sin detener los webhooks',async t=>{
  let limited=true;
  const h=await harness(t,{dmResponse:async(url)=>limited&&url.endsWith('/users/@me/channels')?new Response(JSON.stringify({retry_after:120,global:true}),{status:429}):null});
  const created=await h.request('/api/applications','POST',{consent:true,requestId:randomUUID(),answers:validAnswers(1)});
  await h.request(`/api/staff/applications/${created.data.id}/decision`,'POST',{version:1,decision:'reject',reason:'Las respuestas requieren ejemplos concretos antes de postular.'},h.admin);
  const now=Date.now();await h.app.work();
  const jobs=h.app.db.prepare("SELECT * FROM outbox WHERE kind='dm' ORDER BY rowid").all();
  assert.equal(h.dmChannels.length,1);assert.equal(jobs[0].attempts,1);assert.equal(jobs[1].attempts,0);
  assert.ok(jobs.every(n=>n.next_try>=now+120000&&!n.delivered));
  assert.equal(h.app.db.prepare("SELECT count(*) n FROM outbox WHERE kind='webhook' AND delivered IS NOT NULL").get().n,2);
  await h.app.work();assert.equal(h.dmChannels.length,1);
  limited=false;
  const originalNow=Date.now;Date.now=()=>now+121000;
  try{await h.app.work();}finally{Date.now=originalNow;}
  assert.equal(h.dmChannels.length,3);assert.equal(h.app.db.prepare('SELECT count(*) n FROM outbox WHERE delivered IS NULL').get().n,0);
  const rejected=JSON.parse(h.sent.filter(n=>n.url.includes('/channels/')).at(-1).init.body);
  assert.ok(rejected.embeds[0].title.includes('Rechazada'));assert.ok(rejected.embeds[0].description.includes('rechazada durante la etapa 1'));
});

test('Token de bot inválido queda pendiente sin filtrar respuestas del proveedor',async t=>{
  const h=await harness(t,{dmResponse:async()=>new Response(JSON.stringify({message:'fake-bot-token private@example.com'}),{status:401})});
  await h.request('/api/applications','POST',{consent:true,requestId:randomUUID(),answers:validAnswers(1)});await h.app.work();
  const job=h.app.db.prepare("SELECT * FROM outbox WHERE kind='dm'").get();
  assert.equal(job.delivered,null);assert.equal(job.attempts,1);assert.ok(job.last_error.includes('token del bot inválido'));
  const own=await h.request('/api/applicant');assert.ok(!JSON.stringify(own.data).includes('fake-bot-token'));assert.ok(!JSON.stringify(own.data).includes('private@example.com'));
  await assert.rejects(createApp({...config,production:true,webURL:'http://localhost:3000',botToken:'',webhook:'',secret:'short'}),error=>{
    for(const name of ['PUBLIC_WEB_URL','APP_SECRET','DISCORD_BOT_TOKEN','DISCORD_WEBHOOK_URL','DB_PATH'])assert.ok(error.message.includes(name));
    assert.ok(!error.message.includes('RESEND_API_KEY'));return true;
  });
});

test('MD usa el dueño verificado y conserva motivos largos dentro de los límites de Discord',async t=>{
  const h=await harness(t),created=await h.request('/api/applications','POST',{consent:true,requestId:randomUUID(),answers:validAnswers(1)});
  // Ni una respuesta modificada ni un alias pueden cambiar el destinatario de la notificación.
  const altered={...validAnswers(1),discordId:'999999999999999999'};
  h.app.db.prepare('UPDATE submissions SET answers=? WHERE app_id=? AND stage=1').run(JSON.stringify(altered),created.data.id);
  const reason='Criterio y ejemplos: '+String.fromCodePoint(0x1F600).repeat(989)+'x',result=await h.request(`/api/staff/applications/${created.data.id}/decision`,'POST',{version:1,decision:'approve',reason},h.admin);
  assert.equal(result.status,200);await h.app.work();
  assert.ok(h.dmChannels.every(n=>JSON.parse(n.init.body).recipient_id==='123456789012345678'));
  const payload=JSON.parse(h.sent.filter(n=>n.url.includes('/channels/')).at(-1).init.body),embed=payload.embeds[0];
  const fields=embed.fields.filter(f=>f.name.startsWith('Motivo'));assert.equal(fields.map(f=>f.value).join(''),reason);
  assert.ok(embed.fields.every(f=>f.value.length<=1024));assert.ok(payload.content.length<=2000);
  const total=embed.title.length+embed.description.length+embed.footer.text.length+embed.fields.reduce((n,f)=>n+f.name.length+f.value.length,0);assert.ok(total<=6000);
  assert.deepEqual(payload.allowed_mentions,{parse:[]});assert.ok(embed.fields.at(-1).value.includes(`#postulacion=${created.data.id}`));
});

test('Reinicio migra correos pendientes a MD y conserva el historial entregado',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'staff-dm-migration-')),dbPath=join(directory,'staff.sqlite'),id=randomUUID(),userId=randomUUID(),pending=randomUUID(),delivered=randomUUID(),now=Date.now();
  let app=await createApp({...config,dbPath});
  try{
    app.db.prepare('INSERT INTO users (id,discord_id,email,name,code,created) VALUES (?,?,?,?,?,?)').run(userId,'123456789012345678','private@example.com','Migrado','a'.repeat(32),now);
    app.db.prepare('INSERT INTO applications (id,request_id,email,name,stage,state,created,expires,user_id) VALUES (?,?,?,?,?,?,?,?,?)').run(id,randomUUID(),'private@example.com','Migrado',2,'draft',now,now+86400000,userId);
    for(const [jobId,time] of [[pending,null],[delivered,now]])app.db.prepare('INSERT INTO outbox (id,app_id,kind,event,stage,reason,attempts,next_try,delivered,last_error) VALUES (?,?,?,?,?,?,?,?,?,?)').run(jobId,id,'email','approved',1,'Ejemplos suficientes para continuar.',8,now+86400000,time,'Correo sin configurar');
    app.db.close();const calls=[];
    app=await createApp({...config,dbPath},async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({id:url.endsWith('/channels')?'444444444444444444':'555555555555555555'}));});
    const migrated=app.db.prepare('SELECT * FROM outbox WHERE id=?').get(pending);assert.equal(migrated.kind,'dm');assert.equal(migrated.attempts,0);assert.equal(migrated.last_error,null);
    assert.equal(app.db.prepare('SELECT kind,delivered FROM outbox WHERE id=?').get(delivered).kind,'email');
    await app.work();assert.equal(calls.length,2);assert.equal(JSON.parse(calls[0].init.body).recipient_id,'123456789012345678');assert.ok(calls.every(c=>!c.url.includes('resend')));
    assert.ok(app.db.prepare('SELECT delivered FROM outbox WHERE id=?').get(pending).delivered);
  }finally{app.db.close();rmSync(directory,{recursive:true});}
});

test('Respuestas incompletas del bot no confirman entrega; los reintentos automáticos tienen límite',async t=>{
  let malformedChannel=true;
  const h=await harness(t,{dmResponse:async(url)=>new Response(JSON.stringify(url.endsWith('/users/@me/channels')&&!malformedChannel?{id:'444444444444444444'}:{}))});
  await h.request('/api/applications','POST',{consent:true,requestId:randomUUID(),answers:validAnswers(1)});await h.app.work();
  let job=h.app.db.prepare("SELECT * FROM outbox WHERE kind='dm'").get();assert.ok(job.last_error.includes('canal válido'));assert.equal(job.delivered,null);
  malformedChannel=false;
  for(let i=1;i<9;i++){h.app.db.prepare('UPDATE outbox SET next_try=0 WHERE id=?').run(job.id);await h.app.work();}
  job=h.app.db.prepare('SELECT * FROM outbox WHERE id=?').get(job.id);assert.equal(job.attempts,8);assert.equal(job.delivered,null);assert.ok(job.last_error.includes('no confirmó la entrega'));
  assert.equal(h.dmChannels.length,8);assert.equal(h.sent.filter(n=>n.url.includes('/channels/')).length,7);
  assert.equal((await h.request('/api/info')).data.dmConfigured,true);assert.equal((await h.request('/api/info')).data.emailConfigured,undefined);
});
