# Fase 4: Stream health y selección

## Auditoría e integración

Se revisaron Stream/StreamStatus, Provider/ProviderChannel, Channel y publicaciones,
ChannelsService, ProvidersService, ProviderSyncEngine, política URL, safe-http, DTOs,
guards, permisos, migraciones y pruebas existentes. Se reutilizan status,
lastCheckedAt, streams.read/manage, ChannelAccessService, AuditService y GET_LOCK.
No hay nuevas dependencias, scheduler, Redis, proxy ni reproducción.

`isDisabled` representa decisión administrativa; `isAvailable`, presencia lógica
actual en catálogo. `status` es UNKNOWN, ONLINE u OFFLINE según último check.
No se cambia disponibilidad por un fallo técnico. Channel.isActive, estado editorial,
Provider.isActive y ProviderChannel.isActive son independientes.
La creación manual y el sync ya no confunden isDisabled con isAvailable.
Los listados de usuario excluyen fuentes administrativamente deshabilitadas.

## Persistencia

Migración nueva: `1791400000000-StreamHealth`. Conserva IDs, URLs, estados existentes
y lastCheckedAt. Añade lastSuccessAt, lastFailureAt (datetime(6) nullable),
responseTimeMs, lastHttpStatus (int nullable), consecutiveSuccesses,
consecutiveFailures (int, default 0), failureReason (varchar(32) nullable), e índice
lastCheckedAt. `stream_health_runs` contiene sólo agregados por ejecución y actor
nullable con FK SET NULL. No hay historial por check individual.

Un éxito establece ONLINE, lastCheckedAt/lastSuccessAt, latencia, HTTP status,
incrementa éxitos y reinicia fallos. Un fallo establece OFFLINE,
lastCheckedAt/lastFailureAt, incrementa fallos y reinicia éxitos. El último éxito
se conserva al fallar y viceversa. UNKNOWN es el estado de fuentes aún no probadas
o cuya URL/identidad manual cambió; no se convierte automáticamente a ONLINE.

Códigos controlados: TIMEOUT, DNS_FAILURE, PRIVATE_ADDRESS, HTTP_401, HTTP_403,
HTTP_404, HTTP_429, HTTP_5XX, INVALID_HLS, INVALID_DASH, INVALID_CONTENT,
UNSUPPORTED_FORMAT, CONNECTION_ERROR, TOO_LARGE, REDIRECT_BLOCKED, TLS_ERROR,
UNKNOWN. No se persisten cuerpos, mensajes upstream, stacks, URLs o headers en
resultados/auditoría/logs. errors del run cuenta fallos internos, no streams OFFLINE.

## Checker y networking

HLS usa GET UTF-8 fatal y límite estricto: #EXTM3U más master con variante o media
con TARGETDURATION/EXTINF y URI. No sigue variantes ni descarga segmentos.
DASH usa un reconocedor XML restringido: tags balanceados, atributos entre comillas,
MPD/Period/AdaptationSet con jerarquía razonable. Rechaza DTD, declaraciones y
entidades externas; no resuelve XML, DRM o licencias. Es deliberadamente conservador:
comentarios/CDATA y construcciones XML fuera del subconjunto se rechazan.
MP4/MPEG-TS/HTTP desconocido usan HEAD; 405/501 hace GET Range de 1024 bytes y
cierra la respuesta aunque el servidor ignore Range. UNKNOWN infiere manifiestos
por pathname/Content-Type sin cambiar formato persistido. HTML es inválido.
Las respuestas comprimidas en GET se rechazan; se solicita identity.

Se reutiliza publicHttpUrl/isPublicAddress para HTTP/HTTPS, sin userinfo,
localhost, privados, loopback, link-local, multicast y rangos reservados.
El lookup del socket comprueba las IP devueltas por DNS, incluyendo IPv6 y mapped
IPv4. La dirección validada es la utilizada por Node; no hay proxy ni resolución
previa independiente vulnerable a rebinding. Cada redirect se valida otra vez y
resuelve DNS en su nueva conexión. No se delegan redirects automáticos. Referrer y
User-Agent se permiten sólo con validación; no hay headers arbitrarios. En cambio
de origen se descartan. Query técnica se conserva exactamente: health no aplica
el filtro de importación de credenciales ni modifica URLs. La importación conserva
sus restricciones. Playback evita URLs con claves sensibles y headers no permitidos.

## Configuración y ejecución

Variables con defaults y rangos validados al arrancar:

