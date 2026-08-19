# Omni organize — Claude Context

## Qué es

Organizador visual con cuatro conceptos y una sola jerarquía:

```
Área ──┬── Proyecto ── Tarea ── Tarea ── …
       └── Objetivo
```

- **Área** — ámbito permanente (Salud, Finanzas, AxelyaLabs). Es el techo: no
  se anida, **no tiene estado** (nunca se completa; solo se mantiene o se
  descuida) y **no se puede eliminar mientras tenga contenido**.
- **Proyecto** — **no es un tipo nuevo**: es una `Task` con `parentId === null`
  y un `areaId` obligatorio e inmutable. Contiene Tareas, nunca otro Proyecto.
- **Tarea** — sin cambios respecto del modelo original. Siempre vive dentro de
  un Proyecto; su cadena de ancestros termina en uno, nunca en un Área.
- **Objetivo** — colección aparte de `tasks`. No vive en ningún lienzo: sin
  `parentId`, sin `x`/`y`, sin `seqNext`, sin `collapsed`. Su estado es
  **siempre manual**.

El motor del lienzo no cambió: abrir un Proyecto es exactamente lo que antes
era abrir una tarea raíz.

Reconstrucción fiel del export de Claude Design (`x-dc`) sobre el stack de
_famrize_ (Next.js + NestJS/Prisma + paquete shared en monorepo pnpm/Turbo).

## Stack y layout

- `apps/web` — Next.js 14 App Router, todo cliente. La UI es minimalista y usa
  **estilos inline con valores px exactos** (fidelidad con el diseño), no clases.
- `apps/api` — NestJS 11 + Prisma 6 + PostgreSQL. Tres módulos: `areas`,
  `objectives`, `tasks`.
- `packages/shared` — `Area`, `Task`, `Objective`, sus estados, `STATUS_META`,
  `OBJECTIVE_STATUS_META`, esquemas zod **y las reglas de dominio**
  (`rules.ts`). Fuente única de verdad para web y api. Se transpila desde
  fuente (transpilePackages).

## Frontend — piezas clave

- `src/lib/engine.ts` — **el corazón del lienzo**. Clase `TaskGraph`: layout
  recursivo, tamaños, resolución de estado, routing de flechas (bézier con
  esquiva de obstáculos), reglas de enlace entre tareas. Port fiel y puro del
  script del export. **Cámbialo aquí si cambia la geometría/lógica.**
- `src/hooks/useOmniOrganize.ts` — port de la clase `Component` del export a un
  hook. Mantiene las tres colecciones y todos los handlers (drag, anidado,
  secuencia, zoom/pan, undo/redo, edición de nombre con enlaces, vínculos del
  inicio, persistencia debounced). Usa un `stateRef` para lecturas síncronas
  estilo `this.state`.
- `src/components/` — `OmniOrganize` (shell + overlays + menú contextual),
  `HomeScreen` (franja de área + sección inferior), `HomeBoard` (rejilla de
  cuatro franjas y curvas), `EditorScreen`, `CanvasNode`, `icons`.
- `src/lib/api.ts` — carga/guarda áreas, tareas y objetivos. Sin
  `NEXT_PUBLIC_API_URL` ⇒ modo local (`localStorage`). Con ella ⇒ API + cache
  local.

## Reglas del modelo (derivadas, no almacenadas)

- **Estado efectivo**: si alguna predecesora (por `seqNext`) no está
  `completada`, la tarea se muestra `bloqueada`. Si no está bloqueada y alguna
  hija está `en_progreso`, la contenedora también se muestra `en_progreso`
  (aunque su propio estado guardado diga otra cosa) y, mientras eso pase, no se
  puede cambiar su estado manualmente (`setStatus` lo rechaza; el menú
  contextual simplemente no muestra la sección de estado). Ver `statusResolver()`.
