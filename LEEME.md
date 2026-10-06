# Postulaciones de Staff — Netlify + Railway

Versión 2.1 — Proyecto completo en español. La web usa HTML, CSS y JavaScript sin compilación. La API usa Node.js 24 y SQLite, sin paquetes externos. Este ZIP actualiza el código; no modifica tus despliegues hasta que lo subas a GitHub y lo publiques en Netlify y Railway.

## Qué incluye

- La primera versión extensa: etapa 1 con 7 preguntas, etapa 2 con 8 y etapa 3 con 12 situaciones y declaración final.
- Tres fortalezas con ejemplos, dos debilidades, cinco responsabilidades y preguntas que piden explicar las decisiones.
- Pantalla inicial con **Registrarse con Discord** e **Iniciar sesión con Discord**, perfil personal con imagen y botón visible **Empezar postulación**.
- Formulario por preguntas, adaptable al celular, con mínimos de extensión y borrador en la pestaña actual. La extensión no prueba la calidad: el Staff evalúa el contenido.
- Código personal estable y una postulación por cuenta de Discord. El servidor comprueba la identidad; otra cuenta no puede acceder al expediente ni enviar etapas por él.
- Mensajes directos de un bot de Discord al recibir una etapa y al aprobarla o rechazarla. Incluyen etapa, resultado, motivo y enlace a la web. La aprobación de la primera etapa habilita la segunda; la de la segunda habilita la tercera. No se utiliza Resend ni un dominio de correo.
- Webhook de Discord para cada envío y decisión. Las respuestas completas llegan en un archivo TXT para evitar el límite de los mensajes.
- Panel en `staff.html`: tus compañeros pueden revisar, aprobar y rechazar con su cuenta propia. El nombre del revisor y la justificación quedan registrados.
- Tú, como administradora, puedes autorizar IDs de Discord y desactivar su acceso. Los integrantes no pueden conceder permisos a otras personas.
- Envíos en cola con reintentos, validación en la API y protección contra decisiones simultáneas.

## Carpetas

| Archivo o carpeta | Para qué sirve |
| --- | --- |
| `web/index.html` | Registro, inicio de sesión, perfil y formulario |
| `web/staff.html` | Panel de revisión y permisos por ID de Discord |
| `web/questions.js` | Preguntas completas y reglas de validación |
| `web/config.js` | Dirección pública de tu API de Railway |
| `api/server.js` | API, OAuth de Discord, cuentas, aprobaciones y avisos |
| `api/avatar.js` | Validación de imágenes pequeñas y retirada de metadatos |
| `.env.example` | Variables de ejemplo, sin claves reales |
| `Dockerfile` y `railway.json` | Configuración de despliegue de la API |
| `netlify.toml` y `web/_headers` | Publicación y cabeceras de seguridad de la web |
| `tests/flow.test.js` | Pruebas de integración con proveedores simulados |

## Privacidad del correo del postulante

- El correo no aparece en el panel de revisión, ni para el Staff ni para la administradora.
- La API tampoco lo devuelve en listas, detalles o respuestas de aprobación/rechazo destinadas al Staff. No se oculta únicamente con CSS.
- Discord no recibe el correo en el mensaje ni en el archivo TXT. Si el destinatario se repite literalmente en el alias o las respuestas, se sustituye por `[correo privado]` al compartirlo con revisores.
- El correo se obtiene de la cuenta de Discord y debe estar confirmado allí. Se conserva internamente para verificar la cuenta y controlar solicitudes duplicadas. No se utiliza para enviar correos.
- Si el usuario cambia su correo verificado en Discord y vuelve a iniciar sesión, se actualiza su registro privado; los MD siguen llegando al mismo ID verificado de Discord. Los correos anteriores siguen ocultos en las respuestas al Staff y Discord.
- El propio postulante puede consultar sus datos después de entrar con su cuenta de Discord. Los enlaces del MD requieren esa misma cuenta: compartir un enlace no concede acceso al expediente.
- Las cuentas del Staff también entran con Discord. La lista del equipo muestra nombre, ID y permisos; no muestra sus correos.
- Si ya desplegaste la versión anterior, actualiza tanto la web de Netlify como la API de Railway. Los archivos previamente enviados a Discord no cambian automáticamente.

