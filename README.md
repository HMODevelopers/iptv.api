# HMODevelopers IPTV API

Una plataforma de servicios IPTV para administrar y proporcionar acceso estructurado a canales de televisión por internet provenientes de fuentes públicas y autorizadas. Esta primera fase implementa el backend del catálogo; prepara la información que consumirán aplicaciones web, móviles y televisores inteligentes.

## ¿Qué es HMODevelopers IPTV?

Las fuentes IPTV publican catálogos con identificadores, nombres, logos y enlaces de reproducción que pueden cambiar o quedar fuera de servicio. Consultarlos por separado produce información inconsistente y dificulta encontrar canales y alternativas.

Una plataforma de agregación reúne esa información, la normaliza y organiza por país y categoría. HMODevelopers IPTV descubre los canales a través de proveedores, relaciona sus streams y mantiene un catálogo centralizado. Los clientes consultan ese catálogo mediante REST sin depender de una descarga externa por cada solicitud. Centralizar facilita búsquedas, actualizaciones y una futura administración de disponibilidad y acceso.

## ¿Para qué sirve esta API?

Permite consultar canales internacionales o mexicanos, explorar categorías y países, y obtener fuentes alternativas de reproducción junto con sus metadatos. La sincronización mantiene identidades y relaciones estables para evitar duplicados. La arquitectura distingue la integración con proveedores, la normalización, el almacenamiento y las consultas que consumen los clientes.

## Funcionalidades actuales

