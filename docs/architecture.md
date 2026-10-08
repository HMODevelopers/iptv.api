# Arquitectura multiproveedor

El catálogo persistido desacopla al cliente de las fuentes. `ProvidersModule` incorpora administración y sincronización HTTP; el CLI IPTV-org conserva compatibilidad y utiliza la misma clase `ProviderSyncEngine`. No hay un segundo motor de persistencia ni publicación automática.

```text
IPTV-org / M3U URL / M3U upload / Manual
              ↓ AdapterRegistry → ProviderAdapter
              ↓ NormalizedSnapshot (contrato neutral)
              ↓ ProviderSyncEngine (reserva, descarga, lotes, reconciliación)
Provider → ProviderChannel → Channel ← publicaciones / colecciones / grants
                ↓ Stream (procedencia, prioridad, disponibilidad)
              ↓ REST con JWT / roles / permisos / autorización editorial
```

## Auditoría del modelo anterior

`CatalogProvider` y `ProviderSnapshot` describían los seis recursos específicos de IPTV-org. `normalizeSnapshot` exigía países, categorías y blocklist; eso no constituye un contrato válido para M3U. Channel tenía identidad `(source, externalId)` y Stream unicidad `(channelId, identityKey)`. El sincronizador modificaba todas las alternativas de cada canal y desactivaba canales por source, por lo que no era seguro compartir un canal entre fuentes. Solo había importación CLI y permisos reservados, sin administración de proveedores ni historial persistente.

Se reutilizan el cliente oficial (retries, timeout, DNS, bloqueo de redirects/proxies), normalizador (NSFW/DMCA), entidades del catálogo, publicaciones DRAFT, política global de SUPER_ADMIN, guards administrativos, auditoría, paginación y migraciones manuales. Las tres migraciones históricas se mantienen intactas.

## Modelo y migración

- `Provider`: configuración pública validada por adaptador, tipo, prioridad, activación, ejecución manual, fechas, autor y secretos cifrados ocultos en consultas ordinarias. `syncMode=MANUAL` no implica el tipo MANUAL: todas las ejecuciones son solicitadas por operador.
- `ProviderChannel`: identidad única `(providerId, externalId)`, enlace canónico, nombre/logo originales, metadata importada, actividad y última observación. No todos los proveedores tienen países, categorías o EPG.
- `Channel`: conserva IDs, source/externalId legacy y todas las relaciones originales. `editorialOverrides` protege nombre, descripción, país, logo, website, categorías y desactivación editorial; las columnas existentes contienen la presentación efectiva, conservando consultas y filtros actuales.
- `Stream`: agrega providerChannelId (de allí se obtiene providerId), priority, isPreferred e isDisabled. Conserva URL, feed, calidad, formato, referrer/userAgent, labels y verificación. Unicidad por `(providerChannelId, identityKey)` permite señales idénticas de distintos proveedores. No se implementa failover.
- `ProviderSyncRun`: resultado, trigger, actor, fechas, duración y contadores diferenciados. Solo códigos controlados de error; nunca mensajes de upstream, URLs ni secretos.

`MultiProvider1791300000000` crea IPTV-org y Manual, enlaza cada canal IPTV-org sin recrearlo, asigna procedencia a streams y después sustituye la restricción histórica. Registros legacy de otras fuentes se adoptan como relaciones MANUAL con externalId `legacy:<channelId>` y conservan sus source/externalId. No modifica publicaciones, grants, colecciones, categorías ni auditoría. Campos antiguos se mantienen para compatibilidad; retirarlos exige una fase futura y migración independiente.

La migración usa MEDIUMTEXT para uploadEncrypted (hasta 5 MiB de playlist producen más de 5 MiB en base64); el metadato de entidad es TEXT para compatibilidad con SQL.js. El DDL versionado es autoritativo: no aplicar una migración generada que reduzca ese campo a TEXT. Producción nunca usa synchronize. Rollback automático se rechaza explícitamente: varias fuentes pueden colisionar bajo la constraint antigua y revertirla destruiría datos. Restaurar respaldo verificado con aplicación detenida si se requiere regresar a fase 2. MariaDB ejecuta commits implícitos en DDL: validar en copia antes del servidor y no reintentar ciegamente una migración parcialmente aplicada.

## Adaptadores e identidad

`ProviderAdapter` define tipos, capacidades, validación, obtención de catálogo normalizado y conectividad. `AdapterRegistry` selecciona adaptadores; el motor recibe una función de obtención y no exige recursos de IPTV-org. `ProviderSnapshot` queda como alias legacy de `IptvOrgSnapshot`, exclusivamente para el cliente/normalizador original.

