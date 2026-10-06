# Arquitectura y evolución

El catálogo persistido desacopla los clientes de la disponibilidad del proveedor. La API HTTP no importa ni ejecuta el módulo de sincronización. El comando CLI usa un contexto Nest sin servidor HTTP; descarga y valida todos los recursos antes de escribir en la base de datos.

```text
Fuentes IPTV públicas/autorizadas
           ↓ CatalogProvider
Integración HTTP (timeout, reintentos, host y DNS autorizados)
           ↓
Normalización (NSFW/DMCA, URLs, relaciones, deduplicación)
           ↓
Sincronización TypeORM (lotes + transacciones + exclusión concurrente)
           ↓
MariaDB hmodevelopers_iptv
           ↓
REST / OpenAPI → clientes web, móviles y TV
```

## Modelo

- `Channel`: identidad `(source, externalId)`, país opcional, metadatos y estado del canal.
- `Country`: código ISO de dos letras; idiomas en arreglo JSON.
- `Category`: slug único; descripción y fechas.
- `ChannelCategory`: clave primaria compuesta; relación muchos a muchos, sin listas separadas por comas.
- `Stream`: alternativas por canal, feed opcional y clave SHA-256 de `[feedId, URL normalizada]`. Incluye formato deducido de la extensión, calidad, headers sugeridos, labels y estado de verificación.

Los arreglos de idiomas y labels se serializan como JSON (`simple-json`, TEXT compatible con MariaDB 10.11). No son relaciones con otras entidades en esta fase. Las fechas utilizan UTC. Las eliminaciones de canales propagan a streams y relaciones; eliminar un país deja `countryCode` nulo.

## Sincronización

1. Obtiene los seis catálogos oficiales, sin descargar video ni logos.
2. Valida la blocklist completa: una entrada inválida cancela la operación. Rechaza catálogos esenciales vacíos. Un canal cuyo `is_nsfw` no sea explícitamente `false` se excluye.
3. Adquiere `GET_LOCK` por conexión para evitar dos escritores IPTV-org en MariaDB. El lock se libera incluso ante errores; SQL.js omite únicamente ese lock en pruebas.
4. Retira canales ya almacenados que ahora estén bloqueados/NSFW. Actualiza países y categorías por lotes.
5. Cada lote de canales es transaccional: actualiza metadatos, reemplaza relaciones de categorías y reconcilia streams. Conserva ID y verificación de streams cuya URL/feed no cambiaron.
6. Un lote fallido se revierte, se cuenta como error y se continúa; el CLI sale con código 1. Los lotes anteriores permanecen confirmados y el siguiente intento converge.
7. Solo cuando todos los lotes terminan correctamente, desactiva canales desaparecidos de esa fuente y elimina sus streams. Otros proveedores quedan fuera de esta operación.

La idempotencia se refiere a identidades y relaciones: una segunda ejecución no crea duplicados. `lastSyncedAt` y `updatedAt` sí cambian. El sincronizador no interpreta errores de conectividad como un catálogo vacío. No hay sincronización automática ni endpoint administrativo público.

## Seguridad y límites reales

Las solicitudes salientes solo se permiten al host oficial por HTTPS. Un lookup DNS verifica que la dirección elegida sea pública y la misma resolución se utiliza para conectar. Se rechazan redirecciones, proxies de entorno y respuestas superiores a 64 MiB por recurso. Las URLs de metadatos y streams se validan sintácticamente y rechazan IP privadas/reservadas y credenciales incrustadas; **no se consultan sus hosts**. Un DNS de un stream puede cambiar: un verificador/proxy futuro necesitará la misma política de resolución y conexión antes de hacer solicitudes.

Helmet, CORS con lista explícita, validación DTO, excepciones sin detalles internos y throttling están implementados. CORS limita el acceso de navegadores; no constituye autenticación. Rate limiting usa memoria por proceso y dirección de conexión. No se confía automáticamente en `X-Forwarded-For`; antes de desplegar detrás de un proxy deben configurarse proxies de confianza concretos. Varias réplicas necesitarán almacenamiento compartido de límites.

La base exige credenciales configuradas, nombre fijo y esquema manual. El usuario de la API debería tener SELECT/INSERT/UPDATE/DELETE en esta base; una cuenta controlada temporalmente puede aplicar DDL para migraciones. No se asignan privilegios desde este repositorio. Los errores HTTP no devuelven consultas, stacks, tokens ni conexiones. Los logs SQL con parámetros están desactivados incluso con `DB_LOGGING=true`; esa opción habilita solo logs de esquema/migración.

No hay verificación de disponibilidad de video: los streams nuevos son `UNKNOWN`, con `lastCheckedAt=null`. Las extensiones permiten inferir HLS/DASH/MP4/MPEG-TS, pero no confirman codecs, soporte del navegador ni disponibilidad. `labels` preserva avisos como geobloqueo; los headers sugeridos no evaden restricciones y algunos requieren soporte nativo del cliente. La API no retransmite ni hace proxy.

## Evolución de seguridad (pendiente)

El futuro módulo `Auth` deberá incorporar JWT de acceso breves, refresh tokens rotados y almacenados como hashes, usuarios, roles y permisos. Un módulo `Sessions` permitirá revocación, auditoría, monitoreo y límites de conexiones. Los endpoints administrativos requerirán guards de autorización y registros de auditoría. Los tokens de reproducción deberán ser breves y asociados a usuario/sesión/fuente autorizada; nunca concederán derechos sobre contenidos de terceros. TLS en el ingress, almacenamiento de secretos y monitoreo centralizado completarán el despliegue.

Estos módulos no están implementados; actualmente los endpoints GET son públicos y únicamente consultan el catálogo.
