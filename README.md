# Omni organize

Organizador visual con cuatro conceptos y una sola jerarquía:

```
Área ──┬── Proyecto ── Tarea ── Tarea ── …
       └── Objetivo
```

- **Área** — ámbito permanente (Salud, Finanzas, AxelyaLabs). Es el techo: no se
  anida, no tiene estado (nunca se completa; solo se mantiene o se descuida) y no
  se puede eliminar mientras tenga proyectos u objetivos dentro.
- **Proyecto** — no es un tipo nuevo de entidad: es una tarea de nivel raíz con un
  área obligatoria e inmutable. Contiene tareas, nunca otro proyecto.
- **Tarea** — el único concepto del lienzo. Las tareas se relacionan solo de dos
  formas: **composición** (anidado; un padre como máximo) y **secuencia** (una
  precede a otra con una flecha).
- **Objetivo** — un resultado deseado dentro de un área. Vive fuera del lienzo y
  su estado (`activo` · `logrado` · `fallido`) se fija siempre a mano.

Entre proyectos también hay secuencia, pero **es orden, no una regla**: un
proyecto que va detrás de otro no queda bloqueado. Un objetivo y un proyecto se
vinculan en una relación muchos-a-muchos y binaria, siempre dentro de la misma
área — nada cruza áreas.

La implementación reconstruye fielmente el export de Claude Design
(`Task designer`) sobre el stack de referencia de _famrize_.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend (`apps/web`) | Next.js 14 (App Router) · React 18 · TypeScript · Tailwind |
| Backend (`apps/api`) | NestJS 11 · Prisma 6 · PostgreSQL · validación con zod |
| Compartido (`packages/shared`) | Tipos, estados (`STATUS_META`, `OBJECTIVE_STATUS_META`), esquemas zod y reglas de dominio |
| Monorepo | pnpm workspaces · Turborepo |

## Estructura

```
apps/
  web/     — Next.js. La lógica del lienzo vive en src/lib/engine.ts
  api/     — NestJS + Prisma. Modelos: Area, Task, Objective
packages/
  shared/  — tipos, estados, esquemas zod y rules.ts (reglas de dominio)
docker-compose.dev.yml — PostgreSQL local
vercel.json            — despliegue del frontend
```

## Requisitos

- Node ≥ 20 · pnpm ≥ 9
- Docker (solo para el backend con base de datos)

## Despliegue en local

Requiere Node ≥ 20, pnpm ≥ 9 y Docker corriendo.

1. **Clona el repo e instala dependencias** (esto también compila
   `packages/shared`, vía el hook `postinstall`):

   ```bash
   git clone <url-del-repo>
   cd omni-organize
   pnpm install
   ```

2. **Abre Docker Desktop** y espera a que el motor termine de iniciar (icono
   en la bandeja del sistema sin el indicador de "starting"). `pnpm db:up`
   falla si el daemon de Docker no está corriendo.

3. **Levanta PostgreSQL** con Docker Compose. Queda escuchando en
   `localhost:5433` (puerto distinto del 5432 por defecto, para no chocar con
   otras instancias locales):

   ```bash
   pnpm db:up
   ```

   Verifica que el contenedor esté sano antes de continuar:

   ```bash
   docker ps --filter name=omni-organize-postgres
   ```

4. **Configura las variables de entorno** copiando los ejemplos:

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```

   - `apps/api/.env` ya viene apuntando al Postgres del paso 3
     (`DATABASE_URL`), con `PORT=4000` y `CORS_ORIGIN=http://localhost:3000`.
   - `apps/web/.env.local` define `NEXT_PUBLIC_API_URL=http://localhost:4000/api`
     para que el frontend hable con la API en vez de usar `localStorage`.

5. **Aplica las migraciones de Prisma** (la app arranca vacía, sin áreas ni datos de
   ejemplo):

   ```bash
   pnpm --filter @omni-organize/api db:deploy
   ```