- ⚠️ **Excepción deliberada de `statusResolver()` — no la "arregles".** La regla
  de bloqueo **se omite en los nodos raíz** (`parentId === null`, o sea los
  Proyectos). La secuencia entre Proyectos es **orden, no regla**: un proyecto
  que va detrás de otro se puede trabajar con normalidad. Por eso:
  - **`bloqueada` no aplica jamás a un Proyecto**, y tampoco se hereda a sus
    Tareas.
  - `blockers()` devuelve siempre `[]` para un nodo raíz, así que ni el tooltip
    ni el menú contextual hablan de bloqueo en la columna de proyectos.
  - **Dentro** de un Proyecto, las Tareas se siguen bloqueando entre sí
    exactamente igual que antes.
  Si alguien borra esa condición creyendo que es un bug, rompe el modelo.
- **Completar**: solo si todas las descendientes están completas (`canComplete`).
- **Enlazar tareas** (`canLink`): no con un ancestro, ni con una descendiente,
  ni cerrando un ciclo.
- **Progreso** de una tarjeta = % de hijas directas completadas.
- Estados de Tarea: `pendiente` (gris) · `en_progreso` (azul) · `bloqueada`
  (rojo) · `completada` (verde).
- Estados de Objetivo: `activo` (azul) · `logrado` (verde) · `fallido` (rojo).
  **Nunca se derivan** y **cualquier transición es válida** — un objetivo
  `logrado` o `fallido` se puede devolver a `activo`.

## Reglas de dominio (`packages/shared/src/rules.ts`)

La comprobación vive aquí y la interfaz solo la refleja; ni la UI ni la API
pueden saltársela. Cada función devuelve `null` si la operación es válida, o el
motivo en español listo para mostrar.

- `canLinkProjects(tasks, origen, destino)` — ambos raíz, mismo `areaId`, sin
  auto-enlace y sin ciclo (`canReach`). **No bloquea al destino.**
- `canLinkObjective(objetivo, proyecto)` — mismo `areaId` y el destino debe ser
  un Proyecto raíz. Vincular con una Tarea anidada es imposible.
- `canDeleteArea(areaId, tasks, objectives)` — rechaza si el área tiene
  proyectos u objetivos, y explica cuántos. Sin cascada ni reasignación.
- `checkTaskArea(task, areas)` — `parentId: null` **sin** `areaId` dejó de ser
  un estado válido. Las tareas anidadas, al revés, no llevan `areaId`: lo
  heredan de su Proyecto.
- `detachProjects(objectives, ids)` — al eliminar un Proyecto hay que limpiar su
  id de todos los `linkedProjectIds`, mismo patrón que ya se aplica a `seqNext`.

Otras invariantes: el vínculo Objetivo ↔ Proyecto es **muchos-a-muchos**,
**binario** (sin peso ni porcentaje) y **se guarda de un solo lado**, en
`linkedProjectIds` del Objetivo. Estar vacío en cualquiera de los dos lados es
válido, no un error. **Nada cruza áreas**: ni pertenencia, ni secuencia, ni
vínculo. `areaId` es inmutable después de crear.

## Pantalla de inicio

- Arranca **sin ninguna Área**; no se crea ninguna por defecto. El estado vacío
  tiene su propia franja y un bloque punteado en lugar de las columnas.
- Franja del Área (tinte verde) con nombre y descripción editables in situ; el
  desplegable **solo navega** entre áreas existentes, **nunca crea**. No existe
  la opción "Todas las áreas".
- Rejilla de cuatro franjas: canal de secuencia (44 px) · Proyectos (1fr) ·
  canal de vínculo (56 px) · Objetivos (1fr). Las dos columnas de contenido son
  iguales.
- Tarjetas de **altura mínima (92 px)**, no fija: el nombre de un Proyecto o de
  un Objetivo **nunca se recorta**, se reparte en las líneas que haga falta y la
  tarjeta crece. Como las alturas varían, `HomeBoard` **mide** el centro de cada
  tarjeta (`offsetTop`/`offsetHeight`) en un `useLayoutEffect` y ancla ahí las
  curvas; la aritmética por índice solo se usa como respaldo en el primer
  pintado, antes de medir.
