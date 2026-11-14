# Entrega Storage — Auditoría OPL: detalle por LPN / ubicación (2026-11-15)

Base: commit 17343c0 de GitHub (verificado que es el último antes de armar esta entrega).

## Pasos
1. **Primero el SQL:** correr `supabase/migrations/20261115120000_storage_opl_key_detail.sql` en Supabase → SQL Editor (idempotente, no toca tablas).
2. Subir a GitHub los 4 archivos de código (rutas iguales a las del repo):
   - `src/modules/storage/opl/OplKeyDetail.tsx` (nuevo)
   - `src/modules/storage/opl/OplReviewViews.tsx`
   - `src/modules/storage/opl/lib/opl.ts`
   - `supabase/migrations/20261115120000_storage_opl_key_detail.sql` (nuevo, para dejarlo versionado)

Si se sube el código sin correr el SQL, la tabla por SKU sigue funcionando y el detalle avisa que falta el SQL.

## Qué cambia en "Resultados y avance"
- Buscador por texto: SKU, descripción, LPN (o la llave elegida), ubicación y columnas extra. Si coincide un LPN, el SKU aparece con "N LPN coinciden".
- Ordenar SKU por código o por "Más pendientes".
- Clic en un SKU → detalle de sus LPN con filtros Pendientes / Contados / Recontados / Sobrantes / Todos, buscador propio, orden por ubicación o LPN y "Descargar lista (CSV)".
- Pestaña "Detalle por LPN (N pendientes)": todas las llaves de la auditoría con los mismos filtros, orden por ubicación/LPN/SKU y descarga CSV (sirve para imprimir la ruta de lo que falta).
- Con la auditoría cerrada, los pendientes salen como "No encontrado".
- Conteo ciego intacto: el operador ve qué falta, quién contó y cuándo, pero no la cantidad del formato ni lo que contaron otros.