6. **Arranca api + web en paralelo** (Turborepo orquesta ambos):

   ```bash
   pnpm dev
   ```

   - Web → http://localhost:3000
   - API → http://localhost:4000/api
   - Healthcheck → http://localhost:4000/api/health

7. **Inspecciona la base de datos** (opcional). Postgres no habla HTTP, así
   que no puedes visitar `http://localhost:5433/` en el navegador — usa uno
   de estos dos caminos:

   - **Prisma Studio** (UI web, la forma más simple):

     ```bash
     pnpm --filter @omni-organize/api db:studio
     ```

     Abre una interfaz en `http://localhost:5555` (Studio corre como una app
     aparte que traduce las consultas; no es Postgres respondiendo HTTP).

   - **Un cliente de base de datos** (TablePlus, DBeaver, pgAdmin, `psql`),
     conectando con la cadena de conexión de `apps/api/.env`:

     ```
     postgresql://omniorganize:omniorganize@localhost:5433/omniorganize?schema=public
     ```

     o por campos separados: host `localhost`, puerto `5433`, usuario y
     contraseña `omniorganize`, base de datos `omniorganize`.

8. **Para detener todo**: `Ctrl+C` en el proceso de `pnpm dev`, luego
   `pnpm db:down` para apagar el contenedor de Postgres (los datos persisten
   en el volumen `postgres_data` entre reinicios), y finalmente puedes cerrar
   Docker Desktop.

> Atajo útil: `pnpm --filter @omni-organize/api db:reset` recrea la base de
> datos desde cero (vacía).

La API expone:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/areas` | Todas las áreas |
| `POST` | `/api/areas` | Crea un área |
| `PATCH` | `/api/areas/:id` | Renombra / edita la descripción |
| `DELETE` | `/api/areas/:id` | Elimina; **falla con 409 si tiene contenido** |
| `GET` | `/api/tasks` | Todo el grafo de tareas |
| `PUT` | `/api/tasks` | Reemplaza el grafo completo (sync del lienzo) |
| `POST` | `/api/tasks` | Crea una tarea |
| `DELETE` | `/api/tasks/:id` | Elimina una tarea (y sus anidadas, en cascada) |
| `GET` | `/api/objectives` | Todos los objetivos |
| `POST` | `/api/objectives` | Crea un objetivo |
| `PATCH` | `/api/objectives/:id` | Estado, nombre, favorito y `linkedProjectIds` |
| `DELETE` | `/api/objectives/:id` | Elimina un objetivo |
| `GET` | `/api/health` | Healthcheck |

Los endpoints de `/api/tasks` validan que toda tarea raíz tenga un área existente
y que la secuencia entre proyectos no cruce áreas ni cierre un ciclo. Al eliminar
un proyecto, su id desaparece de los `linkedProjectIds` de todos los objetivos.

## Scripts útiles

| Comando | Efecto |
|---------|--------|
| `pnpm dev` | api + web en paralelo (Turborepo) |
| `pnpm build` | build de todo el monorepo |
| `pnpm db:up` / `pnpm db:down` | PostgreSQL local |
| `pnpm --filter @omni-organize/api db:studio` | Prisma Studio |
| `pnpm --filter @omni-organize/api db:reset` | recrea la DB desde cero (vacía) |

## Despliegue en Vercel

El frontend es un proyecto Next.js dentro del monorepo. `vercel.json` ya define
el build filtrado por Turborepo.

1. Importa el repo en Vercel. Framework: **Next.js** (autodetectado).
2. **Root Directory:** deja la raíz del repo (`vercel.json` apunta a `apps/web`).
3. Variables de entorno (opcional): define `NEXT_PUBLIC_API_URL` con la URL
   pública de tu API si quieres persistencia en servidor. Si no la defines, la
   app corre en modo local (`localStorage`) — perfectamente desplegable así.
4. Deploy.

> El backend (`apps/api`) es un servicio NestJS con estado (PostgreSQL); no se
> despliega en Vercel. La configuración de infraestructura cloud queda pendiente
> a propósito.