- Curvas **bézier siempre**, nunca ángulos rectos: con punta de flecha en el
  canal de secuencia (el orden importa) y **sin** punta en el de vínculo (no
  tiene dirección de ejecución).
- Puntos de conexión rellenos si la tarjeta tiene vínculos, vacíos si no.
  Arrastrar crea; soltar en el vacío no crea nada; doble clic sobre una curva
  la elimina.
- Por debajo de 900 px **no se apila**: el tablero mantiene su ancho mínimo y la
  pantalla se desplaza en horizontal, para que los canales no se queden sin sitio.
- Sección inferior "Actividades por estado": tareas del **área seleccionada** a
  todos los niveles **dentro** de sus Proyectos, ruta `Proyecto - Tarea - …`,
  orden por fecha de modificación descendente, y el filtro vuelve a "En
  progreso" al entrar. **Los Objetivos no aparecen aquí**, porque no son tareas,
  y **los Proyectos tampoco**: ya tienen su columna justo encima, y esta tabla
  trata del trabajo que hay *dentro* de ellos. Los contadores de los filtros
  cuentan lo mismo que la tabla.
- ⚠️ La ruta **no incluye el Área**, aunque la especificación original la pedía:
  la tabla entera pertenece ya al área seleccionada, así que repetir su nombre
  en cada fila solo desplazaba la parte útil fuera de la vista. Decidido a mano,
  no es un olvido.

## Backend

- Modelos `Area`, `Task` y `Objective` en `prisma/schema.prisma`. `modifiedAt`
  es `BigInt` en DB y se convierte a `number` en los servicios (`toDto`).
- `Area → Task` y `Area → Objective` usan **`onDelete: Restrict`**: la base
  rechaza borrar un área con contenido aunque alguien esquive el servicio.
- `PUT /api/tasks` reemplaza el grafo completo en una transacción, insertando
  padres antes que hijos (FK self-relation con `onDelete: Cascade`), valida
  `areaId` en los nodos raíz y limpia los `linkedProjectIds` que queden
  colgando.
- `GET/POST/PATCH/DELETE` para `/api/areas` y `/api/objectives`. El PATCH de un
  objetivo **no acepta `areaId`**: no hay forma de moverlo de área.
- Validación con `ZodValidationPipe` + esquemas de `@omni-organize/shared`.
- Migraciones en `prisma/migrations/`. Sin seed: la app arranca vacía.

## Despliegue

- **Local**: `pnpm db:up` → `pnpm --filter @omni-organize/api db:deploy` →
  `pnpm dev`.
- **Vercel**: solo `apps/web` (`vercel.json` filtra el build por Turbo). Corre
  sin backend si no defines `NEXT_PUBLIC_API_URL`.
- **Cloud del backend**: pendiente a propósito (no implementado aún).

## Al trabajar aquí

- Mantén sentence case en etiquetas/botones; nada de Title Case ni mayúsculas.
- La lógica de lienzo pertenece a `engine.ts` (puro) + `useOmniOrganize.ts`
  (estado); las reglas entre Áreas, Proyectos y Objetivos pertenecen a
  `packages/shared/src/rules.ts`. Los componentes solo pintan view-models.
- Sin emoji; iconos SVG de trazo. La paleta es la de `STATUS_META` /
  `OBJECTIVE_STATUS_META` y no se amplía.
- El texto de UI está en español, igual que el export.

## Fuera de alcance (decidido, no olvidado)

Rutinas/Hábitos/Rituales de revisión · fecha límite o métricas en los Objetivos ·
mover Proyectos u Objetivos entre Áreas · opción "Todas las áreas" · pesos en el
vínculo Objetivo ↔ Proyecto · anidar Áreas, Proyectos u Objetivos · vincular un
Objetivo con una Tarea anidada · cualquier relación que cruce Áreas · `bloqueada`
en Proyectos · cambios en las reglas de estado de las Tareas.
