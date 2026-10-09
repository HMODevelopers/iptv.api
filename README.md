# HMODevelopers IPTV API

Una plataforma de servicios IPTV para administrar y proporcionar acceso estructurado a canales de televisión por internet provenientes de fuentes públicas y autorizadas. El backend incluye catálogo, autenticación, administración y autorización explícita de contenido; prepara la información que consumirán aplicaciones web, móviles y televisores inteligentes.

## ¿Qué es HMODevelopers IPTV?

Las fuentes IPTV publican catálogos con identificadores, nombres, logos y enlaces de reproducción que pueden cambiar o quedar fuera de servicio. Consultarlos por separado produce información inconsistente y dificulta encontrar canales y alternativas.

Una plataforma de agregación reúne esa información, la normaliza y organiza por país y categoría. HMODevelopers IPTV descubre los canales a través de proveedores, relaciona sus streams y mantiene un catálogo centralizado. Los clientes consultan ese catálogo mediante REST sin depender de una descarga externa por cada solicitud. Centralizar facilita búsquedas, actualizaciones y una futura administración de disponibilidad y acceso.

## ¿Para qué sirve esta API?

Permite consultar canales internacionales o mexicanos, explorar categorías y países, y obtener fuentes alternativas de reproducción junto con sus metadatos. La sincronización mantiene identidades y relaciones estables para evitar duplicados. La arquitectura distingue la integración con proveedores, la normalización, el almacenamiento y las consultas que consumen los clientes.

## Funcionalidades actuales

- Administración multiproveedor: IPTV-org, M3U_URL, M3U_UPLOAD y fuentes manuales, con historial y procedencia de streams.
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

Xtream/REST tienen contratos preparados, sin soporte operativo verificado. Se prevé incorporar sus integraciones autorizadas; EPG, favoritos e historial; panel administrativo Next.js y reproducción web; verificación de calidad/disponibilidad, monitoreo de fuentes y estadísticas de uso; clientes móviles y para televisores inteligentes. Estas funcionalidades todavía no están implementadas.

## Arquitectura

**Fuentes IPTV → Integración → Normalización → Base de datos → API REST → Aplicaciones cliente.**

`ProviderAdapter` retorna un catálogo normalizado neutral; `AdapterRegistry` selecciona por tipo. `ProviderChannel` enlaza identidades externas con canales canónicos y conserva procedencia de streams. El mismo motor atiende CLI y sincronizaciones administrativas HTTP. Importar siempre conserva decisiones editoriales y crea DRAFT.

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
    migrations/   InitialCatalog, SecuritySchema, SecuritySeed y MultiProvider
    data-source.ts
  providers/
    provider.ts   Alias legacy y contrato neutral de adaptadores
    iptv-org/     Cliente HTTP, normalización y sincronización
  security/       Autenticación, RBAC, administración y auditoría
  channel-access/ Autorización de contenido y guard reutilizable
  cli/            Sincronización y bootstrap interactivo
