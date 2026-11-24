import {stages} from './questions.js';
import {$,escape,message,clearMessage,api,busy,badge,date,states} from './common.js';
let token=sessionStorage.getItem('applicant-session')||'',staff=null,applications=[],filter='waiting',selected=null,view='applications';
const call=async(path,options={})=>{
  try{return await api(`/staff${path}`,{...options,token});}
  catch(error){if(error.status===401 || error.status===403){if(error.status===401)sessionStorage.removeItem('applicant-session');staff=null;accessGate(error.message);}throw error;}
};
function accessGate(text='Inicia sesión con Discord desde la página principal. Solo las cuentas autorizadas pueden acceder al panel.'){
  $('#detail-dialog').close();$('#admin-nav').classList.add('hidden');
  $('#staff-identity').innerHTML='<a class="staff-access" href="index.html">Volver a mi perfil</a>';
  $('#content').innerHTML=`<div class="login-card"><div class="eyebrow">ACCESO DEL EQUIPO</div><h1>Panel de Administración</h1><p class="muted">${escape(text)}</p><a class="button primary full" href="index.html">Ir a la página principal</a></div>`;
}
async function boot(){
  if(!token){accessGate();return;}
  try{const profile=await api('/profile',{token});if(!profile.staff){accessGate('Tu cuenta de Discord no tiene permiso para ver, aprobar o rechazar postulaciones. La administradora puede autorizar tu ID de usuario.');return;}staff=profile.staff;shell();await loadApplications();}
  catch(error){if(error.status===401)sessionStorage.removeItem('applicant-session');accessGate(error.message);}
}
function shell(){
  $('#staff-identity').innerHTML=`<span class="identity">${escape(staff.name)} <small>${staff.role==='admin'?'Administradora':'Staff'}</small></span><button id="logout" class="text-button">Salir</button>`;
  $('#logout').onclick=async()=>{try{await api('/auth/logout',{method:'POST',body:{},token});}catch{}sessionStorage.removeItem('applicant-session');token='';staff=null;accessGate('Sesión cerrada. Puedes volver a entrar con Discord desde la página principal.');};
  $('#admin-nav').classList.remove('hidden');
  $('#admin-nav').innerHTML=`<div class="eyebrow">ESPACIO DEL EQUIPO</div><button data-view="applications" class="nav-button ${view==='applications'?'active':''}">Postulaciones</button>${staff.role==='admin'?`<button data-view="team" class="nav-button ${view==='team'?'active':''}">Equipo y permisos</button>`:''}<a href="index.html" class="nav-button">Mi perfil</a><div class="side-note"><strong>Cada decisión deja registro.</strong><p>Evalúa las respuestas y justifica la aprobación o el rechazo.</p></div>`;
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;clearMessage();shell();if(view==='team')loadTeam();else loadApplications();});
}
async function loadApplications(){
  try{const data=await call('/applications');applications=data.applications;renderList();}
  catch(err){message(err.message);}
}
function renderList(){
  const total=state=>applications.filter(a=>a.state===state).length;
  $('#content').innerHTML=`<div class="admin-heading"><div><div class="eyebrow">POSTULACIONES</div><h1>Una comunidad, un equipo.</h1><p class="muted">Revisa cada etapa antes de habilitar la siguiente.</p></div><button id="refresh" class="button secondary">Actualizar</button></div><div class="stats"><div><span>Pendientes de revisión</span><strong>${total('waiting')}</strong></div><div><span>Continuando etapas</span><strong>${total('draft')}</strong></div><div><span>Postulaciones aprobadas</span><strong>${total('accepted')}</strong></div></div><div class="filters">${[['waiting','Pendientes'],['draft','En proceso'],['accepted','Aprobadas'],['rejected','Rechazadas'],['all','Todas']].map(([k,label])=>`<button data-filter="${k}" class="filter ${filter===k?'active':''}">${label}</button>`).join('')}<label class="search"><span class="sr-only">Buscar por nombre o referencia</span><input id="search" type="search" placeholder="Buscar nombre o referencia"></label></div><div id="application-list"></div><p class="muted small">El panel muestra las 200 postulaciones más recientes.</p>`;
  $('#refresh').onclick=loadApplications;
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;renderList();});
  $('#search').oninput=renderRows;renderRows();
}
function renderRows(){
  const search=($('#search')?.value||'').toLowerCase();const rows=applications.filter(a=>(filter==='all'||a.state===filter)&&`${a.name} ${a.id}`.toLowerCase().includes(search));
  $('#application-list').innerHTML=rows.length?`<div class="table-scroll"><table><thead><tr><th>Postulante</th><th>Etapa</th><th>Estado</th><th>Fecha</th><th><span class="sr-only">Revisar</span></th></tr></thead><tbody>${rows.map(a=>`<tr><td><strong>${escape(a.name)}</strong><small>${escape(a.id)}</small></td><td><span class="stage-pill">0${a.stage} / 03</span></td><td>${badge(a.state)}</td><td>${date(a.created)}</td><td><button class="button secondary compact" data-app="${a.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="empty"><span class="empty-icon">≡</span><h3>Sin postulaciones en esta vista.</h3><p class="muted">${filter==='waiting'?'Las nuevas etapas aparecerán aquí cuando los usuarios las envíen.':'Cambia el filtro para consultar otros estados.'}</p></div>`;
  document.querySelectorAll('[data-app]').forEach(b=>b.onclick=()=>openDetail(b.dataset.app));
}
async function openDetail(id){try{selected=await call(`/applications/${id}`);renderDetail();if(!$('#detail-dialog').open)$('#detail-dialog').showModal();}catch(err){message(err.message);}}
function renderDetail(){
  const a=selected;
  $('#detail-content').innerHTML=`<div class="dialog-heading"><div><div class="eyebrow">REVISIÓN DE POSTULACIÓN</div>${a.avatar?`<img class="review-avatar" src="${escape(a.avatar)}" alt="Imagen de perfil de ${escape(a.name)}">`:""}<h2>${escape(a.name)}</h2><p class="muted">Etapa ${a.stage} · Correo del postulante privado</p></div><button id="close-detail" class="button secondary compact">Cerrar</button></div>${badge(a.state)}<div id="detail-error" class="message hidden" role="alert"></div><div class="detail-answers">${a.submissions.map(s=>`<details ${s.stage===a.stage?'open':''}><summary>Etapa ${s.stage} · ${escape(stages[s.stage-1].title)}</summary>${stages[s.stage-1].questions.map((q,i)=>`<div class="answer-block"><h3>${i+1}. ${escape(q.title)}</h3><p class="muted small">${escape(q.description)}</p>${q.fields.map(f=>`<strong>${escape(f.label)}</strong><p>${escape(s.answers[f.id])}</p>`).join('')}</div>`).join('')}</details>`).join('')}</div>${a.decisions.length?`<div class="decision-history"><h3>Historial de decisiones</h3>${a.decisions.map(d=>`<div class="review-note"><strong>Etapa ${d.stage} · ${d.decision==='approve'?'Aprobada':'Rechazada'} por ${escape(d.reviewer)}</strong><small>${date(d.created)}</small><p>${escape(d.reason)}</p></div>`).join('')}</div>`:''}<div class="notification-list"><h3>Notificaciones</h3><p class="muted small">“Enviado” indica que el servicio aceptó el envío; no confirma lectura ni llegada a la bandeja de entrada.</p>${a.notifications.map(n=>`<div class="notification-row"><div><strong>${n.kind==='dm'?'MD de Discord':n.kind==='email'?'Correo anterior':'Canal de Discord'} · Etapa ${n.stage}</strong><small>${n.event==='submitted'?'Recepción':n.event==='approved'?'Aprobación':'Rechazo'} · ${n.delivered?'Enviado':n.attempts?'Reintento pendiente':'En cola'}${n.last_error?` · ${escape(n.last_error)}`:''}</small></div>${!n.delivered&&n.attempts?`<button class="button secondary compact" data-retry="${n.id}">Reintentar</button>`:''}</div>`).join('')}</div>${a.state==='waiting'?`<form id="decision-form" class="decision-form"><h3>Decisión sobre la etapa ${a.stage}</h3><label for="reason">Motivo de la decisión</label><textarea id="reason" minlength="20" maxlength="2000" rows="4" required placeholder="Explica qué valoraste y por qué tomas esta decisión."></textarea><p class="muted small">Este motivo será visible para el postulante. Mínimo 20 caracteres.</p><div class="form-actions"><button class="button danger" type="submit" value="reject">Rechazar postulación</button><button class="button primary" type="submit" value="approve">${a.stage===3?'Aprobar postulación':'Aprobar etapa '+a.stage}</button></div></form>`:''}`;
  $('#close-detail').onclick=()=>$('#detail-dialog').close();
  document.querySelectorAll('[data-retry]').forEach(b=>b.onclick=async()=>{const finish=busy(b,'En cola…');try{await call('/notifications/retry',{method:'POST',body:{id:b.dataset.retry}});await openDetail(a.id);}catch(err){detailError(err.message);}finally{finish();}});
  if($('#decision-form'))$('#decision-form').onsubmit=async e=>{
    e.preventDefault();const decision=e.submitter.value,reason=$('#reason').value.trim();if(reason.length<20){detailError('Explica tu decisión con al menos 20 caracteres.');return;}
    const buttons=[...$('#decision-form').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    try {selected=await call(`/applications/${a.id}/decision`,{method:'POST',body:{decision,reason,version:a.version}});renderDetail();await loadApplications();}
    catch(err){detailError(err.message);buttons.forEach(b=>b.disabled=false);if(err.status===409){await loadApplications();}}
  };
}
function detailError(text){$('#detail-error').textContent=text;$('#detail-error').classList.remove('hidden');$('#detail-error').scrollIntoView({behavior:'smooth'});}
async function loadTeam(){
  try{
    const data=await call('/team');
    $('#content').innerHTML=`<div class="section-heading"><div class="eyebrow">ADMINISTRACIÓN</div><h1>Equipo y permisos</h1><p class="muted">Las cuentas autorizadas pueden ver postulaciones y aprobar o rechazar etapas. Solo la administradora gestiona estos permisos.</p></div><div class="panel"><h3>Autorizar una cuenta de Discord</h3><p class="muted small">Pide el ID de usuario a tu compañero. En Discord puede activar el modo desarrollador y copiar su ID. No uses el ID de un servidor ni el de una aplicación.</p><form id="grant-form" class="invite-grid"><input id="legacy-member" type="hidden"><div class="field"><label for="staff-name">Nombre del integrante</label><input id="staff-name" minlength="2" maxlength="80" required></div><div class="field"><label for="staff-discord">ID de usuario de Discord</label><input id="staff-discord" inputmode="numeric" pattern="[0-9]{17,20}" maxlength="20" required></div><button id="grant-button" class="button primary">Autorizar acceso</button></form><p id="grant-note" class="muted small">Al entrar con esa cuenta verá el botón Panel de Administración en su perfil. Estos permisos los gestiona esta página.</p></div><div class="panel"><h3>Integrantes</h3>${data.team.map(s=>`<div class="notification-row"><div><strong>${escape(s.name)}</strong><small>${s.discordId?escape(s.discordId):'Cuenta anterior: necesita vincular Discord'} · ${s.role==='admin'?'Administradora':s.active&&s.discordId?'Staff activo':'Sin acceso'}</small></div>${s.role==='staff'?s.discordId?s.active?`<button data-remove="${s.id}" class="button danger compact">Desactivar acceso</button>`:`<button data-enable="${s.id}" class="button secondary compact">Reactivar acceso</button>`:`<button data-bind="${s.id}" class="button secondary compact">Vincular Discord</button>`:''}</div>`).join('')}</div><div class="panel"><h3>Actividad reciente</h3>${data.audit.map(a=>`<div class="audit-row"><strong>${escape(a.reviewer||'Equipo')}</strong><span>${escape({login:'Inicio de sesión',approve:'Aprobación',reject:'Rechazo',granted_staff:'Acceso autorizado',linked_staff:'Discord vinculado',reactivated:'Acceso reactivado',invited:'Invitación anterior',deactivated:'Acceso desactivado',notification_retry:'Notificación en cola',password_changed:'Cambio anterior de contraseña'}[a.action]||a.action)}</span><small>${date(a.created)}</small></div>`).join('')||'<p class="muted">Todavía no hay actividad.</p>'}</div>`;
    $('#grant-form').onsubmit=async e=>{
      e.preventDefault();const finish=busy(e.submitter,'Autorizando…');
      try{await call('/team',{method:'POST',body:{name:$('#staff-name').value,discordId:$('#staff-discord').value,...($('#legacy-member').value?{memberId:$('#legacy-member').value}:{})}});await loadTeam();message('Acceso autorizado. El integrante puede entrar con su cuenta de Discord.','success');}catch(err){message(err.message);}finally{finish();}
    };
    document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{const finish=busy(b,'Desactivando…');try{await call(`/team/${b.dataset.remove}`,{method:'DELETE'});await loadTeam();}catch(err){message(err.message);}finally{finish();}});
    document.querySelectorAll('[data-enable]').forEach(b=>b.onclick=async()=>{const member=data.team.find(s=>s.id===b.dataset.enable),finish=busy(b,'Reactivando…');try{await call('/team',{method:'POST',body:{name:member.name,discordId:member.discordId}});await loadTeam();}catch(err){message(err.message);}finally{finish();}});
    document.querySelectorAll('[data-bind]').forEach(b=>b.onclick=()=>{const member=data.team.find(s=>s.id===b.dataset.bind);$('#legacy-member').value=member.id;$('#staff-name').value=member.name;$('#staff-discord').value='';$('#grant-button').textContent='Vincular Discord';$('#grant-note').textContent='Vinculando la cuenta anterior de '+member.name+'. Su historial de decisiones se conservará.';$('#staff-discord').focus();$('#grant-form').scrollIntoView({behavior:'smooth'});});
  }catch(err){message(err.message);}
}
boot();
