// API pública de Railway. Las claves y el token del bot van solo en Railway.
// En localhost, la API y la web se sirven juntas con npm start.
window.STAFF_API_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? ''
  : 'https://postulaciones-staff-production.up.railway.app';