scripts/          Wrapper de migraciones TypeScript/compiladas
test/             Unitarias e integración HTTP/TypeORM aislada
docs/             Arquitectura y decisiones
```

## Seguridad

Actualmente se aplican Helmet, CORS configurable con orígenes explícitos, límites de solicitudes, validación global de DTOs, consultas parametrizadas, paginación máxima de 100 y errores HTTP consistentes sin detalles internos. La integración usa HTTPS, timeouts, reintentos acotados, verificación DNS de direcciones públicas, host oficial para IPTV-org, hosts públicos configurados para M3U y ninguna redirección. No se hacen solicitudes a URLs de reproducción o logos.

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

El repositorio incluye `.env.example`. En un clon nuevo, crea tu configuración con `cp .env.example .env`. Si tienes un `.env` existente, conserva sus valores y agrega únicamente variables faltantes.

Configura las credenciales de MariaDB y completa `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` con dos secretos aleatorios diferentes de al menos 48 caracteres. La API rechaza valores ausentes, cortos, repetitivos o marcadores; no se generaron secretos reales. Edita manualmente `DB_USERNAME` y `DB_PASSWORD` si aún contienen marcadores. Se mantienen como marcadores `COLOCAR_USUARIO` y `COLOCAR_PASSWORD`; la API y el sincronizador fallan antes de realizar conexiones mientras permanezcan así. No compartas ni versiones ese archivo.

### Variables de entorno

Las variables están documentadas en `.env.example`; agrega `PROVIDER_CREDENTIALS_KEY` a tu `.env` existente. Los booleanos aceptan solamente `true` o `false`.

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
| `PROVIDER_CREDENTIALS_KEY` | Marcador pendiente | Clave privada base64 de 32 bytes; cifrado de credenciales y uploads |
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

`status`: `active`, `inactive`, `all`; al omitirlo se usa `all` para SUPER_ADMIN y consultas administrativas, y `active` para espectadores ADMIN/USER; describe el estado del canal, no del stream. `sortBy`: `name`, `createdAt`, `lastSyncedAt`. `order`: `ASC` o `DESC`. `page`: 1–1000000; `limit`: 1–100, predeterminado 20. País requiere código de dos letras mayúsculas; categoría usa slug. La búsqueda por nombre es parcial y trata `%`/`_` como caracteres literales. Los parámetros desconocidos o inválidos devuelven 400. Para usuarios, `status=all` o `inactive` nunca evita las restricciones: solo se permiten canales publicados y activos. Los totales y filtros se calculan dentro del conjunto autorizado mediante EXISTS SQL, sin filtrar el catálogo completo en memoria.

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

**Validación de fase 3:** consultar [informe de implementación](docs/phase3-report.md) para los resultados exactos de lint, build y ambas suites. Los mensajes de rollback/errores sanitizados de la suite corresponden a escenarios negativos intencionales.

Las pruebas SQL.js no validan los bloqueos concurrentes ni el DDL de MariaDB. Antes del uso operativo, aplicar y comprobar las migraciones en una copia autorizada de MariaDB 10.11 y comprobar refresh simultáneos y bootstrap simultáneo; después aplicar al servidor con respaldo y revisión. Esta implementación no ejecutó migraciones, bootstrap ni despliegues contra el servidor externo.

## Administración de la plataforma

`SUPER_ADMIN` representa al propietario de la plataforma y tiene privilegios globales, incluidos permisos futuros sin asignaciones manuales. Consulta el catálogo completo en `/api/channels`, `/api/me/channels` y `/api/admin/channels`, incluso canales DRAFT, HIDDEN, DISABLED, inactivos o sin publicación. `ADMIN` empieza sin permisos y recibe los necesarios del propietario. `USER` empieza sin permisos administrativos ni contenido. Los roles y permisos viven en MariaDB; los roles reservados no pueden renombrarse ni desactivarse. Los permisos de SUPER_ADMIN y USER están protegidos; los del ADMIN son configurables exclusivamente por SUPER_ADMIN. Se pueden crear roles adicionales.

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

El seed registra: `users.read/create/update/disable`, `roles.read/create/update/delete`, `permissions.read/assign`, `channels.read/manage/publish/hide`, `streams.read/manage`, `collections.read/create/update/delete/assign`, `providers.read/manage`, `sync.execute/history`, `sessions.read/revoke`, `audit.read`, `settings.manage`. Los permisos providers.* y sync.* autorizan los endpoints administrativos de fase 3; settings.manage permanece reservado. La sincronización está disponible por CLI y HTTP controlado.

Las listas de usuarios, colecciones y auditoría aceptan `page/limit`. Las rutas de reemplazo usan `{ "ids": [1,2] }`; las de canales individuales usan `{ "channels": [{ "channelId": 1, "accessType": "ALLOW" }] }`. Arrays vacíos revocan/quitan las relaciones correspondientes. Duplicados, IDs inexistentes y campos desconocidos se rechazan. Las operaciones sobre varias relaciones son transaccionales y auditadas.

## Control de contenido

1. Importar IPTV-org mantiene los nuevos canales en DRAFT. La publicación es independiente de `Channel.isActive`.
2. Consultar el catálogo administrativo y publicar mediante `PATCH /api/admin/channels/:id/publication` con `{ "status": "PUBLISHED" }`. Otros estados son DRAFT, HIDDEN y DISABLED.
3. Crear una colección, agregar IDs con `PUT /api/admin/collections/:id/channels` en el orden deseado y asignarla con `PUT /api/users/:id/collections`.
4. Usar ALLOW para autorizar excepciones o DENY para bloquear un canal incluso si pertenece a una colección asignada.
5. El cliente consulta `/api/me/channels`. La unión de colecciones no produce duplicados. Una colección inactiva o revocada no concede acceso. Sin ALLOW ni colección activa asignada, el usuario obtiene cero canales.

Las rutas `/api/channels` y `/api/me/channels` aplican estas reglas a ADMIN y USER. SUPER_ADMIN queda exento de restricciones de contenido, incluyendo DENY individual, y no necesita colecciones ni ALLOW. La autenticación y las garantías de sesión siguen siendo obligatorias para todos. Un permiso `channels.read` no concede por sí solo contenido. Un ID no autorizado responde 404, incluidos sus streams. `ChannelAccessModule` expone filtros y validación reutilizables para futuras rutas de EPG, favoritos y exportación M3U.

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

Panel administrativo Next.js, reproductor web IPTV, EPG, favoritos, adaptadores Xtream/REST verificados, estadísticas, dispositivos y sesiones avanzadas, tokens de reproducción para fuentes autorizadas, aplicaciones móviles y Smart TV. Ningún frontend, suscripción ni pago se implementó en esta fase.

## Consideraciones legales

La plataforma no proporciona derechos de distribución sobre contenidos de terceros. Cada fuente debe utilizarse respetando sus autorizaciones, licencias, términos y restricciones aplicables. Se excluyen contenidos NSFW y los canales de la blocklist oficial. No se implementan mecanismos para evadir DRM, geobloqueos ni restricciones de acceso.

## Licencia

[MIT](LICENSE) para el código desarrollado en este repositorio. No se extiende a canales, logos, streams ni otros contenidos de terceros.

### Fase 2.1: política global del propietario

`policy.ts` centraliza `isSuper`, `hasAnyRole`, `requirePermission` y `catalogPrivileges`. Los controladores entregan el principal autenticado completo; nunca aceptan roles ni alcance administrativo desde el cliente. `AuthService.authenticate` verifica JWT, usuario activo, sesión vigente/no revocada y carga roles activos y permisos desde la base en cada solicitud. Retirar o desactivar un rol surte efecto inmediatamente. Una contraseña temporal sigue obligando al cambio.

El alcance administrativo se establece exclusivamente en código y exige ADMIN/SUPER_ADMIN más el permiso de la operación. Todas las rutas de usuarios, roles, permisos, colecciones administrativas, auditoría y sesiones administrativas exigen ese rol además de RBAC. Los roles adicionales pueden aportar permisos a una cuenta ADMIN; una cuenta USER con permisos adicionales no obtiene acceso administrativo. Solo SUPER_ADMIN puede asignar roles o permisos; se conserva la protección del último propietario.

Para SUPER_ADMIN y consultas administrativas autorizadas, la lista omite por defecto el filtro de actividad. Los filtros explícitos `status=active`, `inactive` y `all` se respetan; describen `Channel.isActive`, no el estado editorial. `/api/me/collections` sigue describiendo las asignaciones personales; la administración completa se consulta en `/api/admin/collections`.

Consultar un registro, su visibilidad editorial, su disponibilidad y la autorización de reproducción son conceptos distintos. Los espectadores requieren canal activo, publicación PUBLISHED y ALLOW o colección activa no revocada, con DENY prioritario, aplicados en SQL antes de paginar. Solo reciben streams `isAvailable=true`. SUPER_ADMIN y ADMIN con `streams.read` en rutas administrativas pueden inspeccionar también streams retirados (`isAvailable=false`), sin cambiar su estado. Esto no comprueba reproducción, derechos de redistribución, estado ONLINE ni restricciones del proveedor. No se publican canales automáticamente.

La migración histórica `SecuritySeed1791200000001` permanece intacta: registra roles reservados, permisos y relaciones del propietario mediante INSERT IGNORE; su rollback conserva asignaciones. `seedSecurity` es idempotente y no crea usuarios. `bootstrapSuperAdmin` crea únicamente el primer propietario y rechaza ejecuciones posteriores, sin reemplazar ni elevar cuentas existentes. En fase 2.1 no fue necesaria una migración nueva; fase 3 incorpora MultiProvider. Los nuevos permisos persistidos deben incorporarse mediante migraciones versionadas idempotentes que agreguen sus relaciones con SUPER_ADMIN para consistencia administrativa; `requirePermission` ya los reconoce para el propietario sin depender de esas relaciones.

Los futuros módulos deben utilizar esta política, los guards y restricciones SQL, sin aceptar privilegios del cliente ni excepciones a autenticación. Existen catálogo, streams, publicaciones, colecciones, cuentas, sesiones, auditoría y sincronización IPTV-org mediante CLI. La fase 3 implementa providers.* y sync.* mediante endpoints administrativos; settings.manage sigue reservado. EPG, VOD, frontend y autorización/verificación adicional de reproducción siguen fuera de esta fase.


## Fase 3: proveedores y catálogo administrable

La migración nueva conserva IDs, publicaciones, colecciones, grants, streams y categorías. Crea los proveedores reservados `iptv-org` y `manual` y realiza backfill de procedencia. No se ejecutó contra la MariaDB externa. El informe completo y el procedimiento operativo están en [docs/phase3-report.md](docs/phase3-report.md).

Antes de iniciar API, CLI o migraciones, agrega una clave privada a tu `.env` existente. Genera **manualmente** 32 bytes seguros:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Copia el resultado como `PROVIDER_CREDENTIALS_KEY` y guárdalo fuera de Git junto con un respaldo seguro. No reemplaces los secretos JWT ni otras variables existentes. No se generó ni escribió una clave real durante esta implementación. Cambiar la clave sin recifrar deja ilegibles las credenciales y uploads almacenados. Credenciales se escriben en `credentials`, nunca en `config`; se cifran con AES-256-GCM y no aparecen en GET/auditoría/historial.

Todas las rutas siguientes llevan prefijo `/api`, Bearer JWT y rol ADMIN/SUPER_ADMIN; ADMIN requiere además permisos. SUPER_ADMIN conserva acceso global. USER no obtiene administración aunque tenga permisos accidentales.

| Operación | Ruta | Permiso |
| --- | --- | --- |
| Lista/detalle | GET `/admin/providers`, `/admin/providers/:id` | providers.read |
| Crear/editar/desactivar | POST `/admin/providers`, PATCH `/admin/providers/:id` | providers.manage |
| Conectividad | POST `/admin/providers/:id/test` | providers.manage |
| Cargar texto de archivo M3U | POST `/admin/providers/:id/upload` | providers.manage |
| Iniciar sync (202 con ID) | POST `/admin/providers/:id/sync` | sync.execute |
| Fuentes importadas | GET `/admin/providers/:id/channels` | providers.read |
| Historial | GET `/admin/providers/:id/sync-runs`, `/admin/sync-runs` | sync.history |
| Vincular fuente canónica | PATCH `/admin/provider-channels/:id/channel` | providers.manage + channels.manage + streams.manage |
| Crear/editar/desactivar canal | POST `/admin/channels`, PATCH/DELETE `/admin/channels/:id` | channels.manage |
| Agregar señal manual | POST `/admin/channels/:id/streams` | streams.manage |
| Editar/desactivar señal | PATCH/DELETE `/admin/streams/:id` | streams.manage |
| Consultar señales (existente) | GET `/admin/channels/:id/streams` | streams.read |

Listas aceptan `page`/`limit` (máximo 100); historial agrega `providerId`/`status`. `name`, `slug`, `type`, `config` son obligatorios al crear. Tipo y slug son inmutables. Config M3U_URL admite solo `url` HTTPS pública sin credenciales. M3U_UPLOAD usa `{}`. Credenciales M3U_URL admiten únicamente `token` Bearer write-only; envíalo por TLS. `priority` admite 0–100000. Solo ejecución manual (`syncMode=MANUAL`); no hay scheduler.

Ejemplo de registro público, sin secretos:

```json
{
  "name": "Lista autorizada A",
  "slug": "lista-a",
  "type": "M3U_URL",
  "config": { "url": "https://tu-proveedor-autorizado.tld/catalogo.m3u" },
  "priority": 10
}
```

Para un archivo crea M3U_UPLOAD y envía su texto UTF-8 como `{ "content": "#EXTM3U\n..." }` a `/upload`; no es multipart. Playlist máximo 5 MiB/10000 entradas, request JSON máximo 6 MiB. Se guarda cifrada en la base y no se escribe al disco. La carga valida pero no sincroniza: después solicita `/sync` y consulta `/sync-runs`. `test` valida conectividad/playlist sin importar ni publicar. URLs privadas, redirects, proxies del entorno y contenido audiovisual no son permitidos. No se descarga video. Listas que requieran secretos en sus URLs de reproducción no están soportadas.

IPTV-org sigue funcionando con `npm run sync:iptv-org`; utiliza el registro reservado y el mismo motor. Mantiene NSFW/blocklist, retries/timeouts, rollback por lote y retiro lógico. M3U no tiene clasificación NSFW verificable: revisar antes de publicar. MANUAL permite crear canales DRAFT, categorías/país ya registrados, logo/website y señales HLS u otros formatos públicos sin sincronización externa.

No se fusionan canales por nombre ni tvg-id entre proveedores. Vincula fuentes explícitamente con `{ "channelId": 123 }`; mueve solo esa fuente y sus streams, conservando el canal original y sus decisiones/grants. Editar un canal crea overrides protegidos. En streams importados solo se permite modificar priority/isPreferred/isDisabled; el resto pertenece al proveedor. DELETE es lógico. Desactivar proveedor retira sus señales; reactivarlo requiere sync. Nunca modifica publicación, colecciones, ALLOW o DENY.

HTTP ejecuta dentro del proceso sin cola durable: un reinicio interrumpe el trabajo, conserva lotes confirmados y obliga a repetir sync. Una ejecución abandonada se marca CANCELLED al siguiente intento con lock adquirido. Locks se distinguen por proveedor; segundo sync simultáneo retorna 409. Prioridades/preferencia preparan alternativas; no hay failover automático.

XTREAM y REST_API se pueden registrar con `config.baseUrl` HTTPS y secretos separados, pero muestran `syncSupported=false`, rechazan sync y responden 501 en test. Faltan contrato autorizado y validación upstream; no hay URLs de reproducción con usuario/contraseña, bypass, proxy ni retransmisión.

## Providers iniciales

El catálogo opcional v1 se registra con un comando independiente, sin alterar la
migración histórica `MultiProvider1791300000000` ni iniciar la aplicación Nest:

```bash
npm run seed:providers
```

Requiere dependencias instaladas (`npm ci`), `.env` configurado con la configuración
habitual (incluida `PROVIDER_CREDENTIALS_KEY`) y migraciones aplicadas manualmente.
El comando usa el DataSource existente, acepta solamente MariaDB y la base
`hmodevelopers_iptv`, comprueba migraciones pendientes, la migración multiproveedor,
las columnas de Provider y la unicidad de slug. No ejecuta migraciones.
Usa una transacción y un lock de seed; cierra la conexión e imprime un resumen.
Ante un fallo revierte las inserciones y devuelve un código de salida distinto de cero.

| Provider / slug | Tipo | Estado al crearse | Prioridad | Configuración |
| --- | --- | --- | --- | --- |
| IPTV-org / `iptv-org` | IPTV_ORG | Activo, sync habilitada como el bootstrap existente | 0 | `{}`; adaptador oficial https://iptv-org.github.io/api |
| Manual / `manual` | MANUAL | Activo, sin sync | 0 | `{}`; sin URL ni credenciales |
| Free-TV / `free-tv` | M3U_URL | Inactivo, sync deshabilitada | 100 | https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8 |
| FreeCastHub Public IPTV / `freecasthub-public-iptv` | M3U_URL | Inactivo, sync deshabilitada | 110 | https://raw.githubusercontent.com/freecasthub/public-iptv/main/playlist.m3u |
| RW1986 IPTV / `rw1986-iptv` | M3U_URL | Candidato inactivo, sync deshabilitada, requiere revisión | 200 | https://raw.githubusercontent.com/RW1986/IPTV/main/lineup.m3u8 |

Free-TV aporta una playlist curada pública; FreeCastHub describe su colección como
streams gratuitos de broadcasters públicos/oficiales; RW1986 reúne canales FAST y
gratuitos de distintas plataformas y permanece candidato para revisión.
Los enlaces a los repositorios y la necesidad de revisión se guardan en las
**descripciones**: el contrato M3U_URL solo admite `{ "url": "..." }` en config.
No existen campos isSystem o reviewRequired en el modelo actual.
La URL de RW1986 usa el equivalente raw oficial porque el cliente existente
bloquea redirecciones (`maxRedirects: 0`); no se relajó esa protección.
La disponibilidad remota de estas fuentes no se comprueba durante el seed.

Puede ejecutarse repetidamente: identifica por slug, crea únicamente faltantes y
no modifica registros existentes, ni siquiera descripciones vacías. Conserva IDs,
estados, prioridad, URL, config, secretos y fechas de los registros existentes.
Si falta un reservado, lo crea con los defaults del bootstrap. Un slug con tipo
incompatible aborta y revierte la transacción. La versión identifica las definiciones
en código; no introduce tablas ni fuerza actualizaciones de catálogo existente.
`createdBy` es null; no se atribuye la operación a SUPER_ADMIN ni se generan eventos
de auditoría ficticios. El resumen de consola es el registro de esta operación.

**Registrado** significa que existe Provider. **Activo** permite usar la fuente.
**Sincronizado** significa que hubo una importación explícita.
**Publicado** significa que un canal fue aprobado para exposición: un Provider
activo no publica canales. Las futuras sincronizaciones mantienen nuevos canales
como DRAFT conforme al motor existente.

El seed no descarga playlists, contacta HTTP, sincroniza, crea canales/streams,
modifica publicaciones, colecciones, permisos ALLOW/DENY ni usuarios. Solo se
conecta a la base configurada para registrar Providers, sin guardar credenciales.

Flujo posterior de SUPER_ADMIN:

1. Ejecutar `npm run seed:providers`.
2. Consultar `GET /api/admin/providers` y revisar la procedencia del proveedor.
3. Activar con `PATCH /api/admin/providers/:id` y `{ "isActive": true }`.
4. Probar con `POST /api/admin/providers/:id/test` (esta acción sí descarga).
5. Habilitar `syncEnabled` explícitamente mediante PATCH cuando corresponda y ejecutar
   `POST /api/admin/providers/:id/sync`.
6. Consultar `GET /api/admin/providers/:id/sync-runs`.
7. Revisar canales DRAFT, vincular duplicados si corresponde y publicar los seleccionados.

La CLI exige el schema completo y todas las migraciones locales aplicadas. Las
pruebas del seed usan SQL.js aislado; no prueban una MariaDB externa ni la disponibilidad
de las playlists. El comando debe ejecutarlo el operador cuando decida registrar el catálogo.

## Fase 4 — Stream health

Health manual seguro, historial agregado, selección de playback y dashboard backend.
Consulta [operación, endpoints, CLI y migración](docs/stream-health.md).
`npm run check:streams -- --stream ID` usa el mismo motor que HTTP. Empieza con una
fuente; después FreeCastHub, RW1986 y finalmente global. No hay cron automático.