## 1. Probar en tu computadora

Instala Node.js **24.x**. Abre una terminal dentro de `staff-portal` y copia `.env.example` como `.env`. En PowerShell:

```powershell
Copy-Item .env.example .env
```

Edita `.env`: pon el **ID de tu cuenta personal de Discord** en `ADMIN_DISCORD_ID`, tu nombre en `ADMIN_NAME` y un secreto aleatorio en `APP_SECRET`. El ID personal no es el Client ID de la aplicación. Configura también las tres variables OAuth del apartado siguiente. Tanto la administradora como los postulantes entran con Discord.

Genera el secreto con:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Deja `NODE_ENV=development`, `PUBLIC_WEB_URL=http://localhost:3000` y `DB_PATH=./data/staff.sqlite`. Para probar sin envíos reales, deja vacíos `DISCORD_BOT_TOKEN` y `DISCORD_WEBHOOK_URL`.

```sh
npm start
```

Abre `http://localhost:3000`, pulsa **Iniciar sesión con Discord** y entra con la cuenta cuyo ID pusiste en `ADMIN_DISCORD_ID`. En tu perfil aparecerá **Panel de Administración**. No abras el HTML con doble clic: los módulos de JavaScript necesitan un servidor web.

Sin OAuth configurado no se puede iniciar sesión ni como postulante ni como Staff. No necesitas instalar paquetes: la API utiliza módulos de Node.js.

En modo local aparece un aviso con los servicios configurados. No hay un botón para inventar identidades ni saltarse el acceso de Discord. Puedes entrar con tu cuenta real después de configurar OAuth y probar aprobaciones desde el panel; deja el token del bot y el webhook vacíos si no quieres envíos externos durante la prueba.

```sh
npm test
```

Las pruebas no envían mensajes reales; Discord está simulado.

## Acceso a la web, el formulario y el panel del Staff

### Postulantes

1. Abren la dirección principal de Netlify.
2. Ven **Registrarse con Discord** e **Iniciar sesión con Discord**. Ambos botones verifican la misma identidad en Discord.
3. El primer acceso crea su perfil; los siguientes abren ese mismo perfil. No se crea una contraseña nueva para la web.
4. Pueden pulsar **Personalizar perfil** para cambiar su alias y subir una imagen PNG, JPG, WebP o GIF de hasta 5 MB.
5. Pulsan **Empezar postulación** para abrir la primera pregunta.
6. Después del envío, el perfil muestra el estado. Tras la aprobación pueden pulsar **Continuar etapa 2** y después **Continuar etapa 3**.

La imagen se recorta al centro a 256 × 256 píxeles, se convierte a PNG estático y se retirarán los metadatos. El correo aparece únicamente en el perfil del propio postulante.

### Administradora y compañeros de Staff

Todos entran desde la misma página principal y con su propia cuenta de Discord. La cuenta de `ADMIN_DISCORD_ID` recibe el permiso de administradora. Sus compañeros reciben acceso cuando tú autorizas sus IDs desde **Equipo y permisos**.

Solo esas cuentas ven **Panel de Administración** en la página principal. Las cuentas sin permiso no ven ese botón. Abrir `/staff.html` directamente tampoco concede acceso: la API comprueba el permiso vigente en cada consulta o decisión.

**Los permisos se conceden en esta web por ID de usuario.** Esta versión no sincroniza automáticamente los roles de un servidor de Discord. Aprobar la postulación de un candidato tampoco le concede acceso al panel: tú decides cuándo autorizarlo para revisar postulaciones.

## Configurar el inicio de sesión con Discord

OAuth verifica quién entra; el webhook recibe las postulaciones en el canal del Staff; el bot envía los avisos privados al postulante. Son tres configuraciones distintas.

