import {writeFileSync} from 'node:fs';
const input=process.env.PUBLIC_API_URL;
if(!input) throw new Error('Configura PUBLIC_API_URL con la URL HTTPS pública de la API en Render.');
let url;try{url=new URL(input);}catch{throw new Error('PUBLIC_API_URL debe incluir https:// y el dominio de la API.');}
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.hostname.endsWith('.internal')) throw new Error('PUBLIC_API_URL debe ser un origen HTTPS público, sin rutas, parámetros ni credenciales.');
writeFileSync(new URL('../web/config.js',import.meta.url),`// Dirección pública; las claves permanecen exclusivamente en la API.\nwindow.STAFF_API_URL = ['localhost','127.0.0.1'].includes(window.location.hostname) ? '' : ${JSON.stringify(url.origin)};\n`);
console.log('API pública configurada para la web.');