IPTV_ORG está funcional con los seis recursos oficiales y filtros originales. M3U_URL y M3U_UPLOAD están funcionales con fixtures y transporte HTTP simulado. MANUAL se administra por CRUD, sin reconciliación externa. XTREAM y REST_API aceptan configuración baseUrl y credenciales separadas pero muestran `syncSupported=false`; sync se rechaza y test responde 501. Sus contratos de upstream y reproducción segura están pendientes de proveedor autorizado verificable. No se construyen URLs Xtream con contraseñas ni se finge conectividad funcional.

No se fusionan nombres ni tvg-id entre proveedores automáticamente. Un tvg-id es identidad dentro de su proveedor; sin él se utiliza hash de URL. Señales con identidad incierta crean un canal DRAFT independiente. La vinculación administrativa persistida se conserva en posteriores sincronizaciones. Reasignar ProviderChannel mueve sus streams en transacción y deja el canal original y sus relaciones históricas intactos; las publicaciones, colecciones y grants NO se trasladan al destino. El operador revisa esas decisiones por separado.

## Sincronización

1. Reserva exclusión local y `GET_LOCK('hmo_iptv_provider_sync_<id>',0)` con una conexión dedicada antes de descargar. Un conflicto produce 409. Los locks de proveedores distintos son independientes.
2. Relee configuración/actividad bajo el lock. Marca ejecuciones RUNNING abandonadas como CANCELLED al siguiente intento cuando ya posee el lock. Persiste ejecución y auditoría. HTTP retorna 202 con ID; el trabajo continúa mediante setImmediate.
3. Descarga/normaliza antes de escribir catálogo. IPTV-org mantiene límites/retries y validación fail-closed de blocklist. Un fallo de descarga nunca se trata como catálogo vacío.
4. Actualiza países/categorías y lotes transaccionales. En MariaDB usa READ COMMITTED y bloquea la fila canónica al actualizarla. Conserva identidades, verificaciones, prioridades y desactivaciones manuales; canales nuevos quedan DRAFT. Las alternativas de otras fuentes quedan fuera de la reconciliación.
5. Solo el propietario original de metadata del canal actualiza su presentación; fuentes enlazadas conservan metadata original en ProviderChannel. Aplica overrides editoriales antes de guardar; categorías manuales sustituyen la clasificación importada. No modifica publicaciones, colecciones, ALLOW o DENY.
6. Un lote fallido se revierte y se reporta PARTIAL; no retira fuentes ausentes si hubo errores. El siguiente intento converge. Fallos generales producen FAILED. Historial diferencia streamsCreated/Updated y found/created/updated/discarded/disabled/errors.
7. Una fuente ausente/inactiva pasa a ProviderChannel.isActive=false y sus streams a isAvailable=false. La actividad canónica depende de fuentes activas de proveedores activos y respeta la desactivación editorial. La ausencia de una fuente no elimina canales ni alternativas de otra.
8. Persiste fechas/resultado y libera la conexión y lock incluso ante errores. El CLI conserva su formato estadístico y código de salida 1 cuando hay errores.

Cambios de configuración, upload, vinculación y streams usan el mismo lock por proveedor, evitando carreras con sync. Edición editorial bloquea la fila del canal. Desactivar un proveedor retira disponibilidad de sus streams y recalcula canales, sin borrar relaciones/historial. Reactivarlo requiere una sincronización para recuperar disponibilidad. MANUAL reservado permanece activo y sin sync.

La ejecución HTTP no es durable ante reinicios: los lotes ya confirmados permanecen, el lock se libera con la conexión y el RUNNING abandonado se cancela en la siguiente reserva. No se implementa cola, scheduler ni endpoint cancel; PENDING/CANCELLED están preparados en el modelo. Reiniciar durante trabajo exige repetir sync. Una futura cola/worker puede llamar al mismo motor. Descargas simultáneas de distintos proveedores están verificadas en SQL.js; concurrencia de escrituras y GET_LOCK requieren MariaDB real.

## M3U, secretos y HTTP saliente

Playlists autorizadas UTF-8 (BOM opcional), hasta 5 MiB y 10000 entradas, reconocen tvg-id/name/logo, group-title y EXTINF. Rechazan formatos inválidos, URLs no públicas, encoding inválido, manifiestos HLS de segmentos y directivas de headers/reproducción no soportadas. No se descargan videos ni logos. Los grupos crean categorías por hash; no se exige país ni blocklist ficticia. M3U no tiene clasificación NSFW confiable: requiere revisión editorial y nunca se publica automáticamente.

Upload usa `POST /admin/providers/:id/upload` con JSON `{content: <texto del archivo>}` y request máximo 6 MiB. No es multipart; se recibe el contenido UTF-8 del archivo, se valida y cifra dentro de MariaDB, sin archivos persistidos en el repositorio. Credenciales tienen límite JSON 32 KiB.