| Variable | Default | Rango |
|---|---:|---:|
| STREAM_HEALTH_TIMEOUT_MS | 8000 | 100–60000 |
| STREAM_HEALTH_MAX_RESPONSE_BYTES | 1048576 | 1024–4194304 |
| STREAM_HEALTH_CONCURRENCY | 10 | 1–50 |
| STREAM_HEALTH_MAX_REDIRECTS | 2 | 0–5 |
| STREAM_HEALTH_BATCH_SIZE | 100 | 1–1000 |

Timeout incluye DNS, cuerpo y redirects del check. Batches por ID y worker pool
limitan memoria/concurrencia. El máximo ID se captura al inicio; nuevos streams se
comprueban en la siguiente ejecución. Por defecto exige Provider/ProviderChannel
activos, isAvailable=true, isDisabled=false. No filtra publicación ni actividad
editorial del Channel: puede diagnosticar canales HIDDEN/DISABLED.
`force=true` permite fuentes retiradas/inactivas/deshabilitadas en administración.
Filtros opcionales: status, providerId, channelId, streamId, staleMinutes.

Lock global `hmo_iptv_stream_health_global`, conexión dedicada durante toda ejecución,
y reserva local antes de await. Todas las ejecuciones, incluso individuales, lo
comparten; conflicto devuelve 409. No se bloquea sync: health actualiza únicamente
campos operativos con condición id+identityKey+URL. Sync actualiza exclusivamente
metadata importada, conservando health reciente. Retirar un stream sólo cambia
isAvailable. Edición manual de URL/feedId reinicia health. No cambia publicación,
grants, provider metadata ni URL durante checks.

El request global/provider/channel responde 202 después de reserva y auditoría;
el trabajo usa setImmediate dentro del proceso. Reiniciar puede interrumpirlo.
La próxima reserva con lock adquirido marca RUNNING huérfanos CANCELLED con
PROCESS_INTERRUPTED. Estados: RUNNING/SUCCESS/PARTIAL/FAILED/CANCELLED; triggers
HTTP/CLI/SCHEDULED. SCHEDULED está preparado pero no se programa automáticamente.
Retención de runs requiere una política futura; no hay borrado automático.
Una acción auditada por run: stream-health.run/provider/channel/stream.

## Selección determinística

Se excluyen disabled, unavailable, ProviderChannel/Provider inactivos y OFFLINE
(salvo includeOffline=true en diagnóstico administrativo). Se ordena por tupla
ascendente, documentada en healthScore:

1. estado: ONLINE=0, UNKNOWN=1, OFFLINE=2;
2. isPreferred=true primero;
3. Stream.priority menor primero;
4. Provider.priority menor primero;
5. confiabilidad: consecutiveFailures < 3 primero;
6. menor número de fallos;
7. menor latencia; null se ordena después de mediciones;
8. ID como desempate estable.

La confiabilidad está separada como función reutilizable. El estado conserva el
último check; un fallo no cambia preferencia/prioridad/disponibilidad. Playback
excluye OFFLINE por seguridad operativa, por lo que un fallo puede seleccionar
otra fuente temporalmente, sin descartar administrativamente la preferida.
Candidatos muestran el score, rank y motivos de exclusión sin exponer entidades.

## Endpoints

Todos usan JWT. Rutas admin exigen ADMIN/SUPER_ADMIN. SUPER_ADMIN mantiene bypass
global de permisos; USER con permiso de streams sigue sin poder administrar.

| Método/ruta (prefijo /api) | Permiso | Resultado |
|---|---|---|
| POST /admin/stream-health/run | streams.manage | 202, run id |
| POST /admin/providers/:id/stream-health | streams.manage | 202, run id |
| POST /admin/channels/:id/check-streams | streams.manage | 202, run id |
| POST /admin/streams/:id/check | streams.manage | 200, run terminado |
| GET /admin/stream-health/runs | streams.read | página de runs |
| GET /admin/stream-health/stats | streams.read | agregados globales/por provider |
| GET /admin/channels/:id/playback-candidates | streams.read | diagnóstico; includeOffline opcional |
| GET /admin/dashboard | streams.read, channels.read, providers.read, users.read | resumen operativo |
| GET /me/channels/:id/playback | acceso ChannelAccessService | stream mínimo; 404 sin acceso/fuente |

Runs admite page/limit/status/triggerType/startedBy. Stats usa COUNT/SUM/AVG/MAX
SQL; no carga el catálogo completo. Latencia promedio por provider considera
ONLINE; porcentaje usa todos sus streams almacenados. Dashboard agrupa publicaciones,
cuenta canales/proveedores/usuarios y devuelve últimos cinco sync runs y último
health run. No mezcla DISABLED editorial con OFFLINE técnico.

