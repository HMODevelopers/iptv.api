# Informe de implementación — fase 3

## 1. Auditoría original

Se inspeccionaron CatalogProvider/ProviderSnapshot, cliente/normalizador/sync IPTV-org, CLI, entidades Channel/Stream/Country/Category/ChannelCategory, publicaciones, colecciones/grants, autorización SQL, permisos/guards, auditoría, configuración y las migraciones históricas. El catálogo se persistía correctamente y había buenas bases de seguridad y reglas editoriales, pero la importación estaba implementada exclusivamente para IPTV-org.

## 2. Incompatibilidades encontradas

El contrato exigía seis recursos específicos y el normalizador rechazaba catálogos sin países/categorías. Identidad Channel por source/externalId impedía compartir fuentes sin duplicación; unicidad de streams por canal impedía conservar una misma URL de distintas fuentes. Reconciliar todos los streams del canal habría retirado señales ajenas. No existían proveedores administrables, almacenamiento seguro de sus credenciales, historial de sync HTTP ni protección de personalizaciones contra metadata importada.

## 3. Arquitectura implementada

Provider → AdapterRegistry/ProviderAdapter → NormalizedSnapshot neutral → ProviderSyncEngine → ProviderChannel/Channel/Stream → publicación editorial y acceso existentes. Un solo motor de persistencia sirve HTTP y CLI. No se exige blocklist ni países ficticios a M3U. La clase CLI anterior es una fachada de compatibilidad.

## 4. Entidades nuevas

Provider, ProviderChannel y ProviderSyncRun. Incluyen autor/procedencia, capacidades por adaptador, prioridades, fechas e historial con códigos de error sanitizados. Estados disponibles: PENDING/RUNNING/SUCCESS/PARTIAL/FAILED/CANCELLED. El flujo actual reserva RUNNING directamente; no hay cola ni cancelación interactiva.

## 5. Entidades modificadas

Channel añade editorialOverrides y conserva IDs/source/externalId. Stream añade providerChannelId, priority, isPreferred e isDisabled; conserva campos originales y verificación. ProviderId se deriva de ProviderChannel para evitar duplicidad inconsistente. La restricción de stream pasa a providerChannelId+identityKey. No se alteran publicaciones, RBAC, grants ni colecciones.

## 6. Migraciones

Nueva `MultiProvider1791300000000`. InitialCatalog, SecuritySchema y SecuritySeed no fueron modificadas. Schema sync y ejecución automática permanecen deshabilitados. El rollback destructivo se rechaza; restauración desde respaldo con aplicación detenida es el procedimiento de regreso. DDL MariaDB tiene commits implícitos; una falla parcial exige diagnóstico antes de reintentar.

## 7. Backfill IPTV-org

La migración preparada crea IPTV-org y Manual, asocia canales existentes mediante sus IDs y asigna procedencia a sus streams antes de cambiar el índice único. Preserva IDs, publicaciones, asignaciones, grants, categorías, verificación y auditoría. Otras fuentes legacy se adoptan como fuentes manuales sin modificar su identidad original. **No se ejecutó el backfill en la MariaDB externa.** La compatibilidad/idempotencia de importación legacy se verificó en SQL.js.

## 8. Adaptadores

- IPTV_ORG: funcional, conserva cliente oficial, retries, timeout, filtros NSFW/blocklist, deduplicación y reconciliación.
- M3U_URL: funcional con URL HTTPS pública, token Bearer opcional cifrado, descarga limitada y parser. Transporte probado con mocks; no se descargaron listas reales.
- M3U_UPLOAD: funcional; contenido de archivo UTF-8 por JSON, validado y cifrado en MariaDB, sin almacenamiento de archivos en el repositorio.
- MANUAL: funcional por CRUD, sin sincronización externa.
- XTREAM/REST_API: contrato/configuración/secretos preparados; explícitamente no funcionales para sync/test. `syncSupported=false`, sync rechaza y test devuelve 501. Faltan contrato de proveedor autorizado y validación verificable de upstream.

