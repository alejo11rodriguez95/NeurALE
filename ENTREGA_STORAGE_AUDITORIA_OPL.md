# Entrega Storage · Auditoría OPL — 2026-11-14

Base: repo clonado en `bece29c` (2026-10-07). Sobre ese árbol: `npm ci`, `tsc -b && vite build` y `oxlint` OK.

## Orden para subir
1. **Supabase → SQL Editor:** correr `supabase/migrations/20261114120000_storage_opl_audit.sql`. Es idempotente. Requiere las migraciones de admin y de ISQ, que ya están corridas.
2. **GitHub:** subir los archivos del zip respetando las rutas, **incluidos `package.json` y `package-lock.json`**. Traen 3 librerías nuevas: `read-excel-file` (lee el Excel) y `@zxing/browser` + `@zxing/library` (leen el código con la cámara en iPhone). Vercel las instala solo.
3. **Probar en un celular real** con la URL de producción (https). La cámara pide permiso la primera vez.

## Archivos
Nuevos:
- `supabase/migrations/20261114120000_storage_opl_audit.sql`
- `src/modules/storage/opl/lib/opl.ts`: datos y llamadas a la base.
- `src/modules/storage/opl/lib/excel.ts`: lectura del Excel y mapeo de columnas.
- `src/modules/storage/opl/BarcodeScanner.tsx`: lector con cámara. Usa el lector nativo en Android y zxing como respaldo en iPhone.
- `src/modules/storage/opl/ui.tsx`
- `src/modules/storage/opl/OplAuditView.tsx`: menú de Auditoría OPL.
- `src/modules/storage/opl/OplOperatorsView.tsx`: Asignación de OPL.
- `src/modules/storage/opl/OplCountView.tsx`: Auditoría {OPL}, con la carga del Excel y el conteo.
- `src/modules/storage/opl/OplReviewViews.tsx`: Revisión de Discrepancias y Resultados y avance.

Modificados:
- `src/modules/storage/index.tsx`: tarjeta "Auditoría OPL" (`?view=auditoria-opl`). Se conservan todas las demás.
- `src/modules/admin/lib/accessLevels.ts`: `MODULE_VIEWS.storage` + `auditoria-opl`. Es una línea, archivo del chat de Configuraciones.
- `package.json`, `package-lock.json`

No deja archivos huérfanos.

## Texto para ARCHITECTURE.md (cuando esté subido y corrido)

### Storage — Auditoría OPL (chat de Storage, 2026-11-14)
Auditoría del inventario de operadores logísticos (OPL, ej. TLA) a partir del Excel que entrega el operador.

**Navegación:** `?view=auditoria-opl` en Storage, con sub-navegación `&sec=asignacion | opl&opl=<id>[&audit=<id>] | discrepancias[&audit=] | resultados[&audit=]`. Es el mismo precedente que Control de Averías: no agrega rutas ni entradas nuevas en `MODULE_VIEWS` más allá de `auditoria-opl`. El código está en `src/modules/storage/opl/`.

**Pantallas:**
- **Asignación de OPL** (solo configuradores):
  - Se crea el OPL y se sube un Excel modelo.
  - NeurALE detecta las hojas (elige la de más filas) y la fila de títulos.
  - Se mapea la **llave de conteo** (ej. LPN, debe ser única por fila), SKU, Descripción y Cantidad, que son obligatorios.
  - Opcionales: Ubicación y columnas extra que se muestran al contar.
  - Antes de guardar se ve una vista previa de los totales y de las llaves repetidas.
- **Auditoría {OPL}** (una tarjeta por OPL activo):
  - **Cargar el Excel** (configuradores): se valida contra el mapeo, buscando hoja y fila de títulos. Se rechaza si la llave se repite. Las líneas se suben en partes de 1,500.
  - **Conteo desde el celular** (cualquier usuario de Storage), en **conteo ciego**:
    - Se escanea con la cámara o se digita la llave.
    - Aparecen Ubicación, SKU, Descripción y los extras. Nunca se muestra la cantidad del formato.
    - El contador digita lo contado y confirma.
    - La llave queda bloqueada: si dos personas la confirman a la vez, gana la primera.
    - Quien contó, o un configurador, puede deshacer su conteo.
  - **Sobrantes:** si la llave no está en el formato, se registra como sobrante (SKU, ubicación, cantidad, nota).
  - Opción de escaneo continuo. El avance compartido se actualiza en tiempo real.
