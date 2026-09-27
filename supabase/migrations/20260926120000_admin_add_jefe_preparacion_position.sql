-- Configuraciones y Administradores · nuevo puesto
-- Agrega "Jefe de Preparación" al catálogo controlado de puestos.
--
-- Nota: esto también se puede hacer sin correr SQL, desde la propia app —
-- en Empleados → "+ Agregar puesto nuevo" (usa la misma tabla). Este archivo
-- solo lo deja versionado junto con el resto del historial de puestos.

insert into admin_positions (name) values
  ('Jefe de Preparación')
on conflict (name) do nothing;