## 9. Endpoints nuevos

Prefijo configurado `/api`:

| Método | Ruta |
| --- | --- |
| GET/POST | /admin/providers |
| GET/PATCH | /admin/providers/:id |
| POST | /admin/providers/:id/test |
| POST | /admin/providers/:id/sync |
| POST | /admin/providers/:id/upload |
| GET | /admin/providers/:id/channels |
| GET | /admin/providers/:id/sync-runs |
| GET | /admin/sync-runs |
| PATCH | /admin/provider-channels/:id/channel |
| POST | /admin/channels |
| PATCH/DELETE | /admin/channels/:id |
| POST | /admin/channels/:id/streams |
| PATCH/DELETE | /admin/streams/:id |

GET `/admin/channels/:id/streams` y publicación administrativa ya existían y se conservan. Historial tiene paginación y filtros providerId/status; respuestas incluyen autor, resultado, fechas/duración y contadores. Swagger conserva Bearer, DTOs write-only sin ejemplos de secretos y documentación de reserva HTTP 202.

## 10. Permisos

Reutiliza providers.read/manage, sync.execute/history, channels.read/manage y streams.read/manage. Vinculación exige providers.manage+channels.manage+streams.manage. Todas las rutas administrativas mantienen restricción ADMIN/SUPER_ADMIN además de permiso. SUPER_ADMIN usa la política global; ADMIN necesita permisos concedidos; USER queda excluido incluso con permiso accidental. No se agregan permisos ni se modifica el seed.

## 11. Secretos

AES-256-GCM, nonce aleatorio, autenticación de contexto por ID/propósito. PROVIDER_CREDENTIALS_KEY obligatorio base64 de exactamente 32 bytes, validado antes de conectar. Credenciales/playlist select:false y filtradas explícitamente de respuestas; logs/auditoría/historial no reciben payloads/secretos/errores upstream. Secretos solo se escriben en credentials. M3U_URL admite token Bearer; API pendiente puede guardar username/password/token/API keys y otros campos string acotados. No se generó ni escribió ninguna clave real en .env; las claves de pruebas son efímeras o valores exclusivamente de fixtures aislados. Rotación automatizada no implementada.

## 12. Anti-SSRF

URL saliente HTTPS pública, sin userinfo, fragmentos ni parámetros identificables como secretos. Lookup del mismo agente verifica direcciones elegidas antes de conectar, incluidos IPv6/mapped IP. Redirects=0 y proxy=false; timeout 15s, máximo 5 MiB descomprimidos y tres intentos M3U. IPTV-org conserva host oficial y sus límites configurables; test de conectividad usa un recurso/5s sin retries. No se consultan URLs de video/logos. No se permiten URLs de reproducción nuevas M3U/manual con query de token/key/password/user/auth/secret ni userinfo; credenciales opacas en rutas arbitrarias no se pueden identificar de forma general y esos enlaces no deben proporcionarse como streams públicos.

## 13. Sincronización

Reserva lock por proveedor antes de descargar; GET_LOCK en MariaDB y exclusión local. Segundo intento recibe 409. Config/streams/upload/vinculación comparten lock con sync. Descarga y normalización preceden a modificaciones del catálogo; lotes transaccionales con READ COMMITTED y bloqueos de canal en MariaDB. Error por lote produce PARTIAL y omite reconciliación de ausentes. Error general produce FAILED; códigos de error son sanitizados. Fechas tienen microsegundos para evitar falsas retiradas por truncamiento. Se retira solo la fuente y sus señales; actividad canónica se mantiene si queda una fuente activa de un proveedor activo. Overrides editoriales permanecen. Todo canal nuevo DRAFT y publicaciones/grants/colecciones intactos.

HTTP retorna 202 y continúa en el proceso. No hay durabilidad ante reinicios: lotes confirmados sobreviven, lock se libera con la conexión y el RUNNING abandonado se cancela en la siguiente reserva. Se debe repetir sync. No se añadió Redis/RabbitMQ, scheduler, frontend, EPG, VOD, proxy/restreaming ni descarga audiovisual.

