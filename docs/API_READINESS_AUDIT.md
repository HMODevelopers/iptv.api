# HMODevelopers IPTV API — Backend Readiness Review

Fecha: 2026-10-10, America/Hermosillo. Revisión: `9b162a1`.
Rol: auditor técnico independiente de arquitectura, backend, seguridad y operación.

## Executive Summary

**Frontend: GO WITH CONDITIONS. Producción pública: NOT READY. Pruebas funcionales completas: preparación PARTIAL; se pueden iniciar ahora, pero no declarar terminada la validación MariaDB/browser.**

Sí, existe suficiente backend para comenzar `HMODevelopers/iptv.web` con Next.js. Auth, sesiones, RBAC, autorización editorial, multiproveedor, sincronización, edición, colecciones, auditoría, stream health, selección y dashboard tienen implementación real. Existe `GET /api/me/channels/:id/playback`; no hace falta implementar otro módulo de reproducción ni un dashboard desde cero. El monolito modular es adecuado para esta etapa.

Las condiciones para el frontend son exclusivamente:

1. Acordar y documentar los contratos de sesión/perfil, catálogo, paginación y playback antes de convertirlos en tipos compartidos. El perfil todavía no informa roles/permisos efectivos; resolver esa extensión antes de construir navegación ADMIN y SUPER_ADMIN basada en permisos (M01/M02).
2. Trabajar con fuentes públicas revisadas y hacer que el player consuma playback. Resolver la diferencia entre las respuestas públicas de streams y la política de playback antes de habilitar esas pantallas con datos no revisados (H01/M04/M05). No duplicar selección de fuentes en Next.js.
3. Antes de cerrar la integración del player y del panel health, verificar el esquema de fase 4 en el entorno de integración y probar reproducción desde el origen HTTPS real del frontend. ONLINE no acredita CORS del broadcaster, codecs, segmentos ni headers que un navegador pueda enviar. La reactivación MANUAL debe corregirse antes de aceptar ese flujo de administración (M03).

Estas condiciones permiten empezar login, sesiones, catálogo y administración **ahora**. No exigen terminar toda la preparación operativa antes de escribir frontend. No hay un módulo backend nuevo indispensable que justifique otra fase de funcionalidades antes de empezar: hacen falta ajustes acotados de contratos/correctitud y validación.

Producción requiere resolver los cuatro hallazgos HIGH y superar las puertas operativas descritas abajo: MariaDB real, despliegue HTTPS/proxy, secretos, respaldo/restauración, límites y monitoreo. No se puede certificar un servidor que no se inspeccionó ni equiparar SQL.js con MariaDB 10.11.

Recuento de hallazgos únicos: **BLOCKER 0 · HIGH 4 · MEDIUM 9 · LOW 3**. Las puertas de validación pendientes y los casos de prueba recomendados no se cuentan nuevamente como defectos. HIGH bloquea la aprobación productiva; ninguno exige detener el inicio del frontend bajo las condiciones anteriores. No se observó una toma de cuenta, bypass USER del catálogo ni SSRF hacia IP privadas en los caminos inspeccionados.

## Alcance, evidencia y límites

Se inspeccionaron los módulos de `src/`, las cinco migraciones, todas las suites de `test/`, los CLI y scripts, documentación, `.env.example`, opciones TypeORM, Dockerfile, Compose e historial Git de migraciones. Se realizaron comprobaciones complementarias con SQL.js **en memoria**, transporte simulado y generación OpenAPI sin conexión externa. No se modificaron código, tests, entidades, configuración ni migraciones. El único archivo fuente creado es este informe; build generó artefactos ignorados en `dist/`.

No se ejecutaron `migration:run`, `migration:revert`, seeds, bootstrap, sincronizaciones, health checks reales, despliegues ni operaciones contra el servidor. No se imprimieron valores de `.env`. La validación local de configuración fue satisfactoria; eso no acredita conectividad, fortaleza/gestión operativa de todos los secretos o configuración productiva del servidor.

Las rutas/líneas siguientes corresponden al commit revisado; los rangos son aproximados. «Reproducido» significa observado en una comprobación aislada durante esta auditoría; «riesgo» identifica una consecuencia del diseño que no se ensayó en MariaDB. Las declaraciones del usuario sobre ejecuciones operativas se separan de la evidencia obtenida aquí.

## Validaciones ejecutadas

Runtime: Node `v22.22.1`, npm `9.2.0`.

| Comando | Resultado final | Evidencia |
|---|---|---|
| `npm run lint` | PASS, exit 0 | Sin errores; script sin `--fix` |
| `npm run build` | PASS, exit 0 | Compilación Nest/TypeScript satisfactoria |
| `npm run test` | PASS, exit 0 | 17/17 suites, 231/231 tests, 0 snapshots, 51.336 s |
| `npm run test:integration` | PASS, exit 0 | 6/6 suites, 83/83 tests, 0 snapshots, 47.076 s |
| `npm run migration:show` | Sin resultado válido, exit 1 en sandbox | No se obtuvo estado de migraciones; subprocessos `spawnSync` están restringidos con EPERM |

Los intentos iniciales de tests dentro del sandbox fallaron por `listen EPERM 127.0.0.1`: suite completa 5 failed/12 passed, 68 failed/163 passed, 46.972 s; integración 5 failed/1 passed, 68 failed/15 passed, 42.916 s. Se repitieron con autorización fuera del sandbox para abrir puertos locales y pasaron. Los 83 tests de integración **están incluidos** en los 231; no son 314 tests distintos. Logs 500/501 corresponden a casos negativos intencionales, no a errores de la ejecución final.

El intento de `migration:show` no alcanzó una ejecución CLI verificable y no se repitió contra MariaDB: inspeccionar solo `MigrationShowCommand` no basta para asegurar solo lectura. La dependencia instalada llama a `createMigrationsTableIfNotExist()` desde `MigrationExecutor.showMigrations()` (`node_modules/typeorm/migration/MigrationExecutor.js:107–113,357–400`). Si falta `iptv_migrations`, puede emitir CREATE TABLE. El propio seed reconoce esta limitación (`src/database/seeds/provider-seed.ts:41`). Para una auditoría estricta, consultar primero existencia/ledger con SELECT mediante una conexión autorizada de solo lectura; no ejecutar el comando sin esa garantía. **No se afirma que todas las migraciones estén aplicadas.**

## Matriz de estado

READY describe implementación suficiente para el alcance actual, no certificación operativa universal.

| Área | Estado | Blocker frontend | Blocker producción |
|---|---|---|---|
| Auth | PARTIAL | No; contrato de privilegios pendiente M02 | Validar concurrencia MariaDB y flujo de cliente |
| RBAC | PARTIAL | No | Sí: historial por dashboard H02 |
| Content Access | READY | No | Pruebas de aceptación MariaDB pendientes |
| Providers | READY | No | Verificar credenciales y operación real |
| Sync | RISK | No | Sí: capacidad/shutdown H03/H04 |
| Streams | PARTIAL | No, con datos revisados | Sí: respuestas públicas H01; M03/M05 |
| Stream Health | PARTIAL | No; validar esquema antes de integración | Sí: H03/H04 y aceptación MariaDB |
| Playback | PARTIAL | No; resolver M04 y probar browser | Sí: H01 y prueba HTTPS/browser |
| Dashboard | PARTIAL | No; ya existe | Sí: H02 |
| Swagger | PARTIAL | No; documentar contrato M01 | No por sí solo; deshabilitado en production |
| MariaDB | PARTIAL | No; preparar entorno de integración | Sí: validación fase 4/concurrencia no acreditada |
| Docker | PARTIAL | No | Ensayo del despliegue y shutdown pendiente |
| Security | RISK | No, con alcance controlado | Sí: H01/H02 y controles del despliegue |
| Tests | PARTIAL | No; 231 tests pasan | Falta MariaDB/browser/casos descritos |

## Estado por módulos y contratos existentes