1. Abre el [Discord Developer Portal](https://discord.com/developers/applications).
2. Crea una aplicación para tus postulaciones o usa una aplicación que controles.
3. Copia su **Application ID / Client ID**.
4. En **OAuth2**, copia o genera el **Client Secret**. Guárdalo únicamente en `.env` o en las variables de Railway.
5. En **OAuth2 → Redirects**, añade la dirección exacta de tu API seguida de `/api/auth/discord/callback`.

Ejemplo en línea:

```text
https://tu-api.up.railway.app/api/auth/discord/callback
```

Para la prueba en tu computadora, añade también:

```text
http://localhost:3000/api/auth/discord/callback
```

Pon estas variables en `.env` para probar localmente:

```text
DISCORD_CLIENT_ID=EL_ID_DE_TU_APLICACION
DISCORD_CLIENT_SECRET=EL_SECRETO_DE_TU_APLICACION
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
```

En Railway usa las mismas dos primeras variables y cambia `DISCORD_REDIRECT_URI` por la dirección HTTPS real de tu API. Guarda las variables y vuelve a desplegar o reinicia el servicio.

Los permisos solicitados por la web son únicamente `identify` y `email`. Para enviar MD necesitas instalar el bot, como se explica en el apartado 2. El inicio de sesión no solicita permisos de bot ni acceso a mensajes; no concedas permisos de Administrador. El usuario debe tener su correo verificado en Discord. La contraseña de Discord se introduce en Discord, no en este formulario.

Documentación oficial: [OAuth2 de Discord](https://docs.discord.com/developers/topics/oauth2) y [datos del usuario](https://docs.discord.com/developers/resources/user).

## Código único y límites contra cuentas alternativas

Cada cuenta de Discord tiene un código personal que se genera una sola vez y se conserva aunque cambie de navegador. Cada acceso crea un token de sesión secreto diferente, válido durante ocho horas. El código visible es una referencia: no sirve como contraseña ni permite abrir otra postulación.

- El servidor admite un solo expediente por cuenta de Discord, incluso después de aprobarlo, rechazarlo o vencerlo. El usuario consulta el expediente existente desde su perfil.
- El ID de Discord de la primera etapa está verificado y no se puede cambiar para suplantar otra identidad.
- Un correo ya vinculado a una cuenta de postulante no puede usarse simultáneamente en otra cuenta de Discord.
- Una cuenta diferente no puede utilizar el enlace, código o formulario de otro usuario para enviar etapas por él.
- **Esto no garantiza una persona física por formulario.** Alguien con otras cuentas de Discord y otros correos verificados podría crear otro perfil. El equipo debe revisar las cuentas ALT y los antecedentes para detectar esos casos.

## 2. Preparar el bot que envía los MD

1. En el [Discord Developer Portal](https://discord.com/developers/applications), abre la aplicación que utilizas para el inicio de sesión.
2. En **Bot → Token**, copia el token del bot. Si no lo tienes guardado, usa **Reset Token**: al regenerarlo tendrás que actualizarlo también en cualquier otro servicio que use ese mismo bot.
3. En Railway, abre **el servicio de la API → Variables** y añade `DISCORD_BOT_TOKEN` con ese token, sin anteponer `Bot ` ni comillas. No es el `DISCORD_CLIENT_SECRET`, la API key de Resend ni la URL del webhook.
4. Instala el bot en tu servidor: en **Installation** activa **Guild Install** y configura el enlace de instalación con el scope `bot`. Otra opción es **OAuth2 → URL Generator**, marcar solo `bot`, abrir el enlace e invitarlo al servidor. No necesita permisos de Administrador.
5. Los scopes del acceso de los postulantes siguen siendo `identify` y `email`. El scope `bot` se utiliza para invitarlo una vez; los postulantes no tienen que instalarlo en sus cuentas.
6. No actives intents privilegiados para esta función: el servidor envía MD mediante la API HTTP y no lee mensajes ni conecta al Gateway. El bot puede aparecer desconectado y aun así enviar estos avisos.
7. Los postulantes deben compartir un servidor con el bot y permitir sus mensajes directos. Un usuario que bloquea al bot o restringe sus MD puede impedir el aviso. En ese caso, el resultado queda visible en la web y el panel muestra el envío pendiente.

El destinatario se obtiene del ID verificado en el inicio de sesión. El alias y las respuestas del formulario no pueden cambiarlo. No se envían avisos a todos los integrantes del servidor; solo al dueño de cada postulación que aceptó recibirlos al enviar el formulario.

No pongas `DISCORD_BOT_TOKEN` en GitHub, HTML ni `web/config.js`. Mantén el webhook configurado para seguir recibiendo las respuestas en el canal privado.

Documentación: [crear e instalar un bot](https://docs.discord.com/developers/quick-start/getting-started), [crear un canal de MD](https://docs.discord.com/developers/resources/user#create-dm) y [enviar mensajes](https://docs.discord.com/developers/resources/message#create-message).

## 3. Preparar el webhook de Discord

En un canal privado del Staff, crea un webhook desde los ajustes de integraciones del canal y copia su URL. Debe tener el formato:

```text
https://discord.com/api/webhooks/ID/TOKEN
```

Se envían el evento, el ID de la postulación y un archivo con la etapa completa. El archivo contiene IDs y respuestas personales, pero no el correo del postulante: usa un canal accesible únicamente al equipo que evalúa. El webhook no aprueba nada por sí mismo; la aprobación se realiza desde el panel.

Documentación: [webhooks de Discord](https://docs.discord.com/developers/resources/webhook).

## 4. Subir la web a Netlify

Puedes arrastrar **solo la carpeta `web`** a [Netlify Drop](https://app.netlify.com/drop), o conectar un repositorio Git.

Si usas Git:

- Carpeta base: raíz del proyecto.
- Comando de compilación: vacío.
- Carpeta de publicación: `web`.

Netlify te dará una URL como `https://tu-comunidad.netlify.app`. Guárdala para Railway. No subas `.env`, la base de datos ni las claves dentro de la carpeta pública.

La primera publicación puede mostrar la pantalla de acceso antes de que la API esté lista; el inicio de sesión aún no funcionará. Termina los pasos 5 y 6 para activar la conexión.

Documentación: [despliegues manuales en Netlify](https://docs.netlify.com/deploy/create-deploys/).

## 5. Subir la API a Railway

1. Crea un repositorio con el proyecto completo; `.env` y `data/` están excluidos por `.gitignore`.
2. En Railway crea un servicio desde ese repositorio. Selecciona la raíz del proyecto; Railway encontrará el `Dockerfile`.
3. Añade un **volumen persistente** al servicio y móntalo en `/data`. Esto conserva postulaciones, cuentas, decisiones y notificaciones entre despliegues.
4. Usa **una sola réplica**. Esta implementación usa una base SQLite compartida dentro del volumen; no está diseñada para varias réplicas.
5. En las variables del servicio configura:

| Variable | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `PUBLIC_WEB_URL` | URL exacta de Netlify, por ejemplo `https://tu-comunidad.netlify.app` |
| `DB_PATH` | `/data/staff.sqlite` |
| `ADMIN_DISCORD_ID` | ID de usuario de tu cuenta personal de Discord |
| `ADMIN_NAME` | Tu nombre o alias |
| `APP_SECRET` | El secreto generado de 64 caracteres hexadecimales |
| `DISCORD_BOT_TOKEN` | Token de la sección Bot de tu aplicación de Discord |
| `DISCORD_WEBHOOK_URL` | URL de tu webhook privado |
| `TRUST_PROXY` | `true`, para el proxy de Railway |
| `DISCORD_CLIENT_ID` | Application ID / Client ID de tu aplicación de Discord |
| `DISCORD_CLIENT_SECRET` | Client Secret de esa aplicación |
| `DISCORD_REDIRECT_URI` | URL de tu API seguida de `/api/auth/discord/callback` |

Railway proporciona `PORT` y `RAILWAY_VOLUME_MOUNT_PATH` automáticamente. No reemplaces esas variables. La API comprueba que el volumen de Railway esté montado en `/data` y que las variables de producción estén completas.

6. Genera un dominio público para el servicio, como `https://tu-api.up.railway.app`.
7. Abre `https://tu-api.up.railway.app/health`: debe responder `{"ok":true}`.

Si Railway muestra error, revisa los logs: al iniciar se indican juntas las configuraciones de producción que faltan. No compartas claves ni URLs del webhook en capturas.

Documentación: [volúmenes de Railway](https://docs.railway.com/volumes) y [Dockerfiles](https://docs.railway.com/builds/dockerfiles).

## 6. Conectar Netlify con Railway

Abre `web/config.js` y coloca **solo la URL pública de la API**:

```js
window.STAFF_API_URL = 'https://tu-api.up.railway.app';
```

Vuelve a publicar la carpeta `web` en Netlify, o sube el cambio a Git si usas despliegue automático. El token del bot, el Client Secret y la URL del webhook van únicamente en Railway. Este ZIP ya apunta a `https://postulaciones-staff-production.up.railway.app` y usa la API local automáticamente al abrirlo en localhost.

Si añades un dominio propio a la API, cambia también `connect-src` en `web/_headers` y `netlify.toml`: sustituye `https://*.up.railway.app` por el dominio HTTPS exacto de tu API. Si cambias el dominio de la web, actualiza `PUBLIC_WEB_URL` y revisa la conexión de `web/config.js`.

## 7. Dar acceso a tus compañeros

1. Entra desde la dirección principal de Netlify con la cuenta de Discord cuyo ID configuraste en `ADMIN_DISCORD_ID`.
2. Pulsa **Panel de Administración** y abre **Equipo y permisos**.
3. Escribe el nombre y el **ID de usuario de Discord** de tu compañero; pulsa **Autorizar acceso**. Puedes autorizarlo antes de que se registre en esta web.
4. Tu compañero entra con esa misma cuenta de Discord. En su perfil verá **Panel de Administración**. Si ya estaba dentro, debe pulsar **Mi perfil** o **Actualizar estado** para actualizar sus permisos.
5. Puedes pulsar **Desactivar acceso** o **Reactivar acceso** en la lista del equipo.

Los Staff autorizados pueden ver postulaciones, aprobar o rechazar etapas y reintentar notificaciones. Solo la administradora puede gestionar el equipo. Al desactivar una cuenta, las siguientes solicitudes al panel se bloquean de inmediato; la persona conserva su perfil de postulante.

Las sesiones de Discord duran ocho horas y se conservan al recargar la misma pestaña. Al pulsar **Salir** se revoca esa sesión para el perfil y para el panel. La contraseña y la recuperación de la cuenta se gestionan en Discord.

Para copiar un ID personal, activa el modo desarrollador en Discord y usa **Copiar ID de usuario** sobre el perfil de la persona. Un ID de servidor, de rol o de aplicación no identifica a un integrante.

## 8. Prueba real antes de compartir el formulario

1. Entra con una cuenta de Discord cuyo correo esté verificado y que no tenga permiso de Staff. Confirma que no aparece el botón del panel y que `/staff.html` bloquea su acceso. Personaliza el perfil y pulsa **Empezar postulación**.
2. Comprueba que llega el MD de recepción y que Discord recibe el TXT completo.
3. Autoriza otro ID desde **Equipo y permisos**. Entra con esa cuenta, confirma que aparece el botón del panel y aprueba con una justificación.
4. Comprueba que llega el MD de aprobación. Su enlace pide entrar con la misma cuenta de Discord antes de continuar con la segunda etapa.
5. Prueba también una postulación rechazada y el acceso desde un celular.

Los enlaces del MD contienen la referencia del expediente y requieren iniciar sesión como su propietario. Las postulaciones pendientes vencen a los 90 días; la cuenta conserva su expediente para consultar lo ocurrido y no puede crear un duplicado. Contacta con el Staff para consultar una postulación vencida.

## Notificaciones y mantenimiento

- Guardar una postulación o una decisión y poner sus notificaciones en cola ocurre en una misma transacción. Un fallo del proveedor no borra la postulación.
- La API intenta cada envío hasta ocho veces con espera creciente. En el detalle de la postulación puedes ver errores y pulsar **Reintentar**.
- Cada MD usa un `nonce` estable y `enforce_nonce` para reducir duplicados en reintentos recientes. Discord solo conserva esa deduplicación durante unos minutos: todavía puede haber duplicados en reintentos posteriores. Los webhooks también pueden duplicarse si se pierde la confirmación.
- “Enviado” significa que Discord confirmó el mensaje, no que el usuario lo haya leído. Los errores de MD bloqueado, token inválido y límites de envío quedan en la cola. Un límite de Discord pausa los siguientes MD y respeta su espera; no bloquea el webhook ni la decisión.
- Si el bot no pudo enviar un MD, el postulante ve un aviso en su perfil. Después de habilitar MD, el Staff puede abrir su postulación y pulsar **Reintentar** en el aviso pendiente. No vuelvas a aprobar una etapa solo para enviar otro aviso.
- Mantén `APP_SECRET` estable: se utiliza para reconocer de forma segura enlaces de las versiones anteriores.
- Guarda copias de seguridad del volumen de Railway. No borres el volumen para volver a desplegar.
- Las postulaciones y respuestas no se borran automáticamente. Define con tu equipo cuándo eliminarlas; este proyecto no incluye un panel de eliminación. El acceso se recupera a través de Discord.
- La protección contra abuso usa límites por IP, una cuenta verificada de Discord y control de duplicados. No incluye CAPTCHA ni verificación de identidad física.
- Los postulantes entran con Discord. La aprobación se realiza en la web con las cuentas individuales de Staff, sin botones de aprobación en el canal de Discord.

## Actualizar una instalación anterior

1. Conserva tu `.env`, tu base de datos y el volumen de Railway. No borres `data/` ni `/data`.
2. Sustituye el código por esta versión. La API añade automáticamente las tablas y columnas necesarias sin borrar cuentas de Staff ni respuestas.
3. Añade `DISCORD_BOT_TOKEN` en Railway e invita el bot a tu servidor. Conserva `ADMIN_DISCORD_ID`, las tres variables OAuth, `APP_SECRET`, `DB_PATH` y `DISCORD_WEBHOOK_URL`. `RESEND_API_KEY` y `MAIL_FROM` ya no se utilizan y puedes eliminarlas. No necesitas esperar la verificación DNS de Resend. Si vienes de una versión con contraseñas, configura también el ID personal y OAuth; `ADMIN_EMAIL` y `ADMIN_PASSWORD` no se usan para entrar.
4. Revisa `web/config.js`: esta versión ya apunta a tu API `https://postulaciones-staff-production.up.railway.app`. Configura `PUBLIC_WEB_URL` en Railway con la dirección exacta del sitio de Netlify que vas a utilizar, especialmente si creaste uno nuevo.
5. Sube el código actualizado a GitHub y despliega la API en Railway y `web` en Netlify. Aplica también los cambios pendientes de variables. Abre `/health` y comprueba un MD de recepción y uno de aprobación con tu propia cuenta.

Los avisos de correo pendientes se convierten automáticamente en MD; los correos ya entregados se conservan como historial. No se envía por correo ningún aviso nuevo. Los expedientes anteriores sin una cuenta de Discord vinculada no reciben MD hasta que su dueño complete la vinculación: no se usa el ID que alguien escribió sin verificar en un formulario.

El primer inicio con permisos de Discord vincula tu registro anterior de administradora a `ADMIN_DISCORD_ID`; después no permite cambiarlo silenciosamente desde las variables. En **Equipo y permisos**, vincula cada cuenta anterior de Staff a su ID usando **Vincular Discord**. Así se conserva su historial. El acceso antiguo con correo, contraseña o invitaciones queda deshabilitado.

Los expedientes antiguos siguen visibles para el Staff autorizado. Un postulante puede vincular su expediente antiguo abriendo el enlace original del correo y entrando con Discord. Deben coincidir el ID de Discord, el correo verificado y el enlace anterior; si no coinciden, debe contactar con el Staff. Compartir un enlace anterior ya no permite acceder sin iniciar sesión.

## Validación realizada

Pasaron 23 pruebas de integración: etapas, permisos por Discord, revocación inmediata, cierre de accesos antiguos, concurrencia, rechazo, sesiones, persistencia, privacidad, OAuth, bloqueo de duplicados, propiedad del expediente, imágenes y vinculación de cuentas y expedientes antiguos. También se comprobó la interacción del DOM: acceso, botón de inicio, edición del perfil, todas las preguntas de la primera etapa, aprobación, continuación, botón del panel según permisos, bloqueo del panel sin autorización, gestión del equipo y privacidad.

Discord OAuth, la creación de MD, el envío del bot y el webhook se simularon en las pruebas. También se verifican MD bloqueados, límites de envío, motivos largos, migración de la cola anterior y destinatarios verificados. Configura tus credenciales y comprueba el acceso y envío real después del despliegue. No se pudo ejecutar una revisión visual en navegador en el entorno de creación; revisa la apariencia en computadora y celular.