## 14. Deduplicación

ProviderChannel único por proveedor+externalId. tvg-id tiene alcance local al proveedor; sin identificador se usa hash de URL. Streams se deduplican por hash de feed/URL dentro de cada fuente. No hay fusión automática de nombres o tvg-id entre proveedores; vinculación administrativa persistida resuelve ambigüedad y sobrevive a sync. Dos fuentes pueden aportar la misma URL sin colisionar.

## 15. Administración manual

Canales MANUAL DRAFT con nombre/descripcion/país/categorías/logo/website y streams públicos (feed, referrer/userAgent no sensibles, labels, calidad, formato, prioridad/preferencia). Países/categorías deben existir. Edición canónica conserva overrides sobre campos importados. DELETE lógico y conservación de histórico. Streams importados solo permiten cambios de prioridad/preferencia/desactivación; metadata upstream no editable indiscriminadamente. Vincular fuente mueve solo sus streams: no transfiere publicaciones, colecciones ni grants al destino. El operador revisa esos permisos/editorial por separado.

## 16–18. Validación ejecutada

Resultados finales registrados al concluir la revisión:

| Comando | Resultado |
| --- | --- |
| npm run lint | Correcto |
| npm run build | Correcto |
| npm run test | 156 aprobadas, 11 suites |
| npm run test:integration | 71 aprobadas, 4 suites (subconjunto de las 156) |

Las pruebas cubren cifrado/contexto/tampering, configuración de clave, parser/límites/encoding, SSRF/DNS/redirects/proxy/timeout/retries con transporte simulado, CRUD/RBAC/USER, campos sensibles, DRAFT, historial HTTP 202, preservación legacy/editorial/grants/colecciones, fuentes compartidas/retirada, vinculación, CRUD manual, locks locales por proveedor, rechazo concurrente, rollback e introspección MariaDB sin conexión. El primer intento HTTP en sandbox devolvió EPERM al abrir puerto local y se repitió con autorización fuera del sandbox. Los mensajes sanitizados 500/501 son casos negativos intencionales. No se reportan esas ejecuciones iniciales fallidas como éxitos.

## 19. Limitaciones pendientes

MariaDB 10.11 real: ejecutar DDL/backfill y validar pool/GET_LOCK, escrituras simultáneas de proveedores sobre canales compartidos, bloqueos/deadlocks y commits implícitos en una copia autorizada. SQL.js no valida estos comportamientos. Los proveedores reales M3U tampoco se contactaron: el transporte está probado por mocks y el catálogo por fixtures. Xtream/REST requieren contrato autorizado y reproducción sin secretos; no son soporte operativo. No hay fila de errores por entrada: errores controlados por ejecución/batch y contador de descartes. Sin worker durable, recuperación automática programada, failover, rotación de claves o reset de overrides por endpoint. M3U no trae una clasificación NSFW confiable; requiere revisión editorial.

Upload usa MEDIUMTEXT en la migración para cifrado/base64 de hasta 5 MiB, mientras la entidad declara TEXT por compatibilidad SQL.js. No aceptar migraciones generadas que reduzcan ese campo: el DDL manual versionado es autoritativo. No se retiraron columnas legacy. URLs arbitrarias no permiten detectar toda credencial opaca; solo registrar enlaces de reproducción sin secretos.

## 20. Procedimiento manual exacto para MariaDB

No se ejecutó ninguna de estas operaciones contra tu servidor. Primero detener todos los procesos/API/CLI antiguos que escriban al catálogo. Validar en copia autorizada MariaDB 10.11 antes de aplicar al servidor. Sustituir TU_HOST/TU_USUARIO por los valores de tu despliegue; --password solicita contraseña sin incluirla en historial de shell.

Desde la raíz del repositorio:

```bash
cd /home/carlos-lafarga/Desarrollo/iptv.api
npm run lint
npm run build
npm run test
npm run test:integration
```

