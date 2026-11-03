# Portal UIE — Render Free + Neon Free + Netlify

Versión 2.3.0. La API conserva el formulario por etapas, OAuth de Discord, permisos por cuenta, privacidad del correo y notificaciones por MD.

## Alojamiento gratuito

- Render Free: API Node.js 24, sin disco.
- Neon Free: Postgres persistente, dentro de sus cuotas.
- Netlify Free: página HTML/CSS/JS.

render.yaml solicita explícitamente el plan free y no contiene discos ni recursos de pago. DATABASE_MODE=postgres exige DATABASE_URL para impedir que un despliegue gratuito utilice SQLite efímero por accidente.

Las ofertas gratuitas tienen cuotas: no representan capacidad ilimitada ni disponibilidad garantizada. Render duerme tras 15 minutos sin tráfico; la siguiente visita puede tardar en despertar la API. Los reintentos de notificaciones permanecen guardados, pero no se ejecutan mientras el servicio está dormido. No se utiliza Render Postgres Free, cuya base caduca a los 30 días.

## Configuración

Lee EMPIEZA-AQUI.md junto a esta carpeta.

En Render: DATABASE_URL es la conexión privada de Neon, DATABASE_MODE=postgres, NODE_ENV=production y PUBLIC_WEB_URL es el dominio público de Netlify. Las claves Discord permanecen exclusivamente en Render.

En Netlify: PUBLIC_API_URL es la URL HTTPS pública real de Render. El build node scripts/configure-web.mjs genera web/config.js y rechaza URLs incompletas o inseguras. Publica solo web.

Si DISCORD_REDIRECT_URI no se configura, la API calcula el callback con RENDER_EXTERNAL_URL. Debes autorizar esa URL exacta en Discord Developer Portal.

## Datos y transacciones

La API usa operaciones asíncronas y transacciones en una sola conexión. Las decisiones de Staff se actualizan con comprobación atómica de versión y los avisos se reclaman antes de enviarlos. El worker evita consultar continuamente una base sin notificaciones pendientes, para favorecer el reposo de Neon.

SQLite sigue disponible para desarrollo local. Para mover datos existentes se incluye scripts/import-sqlite.mjs: comprueba la integridad, exige destino vacío e importa dentro de una transacción. No borra ni combina bases ocupadas.

## Pruebas

npm ci
npm test

La batería cubre SQLite y un motor PostgreSQL local real mediante PGlite. Discord está simulado; las pruebas no envían avisos reales. La validación local no equivale a un despliegue verificado en Render/Neon.

Los pasos del manual LEEME-ANTERIOR-RAILWAY.md corresponden únicamente al alojamiento anterior.