`PROVIDER_CREDENTIALS_KEY` es obligatoria y validada antes de conectar: base64 canónico de exactamente 32 bytes. AES-256-GCM usa nonce aleatorio por escritura y AAD con propósito/ID de proveedor; copiar un cifrado entre registros no permite descifrarlo. Credenciales y uploads son select:false y las respuestas eliminan explícitamente ambos campos. DTO de credenciales/upload es writeOnly sin ejemplos; auditoría solo registra IDs y estados. Guardar la clave fuera del repositorio y conservarla con los respaldos cifrados; reemplazarla sin recifrar hará ilegibles las credenciales/playlists. Rotación automatizada pendiente.

M3U_URL permite un token Bearer cifrado; no acepta credenciales incrustadas en URL. Config pública solo acepta url; API pendiente solo baseUrl. URL saliente HTTPS, sin userinfo, fragmento ni parámetros identificables como secretos; control DNS en el lookup del agente para todas las direcciones retornadas, utilizado por la misma conexión. IP privadas/reservadas se rechazan, redirects=0, proxy=false, timeout=15s, máximo 5 MiB de respuesta descomprimida y tres intentos. IPTV-org mantiene host oficial, máximo 64 MiB/recurso y retries configurables. Su test de conectividad usa un recurso y timeout 5s sin retries; M3U test descarga/valida la playlist sin escribir catálogo.

URLs de streams/logos/website no se consultan. Los streams nuevos M3U/manual rechazan nombres de query que sugieran secretos; URLs arbitrarias no permiten detectar todos los formatos de credenciales opacas. Deben proporcionar enlaces públicos de reproducción sin secretos. Xtream autenticado permanece pendiente hasta resolver entrega segura sin exponer credenciales, sin proxy/restreaming en esta fase. UNKNOWN no acredita disponibilidad ni reproducción.

## Administración y permisos

Todas las nuevas rutas exigen ADMIN/SUPER_ADMIN, JWT y permisos explícitos. SUPER_ADMIN conserva política global sin asignaciones; USER no administra aun con permiso accidental. ADMIN solo opera con rol y permisos concedidos. Vincular fuentes exige providers.manage, channels.manage y streams.manage. Lecturas reutilizan providers.read, sync.history, channels.read y streams.read. Sync exige sync.execute; CRUD usa providers.manage/channels.manage/streams.manage. No hay permisos nuevos ni cambios del seed.

CRUD manual crea fuentes del proveedor reservado, canales DRAFT, categorías existentes y streams públicos con prioridad/preferencia. DELETE es lógico: Channel.isActive=false protegido como override o Stream.isDisabled=true. Metadata importada de streams solo admite cambios de priority/isPreferred/isDisabled; editar URL, nombre, formato o calidad de señales importadas devuelve 400. El operador puede añadir una señal independiente MANUAL.

Eventos provider.create/update/enable/disable/test/sync/credentials.update, provider-channel.link, channel.create/update y stream.create/update/disable reutilizan AuditService. Los cambios y sus auditorías se confirman en la misma transacción administrativa. Requests fallidas usan interceptor existente sanitizado. No se almacenan payloads, excepciones upstream ni secretos en historial/auditoría.

## Seguridad de fase 2

`SecurityModule` registra guards globales de JWT, roles y permisos. Login y refresh son públicos pero están limitados; health es público. Cada access identifica usuario/sesión y se verifica contra las tablas actuales. `requiresPasswordChange` limita la cuenta a las rutas de autenticación hasta cambiar la contraseña. Los DTOs no aceptan roles/permisos ni estados en payloads genéricos de usuario.

`ChannelAccessModule` aplica EXISTS SQL: canal activo y publicación PUBLISHED, ausencia de DENY y presencia de ALLOW o de colección activa asignada no revocada. Ni `channels.read` ni ADMIN sustituyen estas reglas en `/channels` y `/me`. SUPER_ADMIN utiliza la política global del propietario y consulta todos los registros sin restricciones editoriales o grants. `/admin/channels` exige ADMIN/SUPER_ADMIN y permisos específicos. La sincronización crea DRAFT al importar y no modifica ninguna decisión editorial existente.

Las operaciones administrativas que afectan roles o estado de cuentas bloquean la fila del rol SUPER_ADMIN antes de validar al último propietario. Bootstrap usa el mismo bloqueo; no eleva cuentas existentes. Las modificaciones de relaciones y su auditoría se confirman en la misma transacción. Los roles reservados conservan su identidad; USER/SUPER_ADMIN conservan sus permisos base protegidos. ADMIN y roles adicionales reciben permisos solo por el propietario.

