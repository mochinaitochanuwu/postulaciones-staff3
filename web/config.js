// API pública de Railway; las credenciales se configuran solo en Railway.
window.STAFF_API_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? ''
  : 'https://postulaciones-staff3-production.up.railway.app';
