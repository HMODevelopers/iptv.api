# HMODevelopers IPTV API

Una plataforma de servicios IPTV para administrar y proporcionar acceso estructurado a canales de televisión por internet provenientes de fuentes públicas y autorizadas. El backend incluye catálogo, autenticación, administración y autorización explícita de contenido; prepara la información que consumirán aplicaciones web, móviles y televisores inteligentes.

## ¿Qué es HMODevelopers IPTV?

Las fuentes IPTV publican catálogos con identificadores, nombres, logos y enlaces de reproducción que pueden cambiar o quedar fuera de servicio. Consultarlos por separado produce información inconsistente y dificulta encontrar canales y alternativas.

Una plataforma de agregación reúne esa información, la normaliza y organiza por país y categoría. HMODevelopers IPTV descubre los canales a través de proveedores, relaciona sus streams y mantiene un catálogo centralizado. Los clientes consultan ese catálogo mediante REST sin depender de una descarga externa por cada solicitud. Centralizar facilita búsquedas, actualizaciones y una futura administración de disponibilidad y acceso.

## ¿Para qué sirve esta API?

Permite consultar canales internacionales o mexicanos, explorar categorías y países, y obtener fuentes alternativas de reproducción junto con sus metadatos. La sincronización mantiene identidades y relaciones estables para evitar duplicados. La arquitectura distingue la integración con proveedores, la normalización, el almacenamiento y las consultas que consumen los clientes.

## Funcionalidades actuales

