import {stages,validateAnswers} from './questions.js';
import {$,escape,message,clearMessage,api,busy,badge,date} from './common.js';
let app=null,profile=null,token=sessionStorage.getItem('applicant-session')||'',questionIndex=0,stage=1,info=null;
let answers={},consent=false,pendingAvatar=undefined;
const fragment=new URLSearchParams(location.hash.slice(1));
let requestedApp=sessionStorage.getItem('requested-application')||'';
let legacyToken=sessionStorage.getItem('legacy-application-link')||'';
if(fragment.has('sesion')){token=fragment.get('sesion');sessionStorage.setItem('applicant-session',token);}
if(fragment.has('postulacion')){
  const value=fragment.get('postulacion');
  if(value.includes('.')){legacyToken=value;sessionStorage.setItem('legacy-application-link',value);requestedApp=value.split('.')[0];}
  else requestedApp=value;
  sessionStorage.setItem('requested-application',requestedApp);
}
const loginError=fragment.get('error');
if(location.hash)history.replaceState(null,'',location.pathname);
const call=(path,options={})=>api(path,{...options,token});
function draftKey(){return `staff-draft:${profile.id}:${stage}`;}
function requestKey(){return `staff-request:${profile.id}`;}
function loadDraft(){try{const draft=JSON.parse(sessionStorage.getItem(draftKey())||'{}');answers=draft.answers||{};consent=!!draft.consent;}catch{answers={};consent=false;}if(stage===1)answers.discordId=profile.discordId;}
function saveDraft(){sessionStorage.setItem(draftKey(),JSON.stringify({answers,consent}));}
function requestId(){let id=sessionStorage.getItem(requestKey());if(!id){id=crypto.randomUUID();sessionStorage.setItem(requestKey(),id);}return id;}
function progress(){
  $('#stage-progress').innerHTML=stages.map((s,i)=>`<div class="stage-item ${i+1===stage?'current':''} ${i+1<stage?'complete':''}"><span class="stage-number">${i+1<stage?'✓':`0${i+1}`}</span><div><strong>${escape(s.title)}</strong><small>${i+1<stage?'Aprobada':i+1===stage?(app?.state==='waiting'?'En revisión':'Etapa actual'):'Se habilita tras aprobación'}</small></div>${i+1>stage?'<span class="lock" aria-label="Bloqueada">○</span>':''}</div>`).join('');
}
function avatarMarkup(avatar,name,className='profile-avatar'){
  return avatar?`<img class="${className}" src="${escape(avatar)}" alt="Imagen de perfil de ${escape(name)}">`:`<span class="${className} avatar-placeholder" aria-hidden="true">${escape(name.slice(0,1).toUpperCase()||'S')}</span>`;
}
function userActions(){
  $('#user-actions').innerHTML=profile?`${profile.staff?'<a id="admin-panel" class="staff-access" href="staff.html">Panel de Administración</a>':''}<button id="my-profile" class="text-button">Mi perfil</button><button id="logout-user" class="text-button">Salir</button>`:'';
  if(profile){$('#my-profile').onclick=()=>{clearMessage();loadProfile();};$('#logout-user').onclick=logout;}
}
async function logout(){
  try{await call('/auth/logout',{method:'POST',body:{}});}catch{}
  for(const key of Object.keys(sessionStorage))if(key.startsWith(`staff-draft:${profile.id}:`)||key===requestKey())sessionStorage.removeItem(key);
  token='';profile=null;app=null;answers={};consent=false;stage=1;questionIndex=0;
  sessionStorage.removeItem('applicant-session');sessionStorage.removeItem('requested-application');sessionStorage.removeItem('legacy-application-link');
  requestedApp='';legacyToken='';clearMessage();renderLogin();
}
function renderLogin(){
  userActions();progress();
  $('#content').innerHTML=`<div class="applicant-login"><div class="eyebrow">POSTULACIÓN AL STAFF</div><h2>Tu cuenta.<br>Tu postulación.</h2><p class="muted">Entra con Discord para crear tu perfil y empezar el formulario. Tu avance quedará vinculado a esa cuenta.</p><div class="login-benefits"><div><span>01</span><p><strong>Un código personal</strong><br>Una postulación por cuenta de Discord.</p></div><div><span>02</span><p><strong>Tu correo, privado</strong><br>Los revisores no reciben tu dirección.</p></div><div><span>03</span><p><strong>Decisiones por Discord</strong><br>El bot te avisará por mensaje directo.</p></div></div><button id="discord-login" class="button primary full" ${info?.discordConfigured?'':'disabled'}>Registrarse con Discord</button><button id="discord-signin" class="button secondary full" ${info?.discordConfigured?'':'disabled'}>Iniciar sesión con Discord</button><p class="muted small login-help">${info?.discordConfigured?'Necesitas una cuenta de Discord con correo verificado. Tu correo se usa para verificar tu cuenta y evitar duplicados. Los avisos llegan por MD de Discord.':'El acceso con Discord todavía no está configurado. Puedes consultar con la administradora.'}</p><p class="muted small">El primer acceso crea tu perfil; si ya tienes cuenta, volverás a tu mismo perfil.</p></div>`;
  $('#discord-signin').onclick=$('#discord-login').onclick=()=>{location.assign(`${(window.STAFF_API_URL||'').replace(/\/$/,'')}/api/auth/discord/start`);};
}
function notificationNotice(){
  const failed=app?.notifications?.filter(job=>!job.delivered&&job.last_error).at(-1);
  return `<div class="review-note"><strong>Avisos por MD de Discord</strong><p>${failed?'El bot no pudo entregar un aviso. Habilita los mensajes directos de miembros del servidor, comprueba que compartes un servidor con el bot y pide al Staff que reintente el envío. Tu resultado sigue disponible aquí.':'Permite los mensajes directos de miembros del servidor y comparte un servidor con el bot para recibir los avisos. También puedes consultar tu resultado aquí.'}</p></div>`;
}
function renderProfile(){
  stage=app?.stage||1;progress();userActions();
  const application=profile.application,continuing=app?.state==='draft',closed=['accepted','rejected','expired'].includes(app?.state);
  const action=application?(continuing?`Continuar etapa ${app.stage}`:'Ver mi postulación'):(sessionStorage.getItem(`staff-draft:${profile.id}:1`)?'Continuar borrador':'Empezar postulación');
  const last=app?.decisions.at(-1);
  $('#content').innerHTML=`<div class="section-heading"><div class="eyebrow">MI PERFIL</div><h2>Hola, ${escape(profile.name)}.</h2><p class="muted">Desde aquí puedes personalizar tu perfil y acceder a tu postulación.</p></div><div class="profile-card"><div class="profile-overview">${avatarMarkup(profile.avatar,profile.name)}<div><h3>${escape(profile.name)}</h3><p class="muted">Discord verificado · ${escape(profile.discordId)}</p><button id="edit-profile" class="button secondary compact">Personalizar perfil</button></div></div><div class="private-email"><strong>Correo verificado de Discord</strong><p>${escape(profile.email)}</p><small>Solo tú puedes verlo aquí. Se usa para verificar tu cuenta y evitar duplicados; no se envían correos.</small></div><div class="reference">Código personal de postulación<strong>${escape(profile.code)}</strong></div></div><div class="application-card"><div class="eyebrow">TU POSTULACIÓN</div>${application?badge(app.state):'<span class="badge">Lista para empezar</span>'}<h3>${application?(continuing?`La etapa ${app.stage} está habilitada.`:app.state==='waiting'?'El Staff está revisando tus respuestas.':app.state==='accepted'?'Tu postulación fue aprobada.':app.state==='expired'?'Tu postulación venció.':'Consulta la decisión del equipo.'):'Completa la primera etapa.'}</h3><p class="muted">${application?(closed?'Esta cuenta ya tiene una postulación registrada. Puedes consultar sus respuestas y decisiones.':continuing?'Continúa con la siguiente etapa. Te avisaremos por MD de Discord después de la revisión.':'El bot te enviará un MD de Discord cuando el Staff apruebe o rechace esta etapa.'):'Responde las preguntas con tus propias palabras. Las siguientes etapas se habilitarán cuando el Staff apruebe la anterior.'}</p>${notificationNotice()}${last?`<div class="review-note"><strong>Último motivo del Staff</strong><p>${escape(last.reason)}</p></div>`:''}<div class="profile-buttons"><button id="start-application" class="button primary">${action}</button><button id="refresh-profile" class="button secondary">Actualizar estado</button></div></div><p class="muted small">Tu código se conserva al volver a entrar. No cambia al usar otro navegador.</p>`;
  $('#edit-profile').onclick=editProfile;
  $('#refresh-profile').onclick=loadProfile;
  $('#start-application').onclick=()=>{clearMessage();if(!application || continuing){stage=app?.stage||1;questionIndex=0;loadDraft();renderForm();scrollTop();}else renderStatus();};
}
function editProfile(){
  pendingAvatar=undefined;
  $('#content').innerHTML=`<div class="section-heading"><div class="eyebrow">PERSONALIZAR PERFIL</div><h2>Hazlo tuyo.</h2><p class="muted">El alias y tu imagen pueden ser vistos por el Staff al revisar tu postulación.</p></div><form id="profile-form" class="profile-card"><div id="avatar-preview">${avatarMarkup(profile.avatar,profile.name)}</div><div class="field"><label for="profile-name">Nombre o alias</label><input id="profile-name" minlength="2" maxlength="80" value="${escape(profile.name)}" required></div><div class="field"><label for="avatar-file">Imagen de perfil personalizada</label><input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><small>PNG, JPG, WebP o GIF · Máximo 5 MB. Se recortará al centro y se guardará como imagen estática.</small></div><button id="remove-avatar" type="button" class="button secondary compact">Quitar imagen</button><div class="form-actions"><button id="back-profile" type="button" class="button secondary">Volver</button><button id="save-profile" type="submit" class="button primary">Guardar perfil</button></div></form>`;
  $('#back-profile').onclick=renderProfile;
  $('#remove-avatar').onclick=()=>{pendingAvatar=null;$('#avatar-file').value='';$('#avatar-preview').innerHTML=avatarMarkup(null,profile.name);};
  $('#avatar-file').onchange=async()=>{
    const file=$('#avatar-file').files[0];if(!file)return;
    const button=$('#save-profile');button.disabled=true;
    try{
      if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>5*1024*1024)throw new Error('Selecciona una imagen PNG, JPG, WebP o GIF de hasta 5 MB.');
      const bitmap=await createImageBitmap(file);
      if(bitmap.width*bitmap.height>25000000){bitmap.close();throw new Error('Esta imagen es demasiado grande. Usa una versión de menor resolución.');}
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
      const side=Math.min(bitmap.width,bitmap.height);canvas.getContext('2d').drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,256,256);bitmap.close();
      pendingAvatar=canvas.toDataURL('image/png');$('#avatar-preview').innerHTML=avatarMarkup(pendingAvatar,profile.name);clearMessage();
    }catch(error){pendingAvatar=undefined;$('#avatar-file').value='';message(error.message);}finally{button.disabled=false;}
  };
  $('#profile-form').onsubmit=async event=>{event.preventDefault();const finish=busy(event.submitter,'Guardando…');try{profile=await call('/profile',{method:'POST',body:{name:$('#profile-name').value,...(pendingAvatar!==undefined?{avatar:pendingAvatar}:{})}});clearMessage();renderProfile();message('Perfil actualizado.','success');}catch(error){message(error.message);}finally{finish();}};
}
function fieldMarkup(field){
  const value=answers[field.id]||'',verified=field.id==='discordId';
  return `<div class="field"><label for="${field.id}">${escape(field.label)}</label>${field.type==='textarea'?`<textarea id="${field.id}" name="${field.id}" rows="5" maxlength="6000" aria-describedby="${field.id}-help ${field.id}-error">${escape(value)}</textarea>`:`<input id="${field.id}" name="${field.id}" type="${field.type}" value="${escape(value)}" ${field.type==='number'?`min="${field.minimum}" max="${field.maximum}"`:''} ${verified?'readonly':''} maxlength="6000" aria-describedby="${field.id}-help ${field.id}-error">`}<div class="field-bottom"><span id="${field.id}-help">${verified?'Comprobado con tu cuenta de Discord':field.min>=30?`Mínimo ${field.min} caracteres · Máximo 6000`:'Dato obligatorio'}</span><span class="counter" data-count="${field.id}">${value.length}${field.min>=30?` / ${field.min} mín.`:''}</span></div><p class="field-error" id="${field.id}-error"></p></div>`;
}
function renderForm(){
  progress();const current=stages[stage-1],question=current.questions[questionIndex],last=questionIndex===current.questions.length-1;
  $('#content').innerHTML=`<div class="section-heading"><div class="eyebrow">ETAPA 0${stage} / 03</div><h2>${escape(current.title)}</h2><p class="muted">${escape(current.intro)}</p></div><div class="instruction"><span class="instruction-symbol">i</span><p>${escape(current.instruction)}</p></div><div class="question-track"><span>Pregunta ${questionIndex+1} de ${current.questions.length}</span><span class="draft-hint">Borrador en esta pestaña</span></div><div class="track"><div></div></div><form id="question-form" novalidate><div class="question-heading"><span class="question-number">${String(questionIndex+1).padStart(2,'0')}</span><h3>${escape(question.title)}</h3></div><p class="question-description">${escape(question.description)}</p>${stage===1&&questionIndex===0?`<div class="identity-summary"><strong>${escape(profile.name)}</strong><p>Postulando con tu cuenta verificada de Discord. Tu correo se mantiene privado.</p></div>`:''}${question.fields.map(fieldMarkup).join('')}${last?`<div class="declaration"><h4>Antes de enviar</h4><p>${stage===3?'Confirmas que tus datos son verdaderos, no ocultaste cuentas ALT relevantes, aceptas que tus acciones sean revisadas y entiendes que abusar de permisos puede provocar tu expulsión del equipo. El Staff podrá solicitar una entrevista o pruebas adicionales.':'Revisa tus respuestas. Esta etapa se enviará al Staff y quedará pendiente de aprobación. No podrás modificarla después del envío.'}</p><label class="check-label"><input id="consent" type="checkbox" ${consent?'checked':''}><span>Confirmo que la información es verdadera y acepto la revisión del Staff y los avisos de esta postulación por MD de Discord.</span></label></div>`:''}<div class="form-actions"><button type="button" id="previous" class="button secondary" ${questionIndex===0?'disabled':''}>Anterior</button><span class="muted form-position">${questionIndex+1} / ${current.questions.length}</span><button type="submit" class="button primary">${last?'Enviar etapa '+stage:'Siguiente pregunta'}</button></div></form><div class="below-form">Explica tu razonamiento. La extensión por sí sola no garantiza una buena respuesta. Puedes volver a tu perfil desde la barra superior.</div>`;
  document.querySelector('.track > div').style.width=`${Math.round((questionIndex+1)/current.questions.length*100)}%`;
  $('#question-form').addEventListener('input',event=>{
    const input=event.target;
    if(input.id==='consent')consent=input.checked;
    else if(question.fields.some(f=>f.id===input.name)){
      answers[input.name]=input.value;const field=question.fields.find(f=>f.id===input.name),counter=document.querySelector(`[data-count="${input.name}"]`);
      if(counter)counter.textContent=`${input.value.length}${field.min>=30?` / ${field.min} mín.`:''}`;
      input.removeAttribute('aria-invalid');const error=document.getElementById(`${input.name}-error`);if(error)error.textContent='';
    }
    saveDraft();
  });
  $('#previous').onclick=()=>{questionIndex--;clearMessage();renderForm();scrollTop();};
  $('#question-form').onsubmit=async event=>{
    event.preventDefault();clearMessage();if(stage===1)answers.discordId=profile.discordId;
    const errors=validateAnswers(stage,answers),ownErrors=Object.fromEntries(Object.entries(errors).filter(([key])=>question.fields.some(f=>f.id===key)));
    if(Object.keys(ownErrors).length){showErrors(ownErrors);return;}
    if(!last){questionIndex++;renderForm();scrollTop();return;}
    if(Object.keys(errors).length){const first=Object.keys(errors)[0];questionIndex=current.questions.findIndex(q=>q.fields.some(f=>f.id===first));renderForm();showErrors(errors);return;}
    if(!consent){message('Marca la declaración antes de enviar.');return;}
    const finish=busy(event.submitter,'Enviando…');
    try{
      if(stage===1){await call('/applications',{method:'POST',body:{answers,consent,requestId:requestId()}});sessionStorage.removeItem(requestKey());}
      else await call('/applicant/submit',{method:'POST',body:{stage,answers}});
      sessionStorage.removeItem(draftKey());app=await call('/applicant');profile=await call('/profile');renderStatus();
    }catch(error){if(error.fields)showErrors(error.fields);else message(error.message);}finally{finish();}
  };
}
function scrollTop(){window.scrollTo({top:0,behavior:'smooth'});}
function showErrors(errors){for(const [key,error] of Object.entries(errors)){const input=document.getElementById(key),el=document.getElementById(`${key}-error`);if(input&&el){el.textContent=error;input.setAttribute('aria-invalid','true');}}message('Completa las respuestas señaladas antes de continuar.');const first=Object.keys(errors).find(k=>document.getElementById(k));if(first)document.getElementById(first).focus();}
function renderStatus(){
  stage=app.stage;progress();userActions();const last=app.decisions.at(-1);
  const heading={waiting:'Tu etapa está en revisión.',accepted:'¡Tu postulación fue aprobada!',rejected:'Tu postulación no fue aprobada.',expired:'Tu postulación venció.',draft:`La etapa ${stage} está habilitada.`}[app.state];
  $('#content').innerHTML=`<div class="status-card"><div class="eyebrow">HOLA, ${escape(profile.name).toUpperCase()}</div>${badge(app.state)}<h2>${heading}</h2><p>${app.state==='waiting'?`Enviaste la etapa ${stage}. Te avisaremos por MD de Discord cuando el Staff tome una decisión.`:app.state==='accepted'?'El equipo se pondrá en contacto contigo para los siguientes pasos.':app.state==='expired'?'Contacta al Staff para consultar los siguientes pasos.':app.state==='draft'?'Puedes continuar con la siguiente etapa desde tu perfil.':'Puedes consultar el motivo del equipo a continuación.'}</p>${notificationNotice()}${last?`<div class="review-note"><strong>Motivo del Staff</strong><p>${escape(last.reason)}</p></div>`:''}<div class="profile-buttons"><button class="button primary" id="back-to-profile">${app.state==='draft'?'Continuar postulación':'Volver a mi perfil'}</button><button class="button secondary" id="refresh">Actualizar estado</button></div><div class="reference">Referencia <strong>${escape(app.id)}</strong></div></div><div class="submitted-summary"><h3>Tus etapas enviadas</h3>${app.submissions.map(s=>`<details><summary>Etapa ${s.stage} · ${escape(stages[s.stage-1].title)}<small>${date(s.submitted)}</small></summary>${stages[s.stage-1].questions.map(q=>`<div class="answer-block"><h4>${escape(q.title)}</h4>${q.fields.map(f=>`<strong>${escape(f.label)}</strong><p>${escape(s.answers[f.id])}</p>`).join('')}</div>`).join('')}</details>`).join('')}</div>`;
  $('#refresh').onclick=async()=>{try{app=await call('/applicant');profile=await call('/profile');renderStatus();}catch(error){message(error.message);}};
  $('#back-to-profile').onclick=()=>{if(app.state==='draft'){questionIndex=0;loadDraft();renderForm();scrollTop();}else renderProfile();};
}
async function loadProfile(){
  try{
    let loaded=await call('/profile'),claimError='';
    if(legacyToken){
      try{await call('/applicant/claim',{method:'POST',body:{legacyToken}});loaded=await call('/profile');}
      catch(error){claimError=error.message;}
      legacyToken='';sessionStorage.removeItem('legacy-application-link');
    }
    const loadedApp=loaded.application?await call('/applicant'):null;
    profile=loaded;app=loadedApp;clearMessage();renderProfile();
    if(requestedApp){const expected=requestedApp;requestedApp='';sessionStorage.removeItem('requested-application');if(app?.id===expected)renderStatus();else message('El enlace no corresponde a la postulación de esta cuenta de Discord.');}
    if(claimError)message(claimError);
  }catch(error){
    if(error.status===401){token='';profile=null;app=null;sessionStorage.removeItem('applicant-session');renderLogin();}
    else if(profile)renderProfile();
    else{renderLogin();}
    message(error.message);
  }
}
async function boot(){
  $('#content').innerHTML='<div class="status-card"><h2>Preparando tu acceso…</h2></div>';progress();
  try{info=await api('/info');if(info.local){$('#local-notice').classList.remove('hidden');$('#local-notice').textContent=`Prueba local. Discord: ${info.discordConfigured?'configurado':'sin configurar'}. MD: ${info.dmConfigured?'configurado':'sin configurar'}. Webhook: ${info.webhookConfigured?'configurado':'sin configurar'}.`;}}
  catch(error){renderLogin();message(error.message);return;}
  if(token)await loadProfile();else renderLogin();
  if(loginError)message(loginError);
}
boot();