Generar tú la clave y agregarla manualmente a `.env` existente sin reemplazar otros valores:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Asignar el resultado a PROVIDER_CREDENTIALS_KEY; conservarlo en almacén privado de secretos y junto al respaldo seguro. Mantener DB_SYNCHRONIZE=false y TYPEORM_MIGRATIONS_RUN=false. Usar una cuenta DDL controlada para migrar y después restaurar las credenciales de menor privilegio de la API.

Respaldar y guardar baseline (canales y relaciones con IDs), con todos los escritores detenidos:

```bash
mariadb-dump --host=TU_HOST --port=3306 --user=TU_USUARIO --password --single-transaction --routines --triggers hmodevelopers_iptv > respaldo-fase2.sql
mariadb --host=TU_HOST --port=3306 --user=TU_USUARIO --password --batch --raw hmodevelopers_iptv --execute="SELECT id,source,externalId FROM channels ORDER BY id; SELECT id,channelId,status FROM channel_publications ORDER BY id; SELECT id,channelId FROM streams ORDER BY id; SELECT collectionId,channelId FROM channel_collection_items ORDER BY collectionId,channelId; SELECT userId,channelId,accessType FROM user_channel_access ORDER BY userId,channelId;" > baseline-fase2.tsv
npm run migration:show
npm run migration:run
npm run migration:show
```

Para una instalación ya en fase 2, la única pendiente nueva debe ser MultiProvider1791300000000. Si también faltan migraciones históricas, revisar primero el estado de esa instalación. No ejecutar migration:revert para regresar de fase 3; no arrancar el código antiguo contra el esquema nuevo.

Verificar resultado (misma exportación y comprobaciones sin URLs ni secretos):

```bash
mariadb --host=TU_HOST --port=3306 --user=TU_USUARIO --password --batch --raw hmodevelopers_iptv --execute="SELECT id,source,externalId FROM channels ORDER BY id; SELECT id,channelId,status FROM channel_publications ORDER BY id; SELECT id,channelId FROM streams ORDER BY id; SELECT collectionId,channelId FROM channel_collection_items ORDER BY collectionId,channelId; SELECT userId,channelId,accessType FROM user_channel_access ORDER BY userId,channelId;" > baseline-fase3.tsv
diff -u baseline-fase2.tsv baseline-fase3.tsv
mariadb --host=TU_HOST --port=3306 --user=TU_USUARIO --password hmodevelopers_iptv < scripts/validate-multiprovider.sql
```

El diff debe estar vacío. Deben aparecer IPTV-org/MANUAL y la migración nueva; los conteos missing_iptv_org_links, streams_without_provenance, inconsistent_stream_channels, duplicate_sources y duplicate_streams_in_source deben ser 0 inmediatamente después del backfill. SHOW INDEX debe incluir uq_stream_source_key y no uq_stream_channel_key.

Después de esa validación, restaurar el usuario operativo de la API en `.env` si usaste otro para DDL. Iniciar el código nuevo con el procedimiento existente de despliegue. En instalación local:

```bash
npm run start
```

Con SUPER_ADMIN autenticado: GET /api/admin/providers debe mostrar las dos fuentes reservadas. Registrar M3U_UPLOAD, cargar playlist autorizada, solicitar sync (202), consultar sync-runs, comprobar canales DRAFT y fuente de streams. Publicar explícitamente por la ruta existente solo tras revisar contenido. Probar dos sync del mismo proveedor (segundo 409) y fuentes distintas en paralelo en la copia MariaDB; comprobar mismos IDs/publicaciones/colecciones/grants tras dos sync IPTV-org. El CLI sigue disponible para sincronizar contenido real autorizado:

```bash
npm run sync:iptv-org
```

Ese último comando sí cambia el catálogo y debe ejecutarse solo después del respaldo/migración/verificación y cuando decidas importar el proveedor. No hace falta ejecutar bootstrap nuevamente si ya tienes SUPER_ADMIN.