Todas las rutas siguientes llevan el prefijo configurado; se muestra `/api` de `.env.example`. Todas exigen JWT salvo login, refresh y health; Swagger solo se publica fuera de production cuando está habilitado.

| Pantalla/flujo frontend | Endpoints comprobados | Estado y observación |
|---|---|---|
| Login/sesión | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all` | Implementados; tokens Bearer devueltos por JSON |
| Perfil/contraseña/sesiones | `GET /auth/me`, `/auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/change-password`, `GET /me/profile` | Implementados; roles/permisos faltan en perfil M02 |
| Dashboard SUPER_ADMIN | `GET /admin/dashboard` | Implementado, agregación backend; ajustar H02 |
| Usuarios | `GET/POST /users`, `GET/PATCH /users/:id`, `PATCH /users/:id/status` | Implementados; desactivación lógica y sesiones revocadas |
| Roles de usuario | `GET/PUT /users/:id/roles` | Asignación solo SUPER_ADMIN por servicio |
| Roles/permisos | `GET/POST /roles`, `PATCH /roles/:id`, `GET/PUT /roles/:id/permissions`, `GET /permissions` | Administración implementada; no DELETE de roles |
| Providers | `GET/POST /admin/providers`, `GET/PATCH /admin/providers/:id`, `POST .../:id/test`, `POST .../:id/upload` | CRUD funcional por creación/edición/desactivación; upload JSON, no multipart |
| Sincronizaciones | `POST /admin/providers/:id/sync`, `GET .../:id/sync-runs`, `GET /admin/sync-runs` | 202 + historial paginado; no detalle directo/cancelación |
| Canales/streams | `GET /admin/channels`, `GET .../:id`, `GET .../:id/streams`, `POST/PATCH/DELETE /admin/channels[/:id]`, `POST /admin/channels/:id/streams`, `PATCH/DELETE /admin/streams/:id` | CRUD lógico; no lista global de streams ni GET individual de stream |
| Publicaciones | `GET/PATCH /admin/channels/:id/publication` | Lectura/editorial implementadas |
| Colecciones | `GET/POST /admin/collections`, `GET/PATCH/DELETE .../:id`, `GET/PUT .../:id/channels`, `GET .../:id/assignments` | Implementadas; listas internas sin paginación M07 |
| Asignaciones | `GET/PUT /users/:id/collections`, `GET/PUT /users/:id/channels` | Reemplazo transaccional; ALLOW/DENY |
| Auditoría/sesiones admin | `GET /admin/audit`, `GET/DELETE /admin/users/:userId/sessions[/:id]` | Implementadas; auditoría paginada |
| Stream Health | `POST /admin/stream-health/run`, `POST /admin/providers/:id/stream-health`, `POST /admin/channels/:id/check-streams`, `POST /admin/streams/:id/check`, `GET /admin/stream-health/runs`, `GET /admin/stream-health/stats` | Implementados; individual síncrono 200, resto 202 |
| Player | `GET /me/channels/:id/playback`, `GET /admin/channels/:id/playback-candidates` | Selección backend existente; M04 y aceptación browser |
| Catálogo USER | `GET /me/channels[/:id]`, `GET /me/channels/:id/streams`, `GET /me/collections`; legacy `/channels[/:id]` y `/channels/:id/streams` | Misma autorización de contenido; revisar respuesta de streams |
| Referencias/salud | `GET /categories`, `/countries`, `/health` | Referencias autenticadas, health público |

### Arquitectura

`CoreModule` centraliza configuración/DB; seguridad y acceso al contenido son reutilizables; providers encapsula adapters, parser, HTTP seguro y motor neutral; stream health separa checker, ejecución y selección. Controllers delegan la persistencia a servicios. Las excepciones son lecturas simples de referencias en `CatalogsController`, y verificación del permiso editorial según estado en `AdminChannelsController`, ambas pequeñas.

No se observó un ciclo entre módulos Nest ni uso de `forwardRef`. Sí existen referencias cruzadas legítimas entre entidades (Channel/Stream/ProviderChannel/User), resueltas por callbacks TypeORM. `SecurityModule` y `ChannelAccessModule` globales hacen algunas dependencias implícitas, pero las pruebas compilan los módulos y no hay evidencia de un fallo circular. Los servicios mayores son `AdminService` (214 líneas) y `ProvidersService` (185), frente a `ProviderSyncEngine` (158) y `StreamHealthService` (109): no se justifica fragmentarlos solo por tamaño. Las lecturas de repositorios en servicios son adecuadas. Transacciones reales para cambios editoriales, grants y cuentas; GET_LOCK en conexión dedicada para sync/edición por proveedor y health global.

### Auth y políticas de acceso

Evidencia: `src/security/auth.service.ts:23–140`, `settings.ts:9–30`, `guards.ts:18–86`, `policy.ts:16–42`, `admin.service.ts:9–129`, `bootstrap.service.ts:8–29`.

- JWT HS256 con lista explícita de algoritmo, issuer `hmodevelopers-iptv`, audiencias separadas access/refresh, kind y expiración. Secretos independientes validados; access 900 s y refresh absoluto 604800 s por defecto, con rangos.
- Password Argon2id, parámetros mínimos y contraseña fuerte. Login con hash dummy para cuentas desconocidas, respuesta genérica, contador/bloqueo y row lock en MariaDB; máximo de sesiones activas configurable.
- Access comprueba cuenta activa, sesión no revocada/no expirada y roles/permisos actuales de DB. Tokens no contienen privilegios congelados. Desactivación, logout, revocación y cambio de contraseña invalidan sesiones. Cambiar contraseña exige la actual y otra distinta.
- Refresh almacena HMAC, no token plano; rota jti/hash y revoca la sesión al reutilizar un refresh. Bloquea usuario/sesión durante refresh en MariaDB. El frontend debe serializar refresh por sesión: dos refresh legítimos simultáneos con el mismo token pueden activar la detección de reutilización. No es una vulnerabilidad por sí misma; falta ensayo MariaDB concurrente.
- `requiresPasswordChange` restringe rutas por guard. `AuthController` permite la familia auth mientras se exige el cambio; `me/profile` fuera de auth permanece bloqueado. Es compatible con onboarding de contraseña temporal.
- `isSuper`, `requirePermission`, `hasAnyRole` y `catalogPrivileges` implementan bypass central real. Un permiso nuevo funciona para SUPER_ADMIN sin sembrar otro enlace. Puede inspeccionar DRAFT/HIDDEN/DISABLED y fuentes retiradas sin colecciones/ALLOW; tests cubren incluso DENY, revocación y pérdida de rol.
- ADMIN necesita rol administrativo y permisos; asignar roles/permisos exige además `onlySuper`. No puede modificar cuentas privilegiadas ni sus propios roles. El último SUPER_ADMIN activo y roles del sistema están protegidos mediante lock del rol propietario. Bootstrap no eleva cuentas existentes ni crea un segundo propietario.
- USER no administra incluso si tiene un permiso administrativo accidental. No se halló bypass por IDs/filtros/rutas legacy; la excepción de permisos observada es H02 y afecta lectura limitada de historial por ADMIN.

La distinción de catálogo es intencional: ADMIN sigue sujeto a grants en rutas de espectador; en rutas administrativas con permiso obtiene catálogo global. Eso es necesario para administrar y no constituye una evasión accidental.

### Autorización editorial

`src/channel-access/channel-access.service.ts:9–34` aplica en SQL: Channel activo + publicación PUBLISHED + ausencia de DENY + ALLOW o colección activa/asignación no revocada. DENY gana a ALLOW/colecciones. Sin asignación no hay acceso. EXISTS evita duplicados y cuenta solamente recursos autorizados; autorización precede a paginación. `assert` devuelve 404 indistinguible entre canal inexistente y no autorizado. Playback invoca ese mismo control antes de cargar fuentes. Consultas de referencias países/categorías son globales autenticadas; no conceden canales.

### Providers, M3U y sincronización

`AdapterRegistry` contiene adapters reales IPTV_ORG, M3U_URL, M3U_UPLOAD y MANUAL (`src/providers/adapters.ts`). REST_API/XTREAM son placeholders explícitos: `syncSupported=false`, fetch/test 501, sin integración real. No son blockers del alcance actual. Los cinco providers descritos están en `src/database/seeds/provider-catalog.ts`; los tres M3U externos nacen inactivos. Su existencia en el seed no acredita el estado actual de DB.

Parser (`src/providers/m3u.ts:7–74`): acepta EXTM3U/EXTM3U8/BOM y encabezado EXTM3U con atributos; extrae tvg-id/name/logo y group-title; normaliza categorías por hash; deduplica streams por fuente. Límites 5 MiB, 10000 entradas y 16384 caracteres por línea; rechaza NUL/replacement characters, estructura rota, catálogos vacíos/todas las entradas inválidas y manifests HLS `EXT-X-*`. Descarta entradas con URL insegura, credenciales identificables, logo inválido y directivas VLC/Kodi no soportadas; contabiliza descartes. Un catálogo válido puede terminar SUCCESS con discarded > 0. No intenta transformar listas autenticadas en públicas.

`ProviderSyncEngine` reserva proveedor/lock antes de fetch; adapter produce NormalizedSnapshot, luego upserts ProviderChannel/Channel/Stream. La identidad es `(providerId, externalId)` en fuentes y `(providerChannelId, identityKey)` en streams; varias fuentes pueden conservar la misma URL. No se busca fusionar automáticamente por nombre. Vinculación manual mueve fuente/streams, conserva decisiones editoriales en cada canal y recalcula actividad.

Sync conserva IDs, health, prioridad/preferencia/disabled, publicaciones, grants, colecciones y overrides. Nuevos canales DRAFT. Solo el propietario canónico original cambia presentación; alternativas guardan su metadata en ProviderChannel. Retirada es lógica y por proveedor; no elimina alternativas. Cada lote transaccional puede confirmarse independientemente: PARTIAL conserva lotes confirmados y omite reconciliar ausentes. Descarga fallida no importa; recuperación converge por reintento. Esto no es atomicidad de snapshot completo, pero es una política explícita y probada en SQL.js.

`withProvider` comparte GET_LOCK con sync; publicación/edición editorial bloquean canal. Distintos proveedores pueden correr juntos. Posibles deadlocks sobre canales compartidos/categorías globales y orden inverso al vincular dos canales son **riesgos no reproducidos** en MariaDB; un fallo de batch queda PARTIAL, pero no hay retry específico de deadlock. No se afirma una carrera demostrada de refresh ni un lock no liberado en los finally ordinarios. H03/H04 cubren límites/reinicio; M03 cubre un fallo reproducido de actividad MANUAL.

### Stream Health, HLS y selección

El módulo y las entidades existen; persiste status, lastCheckedAt/lastSuccessAt/lastFailureAt, responseTimeMs, lastHttpStatus, failureReason, consecutiveFailures/consecutiveSuccesses y agregados de runs. Success reinicia failures; failure reinicia successes y conserva el último éxito. Checker no altera publicación/disponibilidad. UNKNOWN identifica fuentes sin comprobación o reiniciadas al cambiar URL/feedId.

HLS: GET limitado al manifest, UTF-8 estricto, master con EXT-X-STREAM-INF+línea de variante o media con TARGETDURATION+EXTINF+URI. **No sigue variantes, no resuelve/descarga segmentos y no valida reproducción audiovisual.** URLs relativas quedan como texto del manifest; no se transforman en solicitudes. La validación sintáctica es mínima (M06).

DASH: subconjunto XML sin DTD/entidades externas, tags balanceados MPD/Period/AdaptationSet; no obtiene licencias ni segmentos. Comentarios/CDATA y otras construcciones válidas quedan fuera del subconjunto. MP4/MPEG-TS/UNKNOWN: HEAD; ante 405/501 GET Range 0–1023 con cierre al reunir la muestra. En estos formatos sí puede recibirse una muestra audiovisual; no hay descarga completa. Para UNKNOWN infiere HLS/DASH por ruta/Content-Type, sin cambiar formato persistido. La semántica de ONLINE para respuestas genéricas es débil (M06).

Timeout con deadline único por check, límite de cuerpo real y Content-Length, redirects acotados/revalidados, sin proxy. Persistencia condicionada por id+identityKey+URL evita aplicar el resultado de una URL anterior después de editar identidad. Los campos operativos no se sobrescriben con metadata de sync; los tests verifican conservación y reinicio manual. Si solo cambia un header/formato, no se reinicia health; agregar ese caso a aceptación.

La selección es determinística y está en backend: excluye disabled/unavailable/fuente o provider inactivo/OFFLINE; ordena ONLINE antes de UNKNOWN, luego preferred, stream priority, provider priority, confiabilidad (<3 failures), fallos, latencia e ID. `includeOffline` solo cambia diagnóstico administrativo. No hay TTL automático del status ni scheduler; un ONLINE antiguo puede persistir hasta la siguiente ejecución. En la primera versión manual es aceptable si la UI muestra fecha de verificación y no promete disponibilidad actual permanente.

Playback devuelve una proyección pequeña `channelId, stream.{id,url,format,quality,status,referrer?,userAgent?}`. Provider/credentials no se incluyen. El contrato de selección está resuelto, pero no describe aún qué hacer si falta fuente ni capacidades browser (M01/M04).

## Entidades, índices y migraciones

| Entidades | Comprobación del modelo y DDL |
|---|---|
| Country, Category | PK countryCode varchar(2), PK category int; slug único; languages simple-json/TEXT; nombres acotados |
| Channel, ChannelCategory | Único source/externalId; índices name y country/active; country SET NULL; categorías PK compuesta, índice inverso y CASCADE; isCurrent mantiene relaciones históricas |
| Stream | PK int; identidad por fuente; índices channel/status y lastCheckedAt; canal CASCADE, procedencia RESTRICT; URL/TEXT, nullable metadata; defaults UNKNOWN/available/priority/counters; CHECK status |
| User | PK int, username/email únicos, hash select:false; estado/cambio obligatorio; soft delete y timestamps |
| Role, Permission, UserRole, RolePermission | Nombres/códigos únicos; vínculos con PK compuesta e índices inversos; FKs RESTRICT; isSystem/isActive y timestamps |
| AuthSession, AuditLog | UUID sesión, hash select:false, expiración/revocación; FK user RESTRICT; audit actor SET NULL, metadata TEXT y timestamps |
| Provider, ProviderChannel, ProviderSyncRun | Slug único; config JSON como TEXT; secretos select:false; fuente única provider/externalId y channel/active; FKs RESTRICT; historial provider/startedAt; actor SET NULL |
| ChannelPublication | Canal único, FK RESTRICT, estado DRAFT por defecto, CHECK de estados en migración, actor SET NULL |
| ChannelCollection, ChannelCollectionItem | Colección con actor SET NULL; par colección/canal único, índices por FK, posición; relaciones RESTRICT |
| UserChannelCollection, UserChannelAccess | Pares user/collection y user/channel únicos; FKs/índices, revocación o ALLOW/DENY; actor SET NULL; CHECK accessType en migración |
| StreamHealthRun | PK int, índice startedAt, actor SET NULL, contadores default 0, errorCodes TEXT nullable, estados/datos de ejecución |

Tipos int, varchar, tinyint, datetime(6), TEXT/MEDIUMTEXT y utf8mb4 son compatibles con el diseño MariaDB 10.11. simple-json serializa JSON en TEXT; no supone tipo JSON nativo ni índices por propiedades. No hay búsquedas JSON importantes que necesiten otra estrategia actualmente. No se observaron constraints explícitos con nombres fuera del límite de 64 caracteres; los de nuevas tablas son cortos. No se verificó schema físico remoto.

Cinco migraciones versionadas: InitialCatalog `1760000000000`, SecuritySchema `1791200000000`, SecuritySeed `1791200000001`, MultiProvider `1791300000000`, StreamHealth `1791400000000`. `git log --name-status` muestra cada archivo agregado una vez, sin modificación histórica posterior en el historial local disponible. No se puede certificar historia externa no disponible.

Opciones runtime fuerzan `synchronize=false`, `migrationsRun=false`; validación impide habilitarlos. `synchronize:true/dropSchema` aparece solo en bases SQL.js aisladas de tests. SecuritySeed hace backfill DRAFT y enlaces de seguridad sin credenciales. MultiProvider hace backfill de fuentes antes de sustituir índice único; conserva decisiones editoriales y rechaza rollback destructivo. StreamHealth agrega columnas/runs e índice sin reescribir estados existentes. Los down históricos eliminan tablas/columnas, pero **no se ejecutan automáticamente**; no son destrucción inesperada del arranque.

Drift concreto M08: uploadEncrypted MEDIUMTEXT en migración vs TEXT en entidad; nombres de FKs/uniques/índices automáticos difieren de nombres DDL de seguridad/providers y dos CHECKs de seguridad no están declarados en entidades. Esto no impide consultas actuales, pero impide confiar ciegamente en migration:generate. DDL MariaDB puede hacer commits implícitos; un fallo de migración no garantiza rollback total. Backup/ensayo y diagnóstico antes de reintentar son obligatorios operativamente.

## Blockers

**No se identificó un BLOCKER que obligue a posponer todo el frontend.** Hay defectos reales, límites de contrato y puertas de producción. La ausencia de EPG, favoritos, historial, VOD, billing, suscripciones o apps no se clasifica como blocker. REST_API/XTREAM no se prometen como implementados.

## Hallazgos HIGH

### H01 — URLs rechazadas por playback todavía se entregan por rutas públicas de streams

- **Severidad:** HIGH. Bloquea producción con datos no revisados; no impide desarrollar con fixtures públicos.
- **Archivo:** `src/providers/iptv-org/normalizer.ts:69–80`; `src/channels/channels.service.ts:45–50`; `src/stream-health/selection.ts:30–36`.
- **Clase/método:** `normalizeSnapshot`, `ChannelsService.findStreams`, `StreamSelectionService.playback`.
- **Descripción:** normalización IPTV-org usa publicHttpUrl, que permite querystrings, sin filtro de claves sensibles aplicado en M3U/manual. findStreams entrega URL/referrer de la entidad sin proyección/validación de playback. Un `?token=fixture-only` puede conservarse en importación y llegar a USER por `/me/.../streams` y legacy `/channels/.../streams`, aunque playback lo rechace.
- **Evidencia:** comprobación aislada normalizó esa URL y un USER con PUBLISHED+ALLOW la recibió; se usaron únicamente datos sintéticos. No se afirma que haya un secreto real filtrado actualmente.
- **Impacto:** política «no entregar secretos» inconsistente; una fuente con token de acceso puede distribuirlo a espectadores autorizados al canal. No es IDOR y no expone por esta ruta JWT secrets ni provider.credentialsEncrypted.
- **Recomendación:** definir una política única de enlace público y proyecciones de respuesta de espectador; aplicarla a importación y a todas las rutas de streams, no solo playback. No confiar en una regex de nombres para detectar credenciales opacas; admitir únicamente fuentes revisadas como públicas.

### H02 — Dashboard evade el permiso de historial de sincronizaciones

- **Severidad:** HIGH para RBAC productivo.
- **Archivo:** `src/stream-health/controller.ts:19`; `src/stream-health/service.ts:102–107`; `src/providers/providers.controller.ts:18–24`.
- **Clase/método:** `StreamHealthController.dashboard`, `StreamHealthService.dashboard`, `SyncRunsController.list`.
- **Descripción:** dashboard exige streams.read/channels.read/providers.read/users.read, pero devuelve cinco ProviderSyncRun completos sin sync.history. Las rutas específicas de historial sí exigen ese permiso.
- **Evidencia:** inspección de metadata con Reflector y requirePermission confirmó que ADMIN con los cuatro permisos pasa sin sync.history; el servicio consulta y devuelve lastRuns sin filtro adicional.
- **Impacto:** ADMIN puede leer historial de un módulo no autorizado a través de una ruta alternativa; exposición limitada a cinco ejecuciones, sin payloads/credenciales.
- **Recomendación:** exigir sync.history para esa sección, o omitir/proyectar esa sección según privilegios. Agregar prueba negativa del dashboard.

### H03 — Jobs retienen conexiones del mismo pool de la API sin admisión global

- **Severidad:** HIGH, riesgo de disponibilidad antes de producción.
- **Archivo:** `src/providers/sync-engine.ts:30–65,145–155`; `src/stream-health/service.ts:23–50,79–80`; `src/database/options.ts:19`; `src/providers/providers.service.ts:169–183`.
- **Clase/método:** reservas de sync/health, `withProvider`, `databaseOptions`.
- **Descripción:** cada sync de distinto proveedor retiene QueryRunner durante descarga y procesamiento; health retiene otra conexión durante todo el run. GET_LOCK es por proveedor, no hay límite global de sync ni reserva de capacidad para requests. La concurrencia de checks de health sí está acotada, pero eso no limita los jobs sync.
- **Impacto:** con suficientes jobs para ocupar connectionLimit (default 10; mínimo configurable 1), auth/health/listados esperan conexiones. El límite de requests no es un límite de jobs simultáneos. No se midió agotamiento real ni deadlock del pool en MariaDB.
- **Recomendación:** admisión global acotada dejando capacidad para HTTP, timeout de adquisición y prueba de carga pequeña en copia MariaDB. Una política conservadora de pocos jobs simultáneos basta; no requiere una cola externa.

### H04 — Shutdown de Nest no coordina jobs aceptados en background

- **Severidad:** HIGH para operación productiva.
- **Archivo:** `src/main.ts:17`; `src/providers/sync-engine.ts:56–60,145–155`; `src/stream-health/service.ts:33,46–48,77–80`; `compose.yaml` servicio api.
- **Clase/método:** bootstrap, `ProviderSyncEngine.start/execute`, `StreamHealthService.start/execute`.
- **Descripción:** enableShutdownHooks existe, pero los servicios no implementan drain/cancelación mediante hooks ni mantienen promises esperables al cerrar. TypeORM puede cerrar el pool mientras los jobs siguen; no hay stop_grace_period explícito. Runs huérfanos se cancelan únicamente al iniciar otro run con lock adquirido.
- **Impacto:** un restart tras 202 puede dejar RUNNING visible y ejecución parcial hasta un reintento; apagado no garantiza persistencia final/finally. GET_LOCK se libera al cerrarse la conexión, no significa que el trabajo aceptado se completó.
- **Recomendación:** dejar de aceptar jobs, esperar un plazo acotado o cancelar con estado persistido; coordinar señales y plazo de Compose, y ensayar SIGTERM en staging. Documentar recuperación y mantener idempotencia. La primera versión puede seguir sin queue durable si la operación acepta reintentos manuales y se maneja esta interrupción.

## Hallazgos MEDIUM

### M01 — Contratos de respuesta/OpenAPI incompletos y entidades expuestas

- **Severidad:** MEDIUM; condición de integración frontend.
- **Archivo:** `src/channels/channels.service.ts:30–50`, `channels.controller.ts:8–32`, `security/admin.service.ts:44–214`, `providers/providers.service.ts:22–30,87–106`, `stream-health/controller.ts:12–26`, `stream-health/dto.ts`, `database/entities/catalog.entity.ts`.
- **Clase/método:** list/find/findStreams, respuestas admin, controllers health/playback.
- **Descripción:** Channel/Stream/Collection/Role/ProviderChannel/runs se serializan como entidades; User/Provider tienen filtros de campos pero no contratos independientes. Channel puede incluir editorialOverrides no documentado. Se omitieron schemas de respuesta para auth/me, playback, dashboard, stats y la mayoría de administración; HealthQuery tampoco tiene ApiProperty. Propiedades health de Stream no aparecen en Swagger y providerChannelId nullable se infiere como object.
- **Evidencia:** OpenAPI generado sin red: los cuatro GET citados devuelven `responses.200={description:""}`; providerChannelId es `{type:"object",nullable:true}`; lastSuccessAt/lastFailureAt/responseTimeMs/lastHttpStatus/consecutiveFailures/isDisabled no aparecen; LoginDto.password no tiene writeOnly.
- **Impacto:** tipos generados incorrectos/incompletos y acoplamiento frontend con cambios internos. El filtro de secretos de Provider/User sí existe y no debe confundirse con ausencia de seguridad total.
- **Recomendación:** proyecciones/DTO de respuesta para los contratos consumidos por web, schemas explícitos y writeOnly en password/refresh. Documentar 200/201/202/400/401/403/404/409/429 según ruta. No es necesario rehacer cada entidad antes de escribir una pantalla.

### M02 — Perfil no expone privilegios efectivos del usuario autenticado

- **Severidad:** MEDIUM; resolver antes de navegación por roles/permisos.
- **Archivo:** `src/security/auth.service.ts:47,89,112`; `auth.controller.ts:16`; `src/channels/content.controller.ts:23`.
- **Clase/método:** `AuthService.tokens/authenticate/profile`, `me/profile`.
- **Descripción:** el servidor carga roles/permisos en Principal, pero perfil devuelve solo safeUser; login solo tokens/TTL/cambio obligatorio. JWT tampoco contiene roles, correctamente. No existe una ruta propia alternativa de privilegios utilizable por todo usuario.
- **Impacto:** la UI no puede descubrir de forma fiable SUPER_ADMIN/ADMIN y permisos disponibles para menús; consultar `/users/:id/roles` requiere users.read y tampoco entrega permisos efectivos.
- **Recomendación:** extender `/auth/me` con roles/permissions efectivos o una capacidad equivalente, sin tratar esa información de UI como control de seguridad. Revalidar tras cambios o sesión renovada.

### M03 — Reactivar canal MANUAL creado inactivo no reactiva su fuente

- **Severidad:** MEDIUM; fallo funcional reproducido.
- **Archivo:** `src/providers/providers.service.ts:114–131,139–151`; `src/providers/sync-engine.ts:21–27`.
- **Clase/método:** createChannel/updateChannel/createStream/refreshCanonical.
- **Descripción:** createChannel copia isActive=false a ProviderChannel. updateChannel con true solo cambia Channel/override; createStream reutiliza el link inactivo. MANUAL no sincroniza, por lo que no hay mecanismo normal que cambie pc.isActive.
- **Evidencia:** crear inactivo → reactivar → añadir stream produjo pc.isActive=false, canonical isActive=false al recalcular y playback 404 en SQL.js.
- **Impacto:** flujo admin aparentemente válido termina sin fuente elegible; puede revertir actividad del canal al añadir stream.
- **Recomendación:** separar decisión editorial de presencia de fuente MANUAL y definir reactivación coherente. Agregar regresión con creación inactiva y reactivación; no requiere módulo nuevo.

### M04 — Playback valida URL después de elegir best y no usa alternativa segura

- **Severidad:** MEDIUM; fallo funcional reproducido.
- **Archivo:** `src/stream-health/selection.ts:30–34`.
- **Clase/método:** `StreamSelectionService.playback/candidates`.
- **Descripción:** elige primero por score y luego rechaza URL con query sensible; una segunda fuente pública válida queda ignorada. candidates no muestra ese motivo de exclusión.
- **Evidencia:** dos fuentes ONLINE; preferred con token sintético + alternativa pública. Playback devolvió 404 pese a alternativa elegible.
- **Impacto:** falso «sin reproducción» y diagnóstico administrativo inconsistente.
- **Recomendación:** incorporar seguridad del enlace a elegibilidad antes de ordenar y usar el mismo motivo en candidates. La selección debe permanecer en backend.

### M05 — Lista de streams de espectador no filtra actividad de fuente/proveedor

- **Severidad:** MEDIUM.
- **Archivo:** `src/channels/channels.service.ts:45–50`; `src/stream-health/selection.ts:8–14`; `src/providers/providers.service.ts:59–60`.
- **Clase/método:** `ChannelsService.findStreams`, `exclusion`.
- **Descripción:** findStreams filtra available/disabled pero no pc/p activos. La desactivación HTTP intenta propagar available=false, pero el modelo permite estados divergentes; playback sí revalida ambas actividades.
- **Evidencia:** con USER autorizado y provider inactivo/stream todavía available, la lista devolvió el stream en SQL.js; playback lo excluiría. No se afirma que ese estado exista hoy en MariaDB.
- **Impacto:** contrato de «fuentes disponibles» distinto del de reproducción; no evade la autorización del canal.
- **Recomendación:** una proyección de viewer con elegibilidad coherente o documentar explícitamente que la lista es metadata y jamás selección; player mediante playback.

### M06 — ONLINE de UNKNOWN y validación HLS no acreditan contenido reproducible

- **Severidad:** MEDIUM.
- **Archivo:** `src/stream-health/checker.ts:12–16,83–110`; `src/stream-health/selection.ts:17–20`.
- **Clase/método:** validHls/StreamHealthChecker.check/healthScore.
- **Descripción:** UNKNOWN con HEAD 200 application/json se marca ONLINE sin identificar contenido audiovisual. HLS reconoce tags y existencia de línea siguiente, sin validar sintaxis de URI ni resolver variantes. Puede asignar mayor score a un recurso genérico inválido.
- **Evidencia:** checker con transporte simulado devolvió ONLINE para JSON 200; validHls aceptó una variante cuya línea era `not a valid URI`.
- **Impacto:** falsos positivos y posible selección de recurso no audiovisual. No es una falla SSRF: no se solicita esa URI del manifest.
- **Recomendación:** distinguir alcanzabilidad de validación de formato y conservar UNKNOWN/razón controlada si no se identifica contenido. Fortalecer validación sintáctica local sin descargar segmentos. Probar el browser con fuentes reales antes de afirmar soporte del player.

### M07 — Listas internas no acotadas y envelopes/filtros inconsistentes

- **Severidad:** MEDIUM.
- **Archivo:** `src/security/admin.service.ts:93–94,131–148,186–190`; `src/channel-access/channel-access.service.ts:29–33`; `src/catalogs/catalogs.module.ts:14–17`; `src/providers/providers.service.ts:27–30,87–95`; `src/stream-health/service.ts:84–86`.
- **Clase/método:** roles/permissions/collectionChannels/collectionAssignments/userCollections/userChannels/collections y listas paginadas.
- **Descripción:** usuarios, canales, providers, fuentes, runs, auditoría y colecciones principales usan page/limit máximo 100. Pero miembros/asignaciones de colección y permisos/catálogos/colecciones propias devuelven arrays completos. PUT acotado a 500 no limita el acumulado por colección de usuarios. Envelopes fuera de ChannelsService no devuelven totalPages; filtros/sort de usuarios/providers/audit/colecciones son limitados.
- **Impacto:** las pantallas de membresías pueden cargar miles de filas/relaciones; clientes necesitan adapters para envelopes y búsqueda de usuario todavía no tiene endpoint específico.
- **Recomendación:** paginar primero miembros/asignaciones que pueden crecer; uniformar envelope y documentar filtros existentes. Países/roles/permisos pequeños pueden seguir como referencias completas si se establece ese contrato. No exigir sort arbitrario a todo endpoint.

### M08 — Drift explícito entre entidad y migración de upload y constraints

- **Severidad:** MEDIUM.
- **Archivo:** `src/database/entities/provider.entity.ts:19`; `src/database/migrations/1791300000000-MultiProvider.ts:9–12`; `security.entity.ts` y `1791200000000-SecuritySchema.ts`.
- **Clase/método:** Provider.uploadEncrypted y metadata de entidades.
- **Descripción:** uploadEncrypted es TEXT en entidad, MEDIUMTEXT en DDL. La diferencia ya está documentada en phase3-report por compatibilidad SQL.js. CHECK publicación/accessType y nombres de algunas FKs/uniques/índices de seguridad/providers también difieren de metadata automática.
- **Impacto:** migrate:generate puede proponer reducción de columna o reemplazos de constraints; TEXT no contiene cifrado/base64 de uploads cercanos a 5 MiB. Runtime actual usa el DDL manual y no sincroniza automáticamente.
- **Recomendación:** preservar MEDIUMTEXT y revisar cualquier SQL generado; reconciliar metadata con DDL sin editar migraciones históricas. Agregar ensayo de uploads grandes en MariaDB; SQL.js no detecta ese límite.

### M09 — Rate limits y proxy requieren una política de despliegue explícita

- **Severidad:** MEDIUM para una primera réplica; condición productiva si hay proxy/réplicas.
- **Archivo:** `src/security/guards.ts:72–86`; `src/app.module.ts:15–16`; `src/common/configurable-throttler.guard.ts`; `src/common/configure-app.ts`; `src/main.ts`.
- **Clase/método:** LoginRateGuard, ConfigurableThrottlerGuard, configuración Express.
- **Descripción:** login/refresh comparten límite por req.ip local, TTL configurable y Map acotado a 10000; throttler general usa storage en memoria. No hay trust proxy configurado ni store distribuido. La API no confía en X-Forwarded-For enviado directamente, lo cual evita spoofing, pero detrás de proxy ve su IP. Los endpoints sync/health solo agregan exclusión por job, sin límite dedicado de admisión.
- **Impacto:** usuarios de un proxy pueden compartir ventana; varias réplicas multiplican límites y reiniciar los resetea. Cuenta mantiene bloqueo de login en DB; eso no resuelve límite por IP ni refresh.
- **Recomendación:** para una instancia, límites del proxy y confianza solo en hops/orígenes controlados, además de límites locales. Para varias réplicas, política común de edge o almacenamiento compartido si se requiere; no introducir Redis por defecto. Mantener control de acceso/red al backend y no habilitar trust proxy indiscriminado.

## Hallazgos LOW

### L01 — Auditoría de jobs/edición no conserva IP y logging CLI desigual

- **Severidad:** LOW.
- **Archivo:** `src/providers/providers.controller.ts`, `providers.service.ts`, `sync-engine.ts:49`; `src/stream-health/controller.ts`, `service.ts:37`; `src/cli/check-streams.ts:20`; `src/cli/bootstrap-super-admin.ts:63–67`.
- **Clase/método:** llamadas AuditService.record y bootstrap de CLI.
- **Descripción:** operaciones sensibles sí registran actor/acción/IDs/estado en auditoría; provider/health/edición normalmente omiten req.ip. El CLI check-streams crea ApplicationContext con logger por defecto; bootstrap filtra QueryFailedError pero permite mensajes genéricos de otros errores. El entrypoint HTTP y sync CLI sí usan SanitizedLogger.
- **Impacto:** menor trazabilidad y política de logs inconsistente. No se reprodujo una filtración real en esos CLI y no se afirma que impriman passwords siempre.
- **Recomendación:** propagar contexto mínimo de IP y unificar mensajes/logger sanitizado de CLI. No guardar payloads, headers Authorization, URLs autenticadas o excepciones completas.

### L02 — Documentación previa describe comportamientos ya superados

- **Severidad:** LOW.
- **Archivo:** `README.md:27,65,324,333`; `docs/phase3-report.md:29,102`; `docs/stream-health.md`.
- **Clase/método:** documentación de fases.
- **Descripción:** README afirma que no se verifican streams ni se solicitan URLs de reproducción y parte de restricciones viewer describe solo available; fase 4 sí verifica URLs y filtra disabled. Documentos de fase 3 dicen que no se ejecutó MariaDB; el usuario comunica ejecución operativa posterior.
- **Impacto:** onboarding ambiguo; no puede usarse una nota histórica como estado actual de despliegue.
- **Recomendación:** actualizar la guía principal cuando se autoricen cambios, enlazar fase 4 y mantener evidencia fechada de operaciones MariaDB.

### L03 — Nulls, conflictos y edición reversible necesitan contrato más preciso

- **Severidad:** LOW.
- **Archivo:** `src/security/dto.ts:29–52,71–80`; `src/security/admin.service.ts:38–42,62–66`; `src/providers/dto.ts:8–71`; `providers.service.ts:41,129,166`.
- **Clase/método:** DTOs opcionales, unique/updateUser/updateChannel/updateStream.
- **Descripción:** IsOptional/PartialType de seguridad puede aceptar null para columnas obligatorias (p.ej. firstName) y terminar en error DB 500; DTOs provider rechazan null, incluso para limpiar metadata nullable. No hay endpoint para borrar override editorial y volver a upstream. El manejo 409 de unicidad está centralizado en usuarios/roles, pero no en todos los create de providers concurrentes.
- **Impacto:** UX administrativa confusa en casos límite; no es escalación de privilegios ni evidencia de filtración SQL al cliente (el filtro global oculta errores DB).
- **Recomendación:** especificar campos limpiables, null/undefined, retorno a upstream y mapeo de conflictos relevantes. Añadir pruebas de payload null y concurrencia de slug antes de prometer esos flujos en UI.

## Security Findings

H01/H02 son los defectos de seguridad concretos. El resto de controles inspeccionados tiene una base sólida:

- Secretos JWT diferentes, mínimos/rangos validados por `securitySettings`; PROVIDER_CREDENTIALS_KEY obligatoria base64 canónica de 32 bytes por `credentials-key.ts`. AES-256-GCM con nonce aleatorio y AAD por propósito/provider; tests de tampering/cambio de contexto. `select:false` más proyección explícita protege credenciales y upload incluso después de crear/editar. Query/key heuristics no pueden detectar toda credencial opaca.
- `.env` excluido de Git; `git ls-files` solo muestra `.env.example` entre archivos de entorno. El historial local consultado no muestra `.env`, `.aws`, `.pem` ni `.key` versionados. Esto no es una certificación de todos los remotos/commits inalcanzables ni un escaneo de secretos externo. No se encontraron secretos operativos literales en el código inspeccionado; fixtures usan valores sintéticos/aleatorios.
- SQL parameterizado, filtros sort por enum, whitelist/forbidNonWhitelisted, límites de DTOs y errores internos sin SQL/stacks en HTTP. AuditService recibe metadatos controlados, no request bodies; eventos de usuarios/roles/permisos/providers/sync/edición/publicación/colecciones/grants/health están implementados. Denegaciones role/permission se auditan; fallos mutativos autenticados tienen interceptor. Fallos públicos de refresh sin claims válidos no generan evento individual: no bloquea el alcance actual.
- Logger HTTP sanitiza errores, cliente IPTV-org/M3U captura Axios sin imprimir headers/URLs y TypeORM no registra queries/parameters (`options.ts:15–17`). No hay garantía de logging externo/proxy: debe verificarse en despliegue.

### SSRF, DNS y redirecciones

Evidencia: `src/common/url-policy.ts`, `src/providers/safe-http.ts`, `src/providers/iptv-org/iptv-org.client.ts:30–75`, `src/stream-health/checker.ts:42–78`; suites normalizer/providers/provider-http/stream-health-http.

La política limita protocolos HTTP(S), rechaza userinfo, IP privadas/reservadas/loopback/link-local/multicast, IPv6 local y IPv4 mapped mediante `ipaddr.process(...).range() === 'unicast'`. Rechaza nombres localhost/local/internal y hosts sin punto. El lookup del socket/agent valida las direcciones efectivamente retornadas y utilizadas en conexión; no hay lookup previo separado vulnerable a cambio DNS entre validación y conexión. En provider M3U exige HTTPS, sin fragmentos ni querykeys sensibles; proxy false y redirects 0. IPTV-org host/config son oficiales y fijos. Health permite HTTP(S) público y revalida cada hop, con nuevo lookup y máximo de redirects; descarta headers personalizados en cambio de origen. No usa proxies del entorno. URI de segmentos/logos no se descarga por la API.

No se identificó un bypass SSRF reproducible hacia redes privadas en estos caminos. Tests cubren IP literal/mapped, DNS privado, redirect privado/cap, límite real y timeout DNS. Falta ensayo con transporte real controlado IPv6/multiple-addresses/HTTPS; mocks no prueban todos los detalles del socket. La API sí permite contactar hosts/puertos públicos configurados por un administrador autorizado; eso es su función, no acceso público arbitrario. Cualquier futuro proxy de imágenes en Next.js deberá tener su propia validación: los metadatos actuales no acreditan seguridad de un nuevo fetch server-side.

### CORS, Helmet y errores

Orígenes explícitos, métodos GET/HEAD/OPTIONS/POST/PUT/PATCH/DELETE, credentials=false; no wildcard. Compatible con frontend separado que envía Bearer y JSON: preflight puede reflejar headers solicitados, no hay allowedHeaders restrictivo que bloquee Authorization. Si Next.js usa cookies hacia esta API, necesita un contrato adicional; actualmente no hay cookies ni CSRF de sesión cookie. Helmet usa defaults y Swagger queda excluido de NODE_ENV=production aun con flag true. CSP de la API no controla CSP ni CORS del sitio/stream externo.

400 validaciones; 401 credenciales; 403 rol/permiso/cambio obligatorio; 404 contenido inaccesible o playback sin fuente; 409 locks/último owner/duplicados manejados; 429 límites; 500 sanitizado; 501 adapters pendientes. El cliente no recibe stack, SQL o error Axios en los caminos inspeccionados. No hay un código machine-readable único para distinguir causas de 404 de playback; documentarlo dentro de M01 evita parsear texto.

## Performance Findings

H03 y M07 son los puntos prioritarios. No se midieron tiempos/planes remotos; no se afirma una consulta lenta demostrada en producción.

- `/channels`, `/me/channels`, `/admin/channels`: joins de categorías y EXISTS de grants/publicaciones sin N+1 por canal; getManyAndCount puede producir consultas adicionales para paginar relaciones, pero no carga todo el catálogo. Únicos por user/channel, user/collection y collection/channel respaldan EXISTS; índices inversos respaldan enlaces. Buscar `%texto%` con LOWER no aprovechará un B-tree para toda la coincidencia; comprobar EXPLAIN antes de introducir otra tecnología.
- Playback/candidates cargan todas las fuentes **del canal**, con providerChannel/provider; ordenación en memoria proporcional a fuentes del canal, no al catálogo. Adecuado a la etapa si esa cardinalidad es pequeña. No hay consultas por fuente en un loop de selección.
- Dashboard existe: counts de canales/providers/users, publicaciones agrupadas, cinco runs y un health run. `dashboard()` llama a `stats()` completo aunque solo utiliza totales, por lo que calcula agrupación de providers innecesaria para esa respuesta. Optimización puntual si mediciones la justifican, sin nuevo módulo.
- Stats agrega COUNT/SUM/AVG/MAX en SQL; no carga cada stream. Índice lastCheckedAt existe, aunque SUM condicional global sigue escaneando filas. Filtros de runs por status/actor y audit por fecha/módulo no tienen índices compuestos especializados porque varios filtros tampoco están implementados; medir volumen/EXPLAIN antes de añadirlos.
- Sync usa múltiples lecturas/escrituras por canal/stream y carga streams por fuente, categorías y fuentes stale; patrón correcto para una primera importación, pero hay costo proporcional a registros. No hay benchmarks que acrediten tiempo objetivo. `provider.disable` recorre todas las fuentes en una transacción, lo cual puede sostener locks mucho tiempo en proveedores grandes.

## Operational Findings

### MariaDB real: qué se sabe

| Componente | Evidencia disponible | Clasificación |
|---|---|---|
| Sincronización multiproveedor contra MariaDB | Usuario declara que ya se utilizó contra MariaDB real | VALIDADO OPERATIVAMENTE SEGÚN USUARIO; no repetido/certificado aquí |
| Imports de fuentes reales y backfill fase 3 | Contexto de providers utilizados; docs anteriores indican pendientes durante implementación | Evidencia histórica parcial; faltan resultados/ledger fechados para confirmar cada provider/migración |
| Migración StreamHealth aplicada | Existe DDL; solicitud dice fase implementada, no aporta ledger exitoso | NO CONFIRMADO por esta auditoría |
| GET_LOCK entre API/CLI/réplicas | Código MariaDB y metadata/mocks; SQL.js usa exclusión local | NO VALIDADO COMPLETAMENTE en DB real |
| Refresh/login/bootstrap/último owner concurrentes | Row locks en código; suites SQL.js | NO VALIDADO COMPLETAMENTE en MariaDB |
| Health concurrente con sync/edición, contadores y dashboard SQL | Tests SQL.js y checker simulado pasan | NO VALIDADO COMPLETAMENTE en MariaDB |
| Deadlocks, pool, límites TEXT/MEDIUMTEXT, timezone/microsegundos | Inspección de DDL/metadata | NO VALIDADO OPERATIVAMENTE aquí |

No se inventan conteos ni estados actuales de proveedores. La mención de fuentes utilizadas no acredita que Free-TV, FreeCastHub y RW1986 tengan todas un último SUCCESS, que health haya corrido o que todas las migraciones estén aplicadas.

### Health de aplicación

`GET /api/health` es público y hace `SELECT 1`; responde 503 sanitizado cuando falla DB (`src/health/health.module.ts:21–27`). Es una readiness básica API+DB, no verifica ledger/schema/capacidad/jobs/fuentes remotas. No debe consultar broadcasters ni hacer checks masivos. Conviene verificar migraciones/schema durante aceptación/despliegue, y monitorear jobs por sus métricas/historial. El SELECT no tiene deadline propio en ese método; pool saturado puede retrasarlo (H03). La sonda Docker sí aborta su fetch a 4 s. El rate limit general también puede alcanzar health si comparte IP/tráfico; comprobar el comportamiento detrás del proxy.

### Docker y servidor

Dockerfile: multistage, Node 22, npm ci, producción omit=dev, usuario node, CMD exec, puerto 3000 y healthcheck. Compose: init=true, read_only, tmpfs, no-new-privileges, cap_drop ALL y red DB existente; DB_HOST rc_mysql, no contenedor DB nuevo. scripts de migración/bootstrap eligen dist cuando src no existe, por lo que runtime no requiere ts-node. No se construyó una imagen ni se levantó Compose durante esta auditoría.

Compatibilidad estática con un servidor que tenga red externa y alias rc_mysql es razonable; compatibilidad **operativa** no acreditada. El puerto publicado no limita binding a loopback. No hay reverse proxy/TLS/firewall/backups/monitoring definidos en este repo; pueden existir fuera, pero no se inspeccionaron. No declarar que el servidor carece de ellos: verificar antes de aprobación pública.

### Jobs sin queue durable

**Aceptables para una primera versión administrada**, siempre que sync/health sean manuales, se admita reintento idempotente y se resuelvan H03/H04. No hace falta Redis/RabbitMQ para comenzar frontend. Runs persistidos y recuperación al siguiente intento permiten reconstruir el estado, pero no garantizan reanudación ni SLA de trabajos ya aceptados. Una queue durable sería necesaria si el producto exige que un 202 sobreviva reinicios y se reintente automáticamente; no es obligación demostrada de la etapa actual. Scheduler, retención e historial individual de probes son OPTIONAL.

### Puertas para producción (no ensayadas aquí)

1. Resolver H01/H02 y los flujos MANUAL/playback relevantes; congelar respuestas públicas y pruebas de regresión.
2. En copia autorizada MariaDB 10.11: aplicar/verificar las cinco migraciones, revisar DDL físico y probar preservación de IDs/estados/grants, upload grande, locks, refresh paralelo, health+sync+edición y dashboard/stats. No hacerlo primero en producción.
3. Acotar jobs/pool y ensayar SIGTERM/recuperación, con readiness y plazo del contenedor coordinados.
4. Verificar HTTPS/reverse proxy, acceso de red al backend y DB, origen Next.js real, límites por cliente y headers confiables. DB_SSL es configurable y valida certificados si se activa; su necesidad concreta depende de la red del despliegue. Config no impone HELMET/RATE enabled en production: aceptar valores explícitos solo con controles equivalentes acreditados.
5. Gestionar secretos fuera de Git, cuenta DB runtime con mínimo privilegio y cuenta DDL separada; respaldo y restauración comprobados, incluyendo clave de cifrado. No rotar PROVIDER_CREDENTIALS_KEY sin recifrar/backups compatibles.
6. Monitorear API/DB, runs FAILED/PARTIAL/huérfanos, tiempos de jobs y volumen logs/tabla audit/runs; registrar una política de recuperación. Sanitización actual elimina detalles internos; prever diagnóstico interno controlado sin volver a exponer errores sensibles.
7. Probar reproducción desde browser/origen HTTPS real: manifest/variantes/segmentos, CORS del upstream, contenido mixto y headers. El contrato devuelve referrer/userAgent como metadata, pero el browser no permite fijarlos libremente. No añadir proxy/restreaming por defecto; seleccionar fuentes compatibles con playback directo.

## Missing Endpoints

No falta un módulo de dashboard o playback. Prioridades concretas:

| Necesidad | Situación | Clasificación |
|---|---|---|
| Privilegios propios | Extender `/auth/me` o ruta equivalente; actualmente faltan roles/permisos efectivos | RECOMMENDED antes de menús administrativos (M02) |
| Detalle de run por ID | Hoy hay listas/filtros sin `GET /admin/sync-runs/:id` o `/admin/stream-health/runs/:id` | RECOMMENDED si el frontend necesita polling robusto de jobs antiguos; no blocker del inicio |
| Paginación miembros/asignaciones | Hoy arrays completos | RECOMMENDED conforme a M07 |
| Búsqueda de usuarios/lista global de streams/GET stream | Se puede comenzar con páginas de usuarios y streams por canal; no hay endpoints especializados | RECOMMENDED solo cuando la pantalla los necesite |
| Eliminar role o reset de override | roles.delete sembrado sin ruta DELETE; roles custom se pueden desactivar; no reset de override | OPTIONAL para eliminación física; mejora puntual para reversión editorial L03 |
| EPG/favoritos/VOD/billing/etc. | Fuera del alcance solicitado | OPTIONAL, no bloquea |

No pedir nuevas rutas por simetría únicamente. Si se necesita abrir detalle de una ejecución por ID, buscar solo la página más reciente no es fiable con muchos runs; resolverlo cuando se implemente esa interacción.

## Missing Tests

Las 17 suites cubren comportamientos reales, no solo nombres:

| Área | Cobertura inspeccionada | Huecos prioritarios |
|---|---|---|
| Auth/RBAC | auth-content.integration + security-policy: JWT inválido/expirado, refresh reuse, logout, password, bloqueo, máximo sesiones, SUPER bypass/último owner/ADMIN/USER | issuer/audience explícitos negativos y carreras reales MariaDB; refresh simultáneo desde cliente |
| Content access | PUBLISHED/active/grants/DENY/colecciones, revocación, filtros/totales, IDOR en familias legacy/me | Matriz completa de estados en playback y fuentes divergentes |
| Providers/sync | providers.integration/catalog.integration: CRUD, permisos, fuentes múltiples, linking, retirada, DRAFT, IDs, overrides/health, PARTIAL/rollback, locks locales | M03, pool/deadlocks MariaDB, escrituras compartidas de distintos providers |
| M3U/secretos/SSRF | providers/provider-http/normalizer/iptv-org-client: fixtures, descartes, límites, encoding, AES-GCM, URL/DNS/proxy/redirects | H01 importación IPTV-org→viewer; HTTPS/IPv6 real controlado, múltiples respuestas DNS |
| Stream health | stream-health/stream-health-http/stream-health.integration: formato, counters, filtros, pool de checks, límite de cuerpo, timeout, redirects, auth y preservación | M06 JSON/URI; headers/formato editados en vuelo; run interrumpido; DB real |
| Playback | ranking/exclusion unitarios y HTTP con grants/404/sin internals | M04 alternativa segura, H01 rutas alternativas, stale/UNKNOWN y browser real |
| Migraciones | provider-migration/stream-health-migration/security-policy: SQL capturado y metadata offline; seed SQL.js | Ejecutar chain/backfills/preservación en copia MariaDB; drift completo y upload grande |
| Dashboard | Servicio existe; suite health comprueba stats | No hay prueba HTTP de dashboard ni prueba negativa sync.history (H02); métricas en MariaDB |
| Config/HTTP | environment/security.integration/catalog.integration: validación, 429, filtro errores, Helmet/CORS/OpenAPI | Documento completo de nuevos endpoints, nulls/conflictos; proxy y Docker/shutdown |

No se midió cobertura porcentual; los scripts solicitados no generan un informe de coverage. Tests de migración con mocks y buildMetadatas no ejecutan DDL MariaDB. Las comprobaciones complementarias de esta auditoría no se incorporaron como tests porque no se autorizaron cambios.

## Technical Debt

M01–M09 y L01–L03 describen deuda concreta. Adicionalmente, OPTIONAL sin impacto actual demostrado: scheduler/retención de runs, historial individual de health y cola durable si aparecen requisitos de garantía de ejecución. No hay una razón comprobada para microservicios, Kubernetes, Kafka, service mesh o cambio de ORM/DB. El modelo de canal canónico, fuentes y autorización editorial permite agregar EPG/favoritos/apps después sin rehacer esta base.

## Frontend Readiness

**GO WITH CONDITIONS.** Se puede detener la expansión de funcionalidades backend y comenzar Next.js. Hay endpoints suficientes para todos los módulos principales pedidos. Los ajustes de sesión/contrato, rutas públicas de streams y correctitud del player se pueden abordar de manera acotada durante la integración, antes de aceptar esas pantallas; la validación operativa se mantiene como un trabajo separado.

El frontend no debe interpretar UNKNOWN como ONLINE, duplicar healthScore, construir URLs con credenciales, usar scopes administrativos para catálogo USER ni inferir permisos decodificando JWT. Debe gestionar refresh como operación única por sesión, atender cambio obligatorio de contraseña y manejar 202/409/404 según contratos acordados. Eso deriva del backend existente, no exige un módulo nuevo.

## Production Readiness

**NOT READY para un despliegue público aprobado con la evidencia disponible.** Resolver H01–H04 y completar las puertas MariaDB/servidor/browser es necesario. CORS/Helmet, JWT/Argon2, Docker non-root, health y migraciones manuales constituyen una buena base, pero por sí solos no acreditan backup, TLS/proxy, carga, shutdown ni operación real de fase 4.

La preparación para pruebas funcionales es **GO para iniciarlas en entorno controlado; PARTIAL para declararlas completas**. SQL.js y las 231 pruebas pasan; faltan aceptación MariaDB y browser/operación. No se necesita agregar funcionalidades futuras para superar esas puertas.

## Top 5 acciones recomendadas

1. Unificar política/proyección pública de streams y cerrar lectura de sync history por dashboard (H01/H02).
2. Definir DTOs de sesión/respuesta y exponer privilegios efectivos propios; documentar OpenAPI antes de generar cliente Next.js (M01/M02).
3. Corregir reactivación MANUAL y fallback seguro de playback, con regresiones; probar el player desde HTTPS real (M03/M04/M06).
4. Completar aceptación en copia MariaDB 10.11 de migraciones, locks, refresh, health/sync, stats/dashboard y uploads grandes.
5. Acotar jobs y coordinar shutdown/recuperación; verificar proxy/TLS, secretos, restauración y monitoreo del despliegue.
