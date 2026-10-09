# Reintentar Free-TV y RW1986 IPTV

El parser acepta `#EXTM3U`, `#EXTM3U ...` y `#EXTM3U8`. Cada entrada rechazada incrementa `discarded` una vez, sin importar cuántas validaciones falle. URLs inválidas, privadas, con userinfo o parámetros sensibles, nombres/logos inválidos y protocolos/directivas de reproducción no soportados descartan la entrada completa. No se eliminan credenciales para intentar recuperar URLs. HTTP(S) público sin extensión reconocida sigue permitido conforme a la política existente (`format: null`).

Los tags `#EXT-X-*`, encabezados inválidos, encoding inválido, límites excedidos y estructura corrupta abortan el catálogo. Un catálogo sin entradas válidas falla antes de importar o reconciliar. Los descartes normales conservan `SUCCESS`; errores de persistencia o sincronización conservan el manejo existente de `PARTIAL`/`FAILED`.

## Procedimiento manual

Estos pasos no se ejecutaron durante la implementación. Desplegar primero la versión corregida mediante el procedimiento habitual del proyecto.

Usar una sesión Bearer vigente de SUPER_ADMIN, o ADMIN con los permisos `providers.read/manage` y `sync.execute/history`. Sustituir `API_BASE` por la URL de la API, sin `/api` al final, y `ACCESS_TOKEN` por el access token de la sesión.

1. Consultar `GET /api/admin/providers/3` y `GET /api/admin/providers/5`. Confirmar que corresponden respectivamente a Free-TV (`free-tv`) y RW1986 IPTV (`rw1986-iptv`), tipo `M3U_URL`, y que sus URLs configuradas son las previstas. Los IDs pueden variar entre bases: detenerse si no corresponden.
2. Si alguno está deshabilitado, habilitar explícitamente solo ese proveedor con `PATCH /api/admin/providers/3` o `/5` y cuerpo `{"isActive":true,"syncEnabled":true}`. RW1986 requiere la revisión del candidato documentada en el seed antes de habilitarlo.
3. Solicitar únicamente estas dos sincronizaciones:

```bash
curl --fail-with-body -X POST "$API_BASE/api/admin/providers/3/sync" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
curl --fail-with-body -X POST "$API_BASE/api/admin/providers/5/sync" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Cada respuesta 202 devuelve el ID de ejecución; todavía no significa que haya terminado. Si devuelve 409, consultar la ejecución activa antes de reintentar.

4. Consultar el historial de cada proveedor hasta que la ejecución devuelta tenga `finishedAt`:

```bash
curl --fail-with-body "$API_BASE/api/admin/providers/3/sync-runs?limit=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
curl --fail-with-body "$API_BASE/api/admin/providers/5/sync-runs?limit=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Verificar `status: SUCCESS`, `errors: 0`, los contadores de canales/streams y `discarded` para las entradas rechazadas. Si hay `FAILED` o `PARTIAL`, revisar los códigos sanitizados del historial. Esta operación importa y reconcilia únicamente esos proveedores; los canales nuevos permanecen DRAFT conforme al flujo existente.