- Integración con los seis recursos oficiales de [IPTV-org](https://github.com/iptv-org/api): canales, streams, logos, categorías, países y blocklist.
- Catálogo internacional persistido; México se selecciona mediante `country=MX`.
- Exclusión NSFW/DMCA y deshabilitación de canales previamente importados que pasan a estar bloqueados, conservando su historial.
- Sincronización manual por lotes, transacciones, reintentos, timeout, estadísticas y control de ejecución concurrente en MariaDB.
- Canales con relaciones normalizadas a países/categorías y múltiples streams; retiro lógico de alternativas retiradas y desactivación de canales desaparecidos.
- Endpoints GET con búsqueda, filtros, ordenamiento, paginación limitada y documentación OpenAPI.
- JWT, Argon2id, sesiones revocables, RBAC, auditoría y control de contenido por publicaciones, colecciones y excepciones individuales.
- Migraciones manuales TypeORM, configuración validada, pruebas unitarias/integración y preparación Docker.

Los streams nuevos tienen estado `UNKNOWN`: no se comprueba su disponibilidad en esta fase. No hay frontend, proxy de video ni retransmisión. Guardar un enlace no garantiza que pueda reproducirse o que exista autorización para su uso.

## Funcionalidades futuras

Se prevé incorporar múltiples proveedores, listas M3U y proveedores compatibles con Xtream API; EPG, favoritos e historial; panel administrativo Next.js y reproducción web; verificación de calidad/disponibilidad, monitoreo de fuentes y estadísticas de uso; clientes móviles y para televisores inteligentes. Estas funcionalidades todavía no están implementadas.

## Arquitectura

**Fuentes IPTV → Integración → Normalización → Base de datos → API REST → Aplicaciones cliente.**

El contrato `CatalogProvider` admite nuevos adaptadores. La identidad de un canal incluye su fuente para evitar conflictos entre proveedores. Las consultas usan TypeORM sobre MariaDB; el proveedor externo interviene únicamente en la sincronización CLI.

El backend utiliza NestJS y TypeScript, TypeORM, MariaDB 10.11 y mysql2. La explicación del modelo, estrategia transaccional y límites de seguridad está en [docs/architecture.md](docs/architecture.md).

```text
src/
  channels/       DTOs, consultas, controlador y módulo
  catalogs/       Países y categorías
  health/         Estado de la API y base de datos
  common/         Validación HTTP, errores, URL policy y rate limiting
  config/         Validación de entorno y configuración Nest/TypeORM
  database/
    entities/     Catálogo, cuentas, RBAC, sesiones, auditoría y acceso a contenido
    migrations/   InitialCatalog, SecuritySchema y SecuritySeed
    data-source.ts
  providers/
    provider.ts   Contrato extensible
    iptv-org/     Cliente HTTP, normalización y sincronización
  security/       Autenticación, RBAC, administración y auditoría
  channel-access/ Autorización de contenido y guard reutilizable
  cli/            Sincronización y bootstrap interactivo
scripts/          Wrapper de migraciones TypeScript/compiladas
test/             Unitarias e integración HTTP/TypeORM aislada
docs/             Arquitectura y decisiones
```

## Seguridad

Actualmente se aplican Helmet, CORS configurable con orígenes explícitos, límites de solicitudes, validación global de DTOs, consultas parametrizadas, paginación máxima de 100 y errores HTTP consistentes sin detalles internos. La integración usa HTTPS, timeouts, reintentos acotados, verificación DNS de direcciones públicas, un único host autorizado y ninguna redirección. No se hacen solicitudes a URLs de reproducción o logos.

Las credenciales se configuran en `.env`, excluido de Git y del contexto Docker. No se registran errores Axios completos ni parámetros SQL. `synchronize` y `migrationsRun` están desactivados obligatoriamente; el nombre de la base se valida como `hmodevelopers_iptv`. No se crea otra base ni otro contenedor MariaDB. `DB_SSL=true` exige validación de certificado; el servidor debe tener un certificado reconocido por el runtime.

El catálogo exige Bearer JWT; solo `/api/health`, login y refresh son públicos. Cada petición comprueba la cuenta activa, la sesión vigente y los roles/permisos actuales en MariaDB. Los tokens no contienen permisos que puedan quedar obsoletos. Desactivar una cuenta, revocar una sesión o cambiar la contraseña invalida inmediatamente sus accesos; los cambios de roles y contenido se aplican en la siguiente consulta.

Las contraseñas usan Argon2id; los refresh se almacenan como HMAC-SHA-256 con un secreto separado, nunca en texto plano. Access dura 15 minutos y la sesión/refresh 7 días por defecto; rotar refresh no extiende la fecha final de la sesión. La rotación usa bloqueos transaccionales sobre usuario y sesión en MariaDB. Reutilizar un refresh anterior revoca esa sesión, incluido el access emitido con ella. Un cliente debe serializar refresh y no reintentar un token ya rotado. Las recomendaciones de hashing y detección de reutilización se fundamentan en [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) y [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html).

Las cuentas nuevas reciben una contraseña temporal proporcionada por el administrador y deben cambiarla antes de consultar contenido o administrar. No hay registro público. El bloqueo de login es temporal y configurable, con errores uniformes. El máximo de sesiones por cuenta revoca las más antiguas al iniciar otra. Auditoría registra actor, acción, módulo, entidad, fecha, IP, resultado y metadatos acotados; excluye contraseñas, tokens y payloads completos.

Helmet incluye CSP. CORS permite orígenes explícitos y los métodos de la API; la autenticación actual usa cabecera Bearer, no cookies. El throttling general y el específico de login/refresh usan memoria por proceso; varias réplicas necesitan un almacén compartido y configuración explícita de proxies de confianza. Swagger queda deshabilitado siempre en `NODE_ENV=production`, incluso si `SWAGGER_ENABLED=true`.

Para un futuro cliente web con cookies, implementar refresh en cookie `HttpOnly`, `Secure`, `SameSite` adecuado al despliegue, alcance/path limitado, eliminación al cerrar sesión y protección CSRF (token y validación de Origin para acciones que cambian estado). Habilitar credenciales CORS únicamente con orígenes explícitos. Esta adaptación aún no está implementada; consultar [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). Usar HTTPS y no poner tokens en URL ni persistirlos en logs.

## Instalación y configuración

Requisitos: Ubuntu, Node.js 22 LTS, npm y conectividad autorizada a MariaDB 10.11. Docker es opcional para desarrollo local. La base `hmodevelopers_iptv` ya debe existir.

```bash
npm install
```

El repositorio incluye `.env.example`; esta implementación también creó físicamente `.env`. En un clon nuevo, crea tu configuración con `cp .env.example .env`. Si tienes un `.env` existente, conserva sus valores y agrega únicamente variables faltantes.

Configura las credenciales de MariaDB y completa `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` con dos secretos aleatorios diferentes de al menos 48 caracteres. La API rechaza valores ausentes, cortos, repetitivos o marcadores; no se generaron secretos reales. Edita manualmente `DB_USERNAME` y `DB_PASSWORD` si aún contienen marcadores. Se mantienen como marcadores `COLOCAR_USUARIO` y `COLOCAR_PASSWORD`; la API y el sincronizador fallan antes de realizar conexiones mientras permanezcan así. No compartas ni versiones ese archivo.

### Variables de entorno

Todas las variables usadas están presentes en ambos archivos. Los booleanos aceptan solamente `true` o `false`.

| Variable | Valor inicial | Uso |
| --- | --- | --- |
| `NODE_ENV` | `development` | development, test o production |
| `APP_NAME` | `HMODevelopers IPTV API` | Nombre en health y Swagger |
| `APP_HOST` | `0.0.0.0` | Interfaz de escucha |
| `PORT` | `3000` | Puerto local; Docker fija el interno a 3000 |
| `API_PREFIX` | `api` | Prefijo REST |
| `API_VERSION` | `1` | Versión informativa de health/OpenAPI; no agrega `/v1` |
| `LOG_LEVEL` | `log` | fatal, error, warn, log, debug o verbose |
| `DB_TYPE` | `mariadb` | Único driver permitido |
| `DB_HOST` | `192.168.1.12` | Host local; Compose utiliza `rc_mysql` |
| `DB_PORT` | `3306` | Puerto MariaDB |
| `DB_USERNAME` | `COLOCAR_USUARIO` | Usuario pendiente de configurar |
| `DB_PASSWORD` | `COLOCAR_PASSWORD` | Contraseña pendiente de configurar |
| `DB_DATABASE` | `hmodevelopers_iptv` | Única base permitida |
| `DB_SYNCHRONIZE` | `false` | Obligatoriamente desactivado |
| `DB_LOGGING` | `false` | Solo logs de esquema/migraciones, sin parámetros |
| `DB_SSL` | `false` | TLS con certificado validado si se habilita |
| `DB_CONNECTION_LIMIT` | `10` | Tamaño máximo de pool (1–100) |
| `TYPEORM_MIGRATIONS_RUN` | `false` | Migraciones automáticas prohibidas |
| `IPTV_ORG_API_URL` | `https://iptv-org.github.io/api` | Solo endpoint oficial HTTPS |
| `IPTV_ORG_REQUEST_TIMEOUT_MS` | `15000` | Timeout por solicitud |
| `IPTV_ORG_MAX_RETRIES` | `3` | Reintentos adicionales (0–5) |
| `IPTV_SYNC_BATCH_SIZE` | `250` | Registros por lote (1–1000) |
| `CORS_ENABLED` | `true` | Habilita política CORS |
| `CORS_ORIGINS` | `http://localhost:3001,http://localhost:3000` | Lista exacta separada por comas; vacío no autoriza orígenes |
| `SWAGGER_ENABLED` | `true` | Habilita documentación |
| `SWAGGER_PATH` | `api/docs` | Ruta de Swagger sin slash inicial |
| `HELMET_ENABLED` | `true` | Headers de seguridad |
| `RATE_LIMIT_ENABLED` | `true` | Activa límite por dirección de conexión |
| `RATE_LIMIT_TTL_MS` | `60000` | Ventana de limitación |
| `RATE_LIMIT_MAX` | `100` | Solicitudes por ventana |
| `DOCKER_HOST_PORT` | `3003` | Puerto publicado; verificar antes de desplegar |
| `DOCKER_DB_NETWORK` | `COLOCAR_RED_DOCKER` | Nombre pendiente de la red existente de `rc_mysql` |
| `JWT_ACCESS_SECRET` | Marcador pendiente | Secreto aleatorio privado, mínimo 48 caracteres |
| `JWT_REFRESH_SECRET` | Marcador pendiente | Otro secreto aleatorio independiente |
| `JWT_ACCESS_TTL_SECONDS` | `900` | Duración access, 60–3600 segundos |
| `JWT_REFRESH_TTL_SECONDS` | `604800` | Vida absoluta de sesión/refresh, 3600–2592000 segundos |
| `ARGON2_MEMORY_KIB` | `65536` | Memoria por hash, mínimo 19456 KiB |
| `ARGON2_TIME_COST` | `3` | Iteraciones, 2–10 |
| `ARGON2_PARALLELISM` | `1` | Paralelismo, 1–4 |
| `AUTH_MAX_LOGIN_ATTEMPTS` | `5` | Intentos fallidos antes de bloqueo |
| `AUTH_LOCK_SECONDS` | `900` | Duración del bloqueo temporal |
| `AUTH_LOGIN_LIMIT` | `10` | Peticiones por IP/ventana, compartido entre login y refresh |
| `AUTH_LOGIN_WINDOW_MS` | `60000` | Ventana del límite específico |
| `AUTH_MAX_SESSIONS` | `10` | Máximo de sesiones vigentes por cuenta |

### Conexión a MariaDB y migraciones

1. Configura credenciales con acceso exclusivamente a `hmodevelopers_iptv`; verifica que el servidor permita conexiones desde tu Ubuntu. No necesitas proporcionar credenciales en el chat.
2. Verifica host/puerto, conectividad, permisos y, si aplica, TLS.
3. Consulta y ejecuta las migraciones manualmente:

```bash
npm run migration:show
npm run migration:run
```

La migración histórica inicial crea las cinco tablas del catálogo y permanece intacta. `1791200000000-SecuritySchema.ts` agrega doce tablas de seguridad/contenido y las marcas `streams.isAvailable` / `channel_categories.isCurrent` sin borrar registros IPTV. `1791200000001-SecuritySeed.ts` registra roles y permisos con `INSERT IGNORE` y deja los canales existentes en DRAFT; no publica contenido ni crea cuentas. No crea una base de datos. MariaDB realiza commits implícitos en DDL: ante un fallo parcial, inspecciona el esquema antes de repetir; una transacción no garantiza revertir todo el DDL.

Para desarrollar futuras migraciones:

```bash
npm run migration:generate -- NombreCambio
npm run migration:create -- NombreCambioManual
npm run migration:revert
```

`generate` compara entidades con la base y necesita credenciales; `create` solo crea un archivo vacío. `revert` elimina los datos de las tablas iniciales si se revierte esa migración: úsalo únicamente cuando corresponda y después de respaldar. Revisa las migraciones generadas antes de ejecutarlas.

El DataSource es independiente de Nest. El wrapper selecciona TypeScript en desarrollo y `dist/database/data-source.js` en la imagen de producción. El glob de migraciones resuelve los archivos de la misma carpeta en ambos casos.

### Sincronización y ejecución local

Una vez configuradas las credenciales y aplicado el esquema:

```bash
npm run sync:iptv-org
npm run start:dev
```

La sincronización descarga todos los catálogos antes de escribir, evita duplicados por fuente/canal y feed/URL, relaciona categorías/logos y registra `lastSyncedAt`. Reporta `processed`, `created`, `updated`, `streams`, `errors`, `discarded` y `durationMs`. Un error de lote revierte ese lote; el proceso devuelve código 1 y puede repetirse. No se ejecuta automáticamente al iniciar.

```bash
npm run build
npm start
```

Swagger en desarrollo: `http://localhost:3000/api/docs`. OpenAPI JSON: `/api/docs-json`. Ejecuta login, copia `accessToken` en **Authorize** y prueba las rutas protegidas. Nunca pegues el refresh en Authorize. En producción no se sirven estos endpoints.

## Endpoints

| Método y ruta | Resultado |
| --- | --- |
| `GET /api/health` | Estado de aplicación/base; 503 si MariaDB no responde |
| `GET /api/channels` | Lista paginada exclusivamente de canales autorizados |
| `GET /api/channels/:id` | Detalle autorizado; 404 si no existe o no está autorizado |
| `GET /api/channels/:id/streams` | Canal/logo y alternativas paginadas con metadatos de reproducción |
| `GET /api/categories` | Catálogo de categorías |
| `GET /api/countries` | Catálogo de países |

```text
/api/channels?country=MX
/api/channels?country=MX&category=sports
/api/channels?search=noticias
/api/channels?page=1&limit=20&sortBy=name&order=ASC&status=active
/api/channels/1/streams?page=1&limit=20
```

`status`: `active` (predeterminado), `inactive`, `all`; describe el estado del canal, no del stream. `sortBy`: `name`, `createdAt`, `lastSyncedAt`. `order`: `ASC` o `DESC`. `page`: 1–1000000; `limit`: 1–100, predeterminado 20. País requiere código de dos letras mayúsculas; categoría usa slug. La búsqueda por nombre es parcial y trata `%`/`_` como caracteres literales. Los parámetros desconocidos o inválidos devuelven 400. Para usuarios, `status=all` o `inactive` nunca evita las restricciones: solo se permiten canales publicados y activos. Los totales y filtros se calculan dentro del conjunto autorizado mediante EXISTS SQL, sin filtrar el catálogo completo en memoria.

Las páginas devuelven `{ data, total, page, limit, totalPages }`; la página de streams incluye además `channel`. Los streams entregan URL, feed, calidad, formato inferido, referrer, userAgent, labels, status y lastCheckedAt. Una respuesta vacía es válida si el canal no tiene streams. Los errores siguen `{ statusCode, message, timestamp }` y la limitación responde 429.

## Docker y servidor existente

La imagen contiene únicamente la API, corre como usuario sin privilegios, tiene health check y política de reinicio. Compose reutiliza una red externa y `rc_mysql`; no define MariaDB ni volúmenes de datos.

**No se desplegó ni se inspeccionó/modificó el servidor durante esta implementación.** Antes de desplegar, ejecuta estas verificaciones de solo lectura en `192.168.1.12`:

```bash
ss -ltn '( sport = :3003 )'
docker ps --format 'table {{.Names}}\t{{.Ports}}'
docker inspect rc_mysql --format '{{json .NetworkSettings.Networks}}'
```

Confirma que 3003 no esté ocupado/publicado y selecciona una red existente donde `rc_mysql` tenga resolución DNS. Configura `DOCKER_DB_NETWORK` y `DOCKER_HOST_PORT` en `.env`. No reinicies ni cambies otros contenedores. Si no existe una red compartida utilizable, detén el despliegue y planifica ese cambio por separado.

Con credenciales/red/puerto confirmados y tras revisión del despliegue:

```bash
docker compose config --quiet
docker compose build
docker compose run --rm api npm run migration:run
docker compose run --rm api npm run sync:iptv-org:prod
docker compose up -d api
```

La API será accesible en `http://192.168.1.12:3003/api/health`. El health check utiliza el prefijo configurado. Deshabilita Swagger o restringe su exposición si lo requiere el entorno. Las credenciales no se incorporan a la imagen; ten presente que usuarios con acceso al daemon Docker pueden inspeccionar variables del contenedor.

## Pruebas y estado de validación

```bash
npm run lint
npm run build
npm run test
npm run test:integration
```

Las pruebas unitarias cubren normalización, nulos, deduplicación, exclusiones, política URL, configuración y errores/reintentos HTTP. Las de integración levantan Nest con una base **SQL.js en memoria**, usan repositorios/relaciones TypeORM reales y HTTP mediante Supertest: filtros, paginación, validación, seguridad, OpenAPI, idempotencia, reconciliación y rollback. No descargan catálogos reales ni usan MariaDB.

La sincronización automática del esquema existe **solo en bases efímeras de pruebas**. Producción y CLI la rechazan. Las pruebas de fase 2 cubren login, bloqueo, expiración JWT, refresh/rotación/reutilización, sesiones, cambio obligatorio de contraseña, RBAC, protección del último administrador, bootstrap, publicaciones, colecciones, grants, IDOR, streams, paginación y conservación editorial durante sincronización. Los metadatos del driver MariaDB se validan sin conexión.

**Validación ejecutada:** `npm run lint` y `npm run build` correctos; `npm run test`: **91 pruebas aprobadas en 7 suites**. Los mensajes de rollback/errores sanitizados de la suite corresponden a escenarios negativos intencionales.

Las pruebas SQL.js no validan los bloqueos concurrentes ni el DDL de MariaDB. Antes del uso operativo, aplicar y comprobar las migraciones en una copia autorizada de MariaDB 10.11 y comprobar refresh simultáneos y bootstrap simultáneo; después aplicar al servidor con respaldo y revisión. Esta implementación no ejecutó migraciones, bootstrap ni despliegues contra el servidor externo.

## Administración de la plataforma

`SUPER_ADMIN` tiene todos los permisos y usa `/api/admin/channels?status=all` para el catálogo completo, incluso canales ocultos. `ADMIN` empieza sin permisos y recibe los necesarios del propietario. `USER` empieza sin permisos administrativos ni contenido. Los roles y permisos viven en MariaDB; los roles reservados no pueden renombrarse ni desactivarse. Los permisos de SUPER_ADMIN y USER están protegidos; los del ADMIN son configurables exclusivamente por SUPER_ADMIN. Se pueden crear roles adicionales.

Solo SUPER_ADMIN cambia roles de cuentas y permisos de roles. Ningún usuario puede modificar sus propios roles. ADMIN no puede modificar cuentas privilegiadas ni revocar sesiones de administradores. No se puede desactivar ni retirar el rol al último SUPER_ADMIN activo. Crear una cuenta concede únicamente USER y rechaza campos ajenos al DTO, incluyendo roles/permisos; la asignación privilegiada se hace después por una ruta separada.

| Familia | Rutas y permisos |
| --- | --- |
| Autenticación | `POST /api/auth/login`, `/refresh`, `/logout`, `/logout-all`, `/change-password`; `GET /api/auth/me`, `/sessions`; `DELETE /api/auth/sessions/:id` (solo propias) |
| Usuarios | `GET /api/users`, `GET /api/users/:id`, `POST /api/users`, `PATCH /api/users/:id`, `PATCH /api/users/:id/status`; permisos `users.read/create/update/disable` |
| Roles de cuenta | `GET/PUT /api/users/:id/roles`; lectura `users.read`, escritura `permissions.assign` y SUPER_ADMIN |
| Acceso por cuenta | `GET/PUT /api/users/:id/collections`, `GET/PUT /api/users/:id/channels`; lectura `users.read`, escritura `collections.assign` |
| RBAC | `GET/POST /api/roles`, `PATCH /api/roles/:id`, `GET /api/permissions`, `GET/PUT /api/roles/:id/permissions`; permisos `roles.*`, `permissions.read/assign`, escrituras exclusivamente SUPER_ADMIN |
| Colecciones | `GET/POST /api/admin/collections`, `GET/PATCH/DELETE /api/admin/collections/:id`, `GET/PUT /api/admin/collections/:id/channels`, `GET /api/admin/collections/:id/assignments`; permisos `collections.read/create/update/delete` |
| Catálogo administrativo | `GET /api/admin/channels`, `GET /api/admin/channels/:id`, `GET /api/admin/channels/:id/streams`, `GET/PATCH /api/admin/channels/:id/publication`; requiere ADMIN o SUPER_ADMIN más `channels.read`, `streams.read` o `channels.manage` y `channels.publish/hide` |
| Sesiones administrativas | `GET/DELETE /api/admin/users/:userId/sessions`, `DELETE /api/admin/users/:userId/sessions/:id`; permisos `sessions.read/revoke` |
| Auditoría | `GET /api/admin/audit`; permiso `audit.read` |
| Cliente | `GET /api/me/channels`, `/channels/:id`, `/channels/:id/streams`, `/collections`, `/profile`; siempre usa al usuario autenticado |

El seed registra: `users.read/create/update/disable`, `roles.read/create/update/delete`, `permissions.read/assign`, `channels.read/manage/publish/hide`, `streams.read/manage`, `collections.read/create/update/delete/assign`, `providers.read/manage`, `sync.execute/history`, `sessions.read/revoke`, `audit.read`, `settings.manage`. Los códigos de proveedores/configuración y sincronización reservan autorización para la evolución; no implican que exista administración HTTP de proveedores o un endpoint de sincronización. La sincronización sigue siendo un comando operativo local.

Las listas de usuarios, colecciones y auditoría aceptan `page/limit`. Las rutas de reemplazo usan `{ "ids": [1,2] }`; las de canales individuales usan `{ "channels": [{ "channelId": 1, "accessType": "ALLOW" }] }`. Arrays vacíos revocan/quitan las relaciones correspondientes. Duplicados, IDs inexistentes y campos desconocidos se rechazan. Las operaciones sobre varias relaciones son transaccionales y auditadas.

## Control de contenido

1. Importar IPTV-org mantiene los nuevos canales en DRAFT. La publicación es independiente de `Channel.isActive`.
2. Consultar el catálogo administrativo y publicar mediante `PATCH /api/admin/channels/:id/publication` con `{ "status": "PUBLISHED" }`. Otros estados son DRAFT, HIDDEN y DISABLED.
3. Crear una colección, agregar IDs con `PUT /api/admin/collections/:id/channels` en el orden deseado y asignarla con `PUT /api/users/:id/collections`.
4. Usar ALLOW para autorizar excepciones o DENY para bloquear un canal incluso si pertenece a una colección asignada.
5. El cliente consulta `/api/me/channels`. La unión de colecciones no produce duplicados. Una colección inactiva o revocada no concede acceso. Sin ALLOW ni colección activa asignada, el usuario obtiene cero canales.

Las rutas heredadas `/api/channels` aplican las mismas reglas, incluso para SUPER_ADMIN: el catálogo completo se consulta exclusivamente en rutas administrativas. Un permiso `channels.read` no concede por sí solo contenido. Un ID no autorizado responde 404, incluidos sus streams. `ChannelAccessModule` expone filtros y validación reutilizables para futuras rutas de EPG, favoritos y exportación M3U.

Eliminar una colección es una desactivación lógica. Revocar una asignación mantiene su fila con `revokedAt`; volver a asignar actualiza esa relación y los eventos quedan en auditoría. La sincronización conserva publicaciones, colecciones y grants. Canales bloqueados/desaparecidos quedan inactivos y streams retirados se conservan con `isAvailable=false` y categorías retiradas del canal con `isCurrent=false`; las consultas excluyen esas relaciones y alternativas retiradas.

Una URL HLS externa pública puede consultarse fuera de esta aplicación. JWT protege el catálogo de nuestra API y no protege el origen externo ni garantiza derechos o reproducción. Fuentes futuras autorizadas podrán integrar tokens de reproducción o un gateway seguro; esta fase no retransmite video ni evade controles de terceros.

## Primer administrador

Antes de iniciar la API, completa los secretos JWT y credenciales, y aplica manualmente las migraciones:

```bash
npm run migration:show
npm run migration:run
npm run bootstrap:super-admin
npm run start:dev
```

El bootstrap valida conexión, migraciones pendientes y permisos del sistema. Solicita username, correo, nombre, apellido opcional, contraseña oculta y confirmación. La contraseña exige 12–128 caracteres con mayúsculas, minúsculas, número y símbolo; se almacena solo el hash Argon2id. La cuenta inicial no requiere cambio de contraseña porque tú la eliges. Se registra su creación en auditoría y se confirma solo su username/id.

Se ejecuta en una terminal interactiva; el mismo comando selecciona código TypeScript en desarrollo o código compilado en la imagen. Una transacción con bloqueo del rol SUPER_ADMIN impide dos creaciones simultáneas en MariaDB. Si existe cualquier propietario (incluso inactivo) o una cuenta con ese username/correo, no la sobrescribe ni la eleva. Una nueva ejecución rechaza la creación y conserva el estado; un segundo propietario requiere el procedimiento autenticado: crear cuenta y asignar SUPER_ADMIN desde otro propietario. No hay semillas de credenciales ni contraseña administrativa en archivos de entorno.

## Desarrollo futuro

Panel administrativo Next.js, reproductor web IPTV, EPG, favoritos, administración de proveedores, estadísticas, dispositivos y sesiones avanzadas, tokens de reproducción para fuentes autorizadas, aplicaciones móviles y Smart TV. Ningún frontend, suscripción ni pago se implementó en esta fase.

## Consideraciones legales

La plataforma no proporciona derechos de distribución sobre contenidos de terceros. Cada fuente debe utilizarse respetando sus autorizaciones, licencias, términos y restricciones aplicables. Se excluyen contenidos NSFW y los canales de la blocklist oficial. No se implementan mecanismos para evadir DRM, geobloqueos ni restricciones de acceso.

## Licencia

[MIT](LICENSE) para el código desarrollado en este repositorio. No se extiende a canales, logos, streams ni otros contenidos de terceros.
