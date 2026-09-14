# NeurALE

Plataforma modular de operaciones para CD NNEO (VIDRI). Ver `ARCHITECTURE.md` (documento del proyecto NeurALE en Claude) para la arquitectura completa — este README solo cubre cómo correr y desplegar este repositorio.

Este repo es la base creada en el chat **Setup y Diseño**: scaffold, sistema de diseño (Tailwind) y layout compartido (nav + rutas + Núcleo Neuronal). Los módulos de negocio (Inbound, Storage, Picking, Outbound, Inventory, Dashboard Neuronal) se construyen encima de esta base, cada uno en su propio chat dentro del proyecto NeurALE.

## Stack

- React + Vite + TypeScript + Tailwind CSS v4, como PWA instalable
- React Router (rutas de módulos)
- Supabase (`@supabase/supabase-js`) — cliente único en `src/lib/supabase.ts`

## Estructura

```
/src
  /modules          <- una carpeta por módulo de negocio (index.tsx = punto de entrada)
    /inbound
    /storage
    /picking
    /outbound
    /inventory
    /dashboard       <- Dashboard Neuronal
  /pages             <- pantallas que no son un módulo de negocio (Núcleo Neuronal, 404)
  /shared
    /components      <- GlassCard, PageTransition, ModulePlaceholder
    /layout          <- AppLayout, NavBar
    /hooks           <- useModuleNavigate
    modules.ts       <- registro único de módulos (path, label, descripción)
  /lib
    supabase.ts      <- cliente de Supabase + tipos de rol
  routes.tsx         <- enrutamiento
  index.css          <- tokens de diseño (Tailwind v4, @theme)
```

## Variables de entorno

Copia `.env.example` a `.env` y completa con las credenciales de tu proyecto de Supabase (Settings → API):

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

En Vercel, estas mismas variables se configuran en **Project Settings → Environment Variables** (no se suben en el repo).

## Desplegar sin instalar nada local

1. **GitHub**: en [github.com](https://github.com), crea un repositorio nuevo y sube esta carpeta completa arrastrando los archivos en la página "Add file → Upload files" (o usando el editor web) — no hace falta `git` instalado localmente.
2. **Vercel**: en [vercel.com](https://vercel.com), "Add New Project" → importa ese repositorio de GitHub. Vercel detecta Vite automáticamente (build command `npm run build`, output `dist`).
3. Antes del primer deploy, agrega las variables de entorno de Supabase (arriba) en Vercel.
4. Cada push a `main` vuelve a desplegar automáticamente.

## Desarrollo

Todo el desarrollo de este proyecto se hace en el entorno de Claude (este chat) — no requiere instalar Node ni dependencias en la PC de dominio. Los comandos de referencia, para quien corra el proyecto en su propia máquina, son los estándar de Vite:

```
npm install
npm run dev       # servidor de desarrollo
npm run build     # build de producción (tsc -b && vite build)
npm run preview   # sirve el build de producción localmente
npm run lint      # oxlint
```
