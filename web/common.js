export const $=selector=>document.querySelector(selector);
export const escape = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const date = value=>new Date(value).toLocaleString('es-HN',{dateStyle:'medium',timeStyle:'short'});
export const states={waiting:'Pendiente de revisión',draft:'Siguiente etapa habilitada',accepted:'Aprobada',rejected:'Rechazada',expired:'Vencida'};
export function message(text,type='error') {const el=$('#message');el.textContent=text;el.className=`message ${type}`;el.focus();}
export function clearMessage() {$('#message').classList.add('hidden');}
export async function api(path,{method='GET',body,token}={}) {
  const base=(window.STAFF_API_URL||'').replace(/\/$/,'');
  let response;
  try {response=await fetch(`${base}/api${path}`,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});}
  catch {throw new Error('No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.');}
  let data;try {data=await response.json();}catch {throw new Error('La conexión con el servidor no está configurada correctamente.');}
  if(!response.ok) throw Object.assign(new Error(data.error||'No se pudo completar la solicitud.'),{status:response.status,fields:data.fields});
  return data;
}
export function busy(button,text) {const old=button.textContent;button.disabled=true;button.textContent=text;return ()=>{button.disabled=false;button.textContent=old;};}
export function badge(state) {return `<span class="badge ${escape(state)}">${states[state]||escape(state)}</span>`;}