Login, refresh y cambio de contraseña bloquean primero al usuario; refresh bloquea después la sesión. El orden consistente serializa la rotación con cambios de credenciales. La fecha final de sesión es absoluta. Cada refresh firmado contiene un jti nuevo, y la sesión almacena solo su HMAC actual. Un hash distinto o una sesión ya revocada produce rechazo y revocación persistente; el error se lanza después del commit para no deshacer la revocación. Logout/desactivación/cambio de contraseña invalidan sesiones en la base.

Las pruebas HTTP usan SQL.js y Argon2/JWT reales con secretos aleatorios efímeros; nunca la base remota. SQL.js no representa los locks ni el DDL de MariaDB. La verificación operativa de DDL, refresh y bootstrap concurrentes requiere una copia autorizada de MariaDB 10.11. Las migraciones nuevas son versionadas y no alteran la migración histórica; DDL de MariaDB tiene commits implícitos.

TLS, almacenamiento operativo de secretos, monitoreo centralizado y rate limits compartidos corresponden al despliegue. La adaptación a cookies y CSRF, tokens de reproducción y protección del origen autorizado son futuras; JWT de catálogo no protege un HLS externo público.


## Política de privilegios efectivos (fase 2.1)

El límite de confianza es `AuthService.authenticate`: valida JWT, cuenta activa, sesión vigente y no revocada antes de construir `Principal` con privilegios vigentes de la base. Los roles enviados en DTO/query o claims adicionales de JWT no participan en la autorización. `JwtGuard` se ejecuta antes de `RolesGuard`, `PermissionsGuard` y `ChannelAccessGuard`. SUPER_ADMIN no evita estos controles de autenticación ni el cambio obligatorio de contraseña.

`policy.ts` proporciona una única política: `isSuper` identifica al propietario; `requirePermission` reconoce privilegios globales incluso para permisos futuros; `hasAnyRole` permite al propietario operar en módulos restringidos por rol; `catalogPrivileges` determina alcance de contenido, streams y filtro predeterminado. `ChannelsService` recibe un Principal obligatorio, sin el antiguo centinela null que autorizaba consultas irrestrictas. El alcance administrativo es una opción interna que valida rol y permiso, nunca un campo HTTP. La consulta de streams exige streams.read independientemente de channels.read en ese alcance.

SUPER_ADMIN consulta todos los estados editoriales, registros sin publicación, canales inactivos y streams retirados en las rutas generales y administrativas, sin ALLOW, colecciones ni efecto de DENY. ADMIN consume contenido como espectador y solo inspecciona registros ocultos por rutas administrativas con permisos explícitos. USER mantiene denegación por defecto y no accede a módulos administrativos aunque reciba un permiso RBAC: todas esas clases declaran roles administrativos. Las consultas de espectadores restringen en SQL antes de aplicar filtros, contar y paginar; se conserva la respuesta 404 para recursos ajenos. Las colecciones personales muestran asignaciones; el catálogo de colecciones completo pertenece a la administración.

La lectura no cambia publicación ni disponibilidad. `Channel.isActive`, `ChannelPublication.status`, `Stream.isAvailable` y `Stream.status` representan dimensiones distintas. Consultar URLs almacenadas no acredita derechos, reproducción exitosa ni disponibilidad externa. Los espectadores solo reciben streams disponibles de canales activos, publicados y autorizados.

No se modificaron migraciones históricas ni datos persistidos. SecuritySeed registra roles/permisos/relaciones sin usuarios y conserva asignaciones; seedSecurity agrega registros faltantes sin reemplazar los existentes. Bootstrap utiliza la fila del rol del propietario como bloqueo en MariaDB, rechaza propietarios previos incluso inactivos y no sobrescribe cuentas. Nuevos módulos deben agregar permisos y relaciones mediante migraciones idempotentes y reutilizar la política global; el permiso nuevo funciona para SUPER_ADMIN aun antes de su enlace al rol. Sincronización no escribe RBAC ni grants y conserva decisiones editoriales.

La validación automática usa HTTP real con NestJS, guards y persistencia TypeORM en SQL.js aislado, incluyendo sincronización con fixtures. El SQL de autorización se ejecuta en esas pruebas; los metadatos MariaDB y las sentencias de migración se verifican sin conexión. Esto no sustituye una ejecución posterior de integración en MariaDB autorizado para confirmar comportamiento del driver, bloqueos y concurrencia.

La fase 3 agrega administración de proveedores, sincronización HTTP y edición manual del catálogo usando la misma política. EPG, VOD, configuración HTTP y frontend siguen fuera del alcance.