- Integración con los seis recursos oficiales de [IPTV-org](https://github.com/iptv-org/api): canales, streams, logos, categorías, países y blocklist.
- Catálogo internacional persistido; México se selecciona mediante `country=MX`.
- Exclusión NSFW/DMCA y retiro de canales anteriormente importados que pasan a estar bloqueados.
- Sincronización manual por lotes, transacciones, reintentos, timeout, estadísticas y control de ejecución concurrente en MariaDB.
- Canales con relaciones normalizadas a países/categorías y múltiples streams; eliminación de alternativas retiradas y desactivación de canales desaparecidos.
- Endpoints GET con búsqueda, filtros, ordenamiento, paginación limitada y documentación OpenAPI.
- Migraciones manuales TypeORM, configuración validada, pruebas unitarias/integración y preparación Docker.

Los streams nuevos tienen estado `UNKNOWN`: no se comprueba su disponibilidad en esta fase. No hay frontend, proxy de video ni retransmisión. Guardar un enlace no garantiza que pueda reproducirse o que exista autorización para su uso.

## Funcionalidades futuras

Se prevé incorporar múltiples proveedores, listas M3U y proveedores compatibles con Xtream API; EPG, favoritos e historial; usuarios, roles y permisos; reproducción web; verificación de calidad/disponibilidad, monitoreo de fuentes y estadísticas de uso; clientes móviles y para televisores inteligentes. Estas funcionalidades todavía no están implementadas.

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
    entities/     Channel, Stream, Country, Category, ChannelCategory
    migrations/   1760000000000-InitialCatalog.ts
    data-source.ts
  providers/
    provider.ts   Contrato extensible
    iptv-org/     Cliente HTTP, normalización y sincronización
  cli/            Comando manual de sincronización
scripts/          Wrapper de migraciones TypeScript/compiladas
test/             Unitarias e integración HTTP/TypeORM aislada
docs/             Arquitectura y decisiones
```

## Seguridad

Actualmente se aplican Helmet, CORS configurable con orígenes explícitos, límites de solicitudes, validación global de DTOs, consultas parametrizadas, paginación máxima de 100 y errores HTTP consistentes sin detalles internos. La integración usa HTTPS, timeouts, reintentos acotados, verificación DNS de direcciones públicas, un único host autorizado y ninguna redirección. No se hacen solicitudes a URLs de reproducción o logos.

Las credenciales se configuran en `.env`, excluido de Git y del contexto Docker. No se registran errores Axios completos ni parámetros SQL. `synchronize` y `migrationsRun` están desactivados obligatoriamente; el nombre de la base se valida como `hmodevelopers_iptv`. No se crea otra base ni otro contenedor MariaDB. `DB_SSL=true` exige validación de certificado; el servidor debe tener un certificado reconocido por el runtime.

Los endpoints de consulta son públicos. JWT, refresh tokens, sesiones revocables, usuarios, roles/permisos, auditoría, protección administrativa, límites de conexiones, monitoreo y tokens de reproducción son trabajo futuro. Se deberán combinar con controles sobre fuentes autorizadas. El throttling actual es por proceso; para múltiples réplicas necesitará almacenamiento compartido. Swagger puede desactivarse para producción con `SWAGGER_ENABLED=false`.

## Instalación y configuración

Requisitos: Ubuntu, Node.js 22 LTS, npm y conectividad autorizada a MariaDB 10.11. Docker es opcional para desarrollo local. La base `hmodevelopers_iptv` ya debe existir.

```bash
npm install
```

El repositorio incluye `.env.example`; esta implementación también creó físicamente `.env`. En un clon nuevo, crea tu configuración con `cp .env.example .env`. Si tienes un `.env` existente, conserva sus valores y agrega únicamente variables faltantes.

Edita manualmente `DB_USERNAME` y `DB_PASSWORD`. Se mantienen como marcadores `COLOCAR_USUARIO` y `COLOCAR_PASSWORD`; la API y el sincronizador fallan antes de realizar conexiones mientras permanezcan así. No compartas ni versiones ese archivo.

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

### Conexión a MariaDB y migraciones

1. Configura credenciales con acceso exclusivamente a `hmodevelopers_iptv`; verifica que el servidor permita conexiones desde tu Ubuntu. No necesitas proporcionar credenciales en el chat.
2. Verifica host/puerto, conectividad, permisos y, si aplica, TLS.
3. Consulta y ejecuta las migraciones manualmente:

```bash
npm run migration:show
npm run migration:run
```

La migración inicial crea cinco tablas, índices, claves foráneas, claves únicas, timestamps y restricción de estado de streams. No crea una base de datos. MariaDB realiza commits implícitos en DDL: ante un fallo parcial, inspecciona el esquema antes de repetir; una transacción no garantiza revertir todo el DDL.

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

Swagger: `http://localhost:3000/api/docs`. OpenAPI JSON: `/api/docs-json`.

## Endpoints

| Método y ruta | Resultado |
| --- | --- |
| `GET /api/health` | Estado de aplicación/base; 503 si MariaDB no responde |
| `GET /api/channels` | Lista paginada de canales y categorías |
| `GET /api/channels/:id` | Detalle con país y categorías; 404 si no existe |
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

`status`: `active` (predeterminado), `inactive`, `all`; describe el estado del canal, no del stream. `sortBy`: `name`, `createdAt`, `lastSyncedAt`. `order`: `ASC` o `DESC`. `page`: 1–1000000; `limit`: 1–100, predeterminado 20. País requiere código de dos letras mayúsculas; categoría usa slug. La búsqueda por nombre es parcial y trata `%`/`_` como caracteres literales. Los parámetros desconocidos o inválidos devuelven 400.

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

La sincronización automática del esquema existe **solo en esa base efímera de pruebas**. Producción y CLI la rechazan. Validación ejecutada en este entorno con Node.js 22.23.3: `npm run lint` y `npm run build` correctos; `npm run test`: **45 pruebas aprobadas en 5 suites**. También se resolvió la migración compilada y se construyeron los metadatos MariaDB sin abrir conexiones. Node.js se descargó únicamente a un directorio temporal para estas validaciones; no se instaló globalmente.

La aplicación/migración todavía requieren validación real contra MariaDB 10.11 tras configurar credenciales; tampoco se ha validado la imagen mediante Docker en este entorno.

## Consideraciones legales

La plataforma no proporciona derechos de distribución sobre contenidos de terceros. Cada fuente debe utilizarse respetando sus autorizaciones, licencias, términos y restricciones aplicables. Se excluyen contenidos NSFW y los canales de la blocklist oficial. No se implementan mecanismos para evadir DRM, geobloqueos ni restricciones de acceso.

## Licencia

[MIT](LICENSE) para el código desarrollado en este repositorio. No se extiende a canales, logos, streams ni otros contenidos de terceros.