- **Revisión de Discrepancias:**
  - Un SKU aparece cuando todas sus llaves están contadas (o la auditoría se cerró) y el total (conteo final + sobrantes) ≠ formato.
  - Reconteo a ciegas llave por llave, por cualquier usuario de Storage.
  - El configurador ve formato, 1er conteo y reconteo por llave, y cierra como **"Cuadró en reconteo"** (solo si cuadra) o **"Diferencia confirmada"** (nota obligatoria). Puede reabrir.
  - Cerrado el SKU, ya no se cuenta, no se reconta ni se registran sobrantes de él.
- **Resultados y avance:**
  - % de llaves contadas, unidades contadas, SKU completos / cuadran / en discrepancia.
  - Exactitud del 1er conteo y en unidades, calculadas solo sobre SKU terminados.
  - Tabla por SKU con estado, avance por contador y CSV del detalle (configuradores).
  - Quien solo cuenta ve el avance sin cantidades esperadas.
- **Cerrar auditoría:** las llaves sin contar quedan como **no encontradas** (faltantes) y sus SKU pasan a Discrepancias. Se puede reabrir o eliminar.

**Permisos (RLS real, sin escritura directa: todo por funciones `security definer`):**
- Configurar OPL, cargar, cerrar o eliminar auditorías y cerrar discrepancias: `storage_isq_can_configure()` (admin, gerencia, jefe de Storage o nivel con "editar" en Storage).
- Contar, recontar y registrar sobrantes: `storage_opl_can_count()` (gerencia/admin o cualquiera con acceso a Storage).
- **Conteo ciego garantizado en la base:** `storage_opl_audit_lines` solo la leen los configuradores. Los contadores usan funciones que no devuelven la cantidad esperada.
- Anónimo: nada.

**Tablas** (migración `20261114120000_storage_opl_audit.sql`):
- `storage_opl_operators`: nombre, hoja, fila de títulos, títulos y `mapping` jsonb.
- `storage_opl_audits`: folio `TLA-0001`, estado `cargando/en_curso/cerrada`, totales y avance (`counted_lines`, `counted_units`, `extra_count`).
- `storage_opl_audit_lines`: llave única por auditoría, esperado, conteo, reconteo y quién/cuándo.
- `storage_opl_audit_extras`: sobrantes.
- `storage_opl_sku_reviews`: cierre por SKU.

Las auditorías, revisiones y sobrantes están en `supabase_realtime`.

**Funciones:**
- OPL: `storage_opl_operator_save`, `_operator_delete`.
- Auditoría: `_audit_create`, `_audit_add_lines`, `_audit_finalize`, `_audit_close`, `_audit_reopen`, `_audit_delete`.
- Conteo: `_lookup`, `_count`, `_count_undo`, `_extra_register`, `_extra_delete`.
- Revisión y avance: `_sku_summary`, `_sku_lines`, `_recount`, `_review_close`, `_review_reopen`, `_counters`, `_my_counts`.

Probada en Postgres 16 local con toda la cadena de migraciones (dos corridas) y el Excel real (643 LPN, 32 SKU, 158,144 unidades), con perfiles operador de Storage, jefe de Storage, operador de Inbound, gerencia y anónimo.

**Librerías nuevas:** `read-excel-file` (Excel en el navegador, carga bajo demanda) y `@zxing/browser` + `@zxing/library` (lector de códigos para navegadores sin `BarcodeDetector`, como iPhone, también bajo demanda). En Chrome Android se usa el lector nativo. La cámara exige https: funciona en producción y no en `http://`.

**Riesgos / a tener en cuenta:**
- El Excel trae **inventario real** del OPL. Por eso las tablas nacen con RLS real por rol; no dar acceso a Storage a quien no deba ver ese inventario.
- **NeurALE no ajusta inventario:** el resultado es para conciliar con el OPL y el WMS/vERP, igual que el resto de Storage (control operativo).
- La llave de conteo debe ser única en el archivo. Si un OPL no trae LPN, hay que elegir otra columna única o pedirle el formato.
- Si se vuelve a cargar un Excel corregido, se crea **otra** auditoría: no se mezcla con la anterior.
- Las llaves del formato que nadie encontró solo se vuelven faltantes al **cerrar** la auditoría. Antes de cerrar aparecen como pendientes.
- La lectura con cámara depende de la calidad de la etiqueta y de la luz. Siempre queda la opción de digitar el código.