## Primera validación manual contra MariaDB

Durante implementación no se ejecutan migraciones externas ni checks reales.
Configurar credenciales locales según README; no usar synchronize/migrationsRun.
Respaldar la BD antes de aplicar la migración manual.

```bash
npm run build
npm run migration:show
npm run migration:run
npm run migration:show
npm run start
```

En otra terminal, configurar URL base/JWT e IDs reales obtenidos del catálogo.

```bash
export API_BASE='http://localhost:3000/api'
export ADMIN_JWT='REEMPLAZAR_CON_JWT_ADMIN_AUTORIZADO'
export STREAM_ID='REEMPLAZAR_CON_ID'
export FREECASTHUB_ID='REEMPLAZAR_CON_ID'
export RW1986_ID='REEMPLAZAR_CON_ID'

# 1. Un solo stream (sin force normalmente).
curl -X POST "$API_BASE/admin/streams/$STREAM_ID/check" -H "Authorization: Bearer $ADMIN_JWT"
# Inspección de estadísticas e historial.
curl "$API_BASE/admin/stream-health/stats" -H "Authorization: Bearer $ADMIN_JWT"
curl "$API_BASE/admin/stream-health/runs?limit=10" -H "Authorization: Bearer $ADMIN_JWT"
# 2. FreeCastHub, aproximadamente 108 fuentes: esperar fin antes de continuar.
curl -X POST "$API_BASE/admin/providers/$FREECASTHUB_ID/stream-health" -H "Authorization: Bearer $ADMIN_JWT"
# 3. RW1986, aproximadamente 561 fuentes: esperar fin.
curl -X POST "$API_BASE/admin/providers/$RW1986_ID/stream-health" -H "Authorization: Bearer $ADMIN_JWT"
# 4. Finalmente global.
curl -X POST "$API_BASE/admin/stream-health/run" -H "Authorization: Bearer $ADMIN_JWT"
```

Alternativa CLI, mismo servicio (no ejecutar mientras otro run esté activo):

```bash
npm run check:streams -- --stream 456
npm run check:streams -- --provider 3
npm run check:streams -- --channel 123
npm run check:streams -- --status UNKNOWN
npm run check:streams -- --stale-minutes 60
npm run check:streams
```

Reemplazar 456/3/123 por IDs reales; opcional --force. Un provider sin streams genera
SUCCESS con cero checks. No hay credentials/tokens de reproducción construidos.

SQL de validación, sin seleccionar URLs o credenciales:

```sql
SELECT id, name, slug FROM providers ORDER BY id;
SELECT COUNT(*) AS total, status, isAvailable, isDisabled
FROM streams GROUP BY status, isAvailable, isDisabled;
SELECT id, status, lastCheckedAt, lastSuccessAt, lastFailureAt,
       responseTimeMs, lastHttpStatus, consecutiveSuccesses,
       consecutiveFailures, failureReason FROM streams WHERE id = 456;
SELECT id, status, triggerType, streamsQueued, streamsChecked, online,
       offline, unknown, skipped, errors, durationMs, errorCodes
FROM stream_health_runs ORDER BY id DESC LIMIT 10;
SELECT p.id, p.name, COUNT(s.id) AS total,
       SUM(s.status = 'ONLINE') AS online, SUM(s.status = 'OFFLINE') AS offline,
       SUM(s.status = 'UNKNOWN') AS unknown,
       AVG(CASE WHEN s.status = 'ONLINE' THEN s.responseTimeMs END) AS avgLatency
FROM providers p LEFT JOIN provider_channels pc ON pc.providerId = p.id
LEFT JOIN streams s ON s.providerChannelId = pc.id GROUP BY p.id, p.name;
SELECT status, COUNT(*) FROM channel_publications GROUP BY status;
SELECT COUNT(*) FROM user_channel_access;
SELECT COUNT(*) FROM channel_collection_items;
```

## Significado y límites

ONLINE significa que el recurso respondió válidamente durante el check. No garantiza
reproducción completa, disponibilidad mundial, ausencia de geobloqueo, compatibilidad
con browsers ni autorización de redistribución. No hay seguimiento de segmentos,
variantes, licencias, restreaming, transcoding ni historial individual.
Un run interrumpido se reconcilia cuando se inicia el siguiente; la cancelación no
revierte checks ya persistidos. Tests usan SQL.js y transporte mock/controlado;
GET_LOCK y migración MariaDB deben validarse manualmente con el procedimiento anterior.
