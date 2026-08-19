---
name: revisor-de-cambios
description: Resume en español los cambios pendientes (git diff) en omni-organizer y propone un mensaje de commit corto con el mismo estilo del historial del repo. Actívala cuando el usuario diga cosas como "revisa mis cambios", "dame la descripción para el commit", "¿qué cambié?" — y OBLIGATORIAMENTE de forma proactiva, sin que lo pidan, justo después de terminar cualquier modificación de código en este repositorio (un fix, una feature, un ajuste chico, lo que sea), antes de decir que la tarea está lista. Esta skill es un paso fijo del flujo de trabajo en este repo, no una utilidad opcional — úsala siempre que el diff de trabajo cambió.
---

# Revisor de cambios (omni-organizer)

Describe qué cambió y propone el mensaje de commit. No es una revisión de
calidad ni busca bugs — solo traduce el diff a una descripción legible y a
un mensaje de commit, en el estilo real de este repo.

Es un paso fijo del flujo: en este repo, ninguna modificación de código se
considera terminada hasta que esta skill corrió y entregó las dos partes del
punto 4 (resumen + mensaje de commit).

## 1. Reunir el diff

```bash
git status --short
git diff
git diff --staged
```

Si el usuario mencionó archivos o una zona del código en particular, enfoca
el resumen ahí; si no dijo nada, cubre todo lo que aparezca modificado.

## 2. Resumir los cambios

En español, breve, agrupando por archivo o por concepto si varios archivos
forman un solo cambio coherente (por ejemplo, un fix que toca `engine.ts` y
su caller en `useOmniOrganizer.ts` es un solo punto, no dos). Describe qué
cambió y, cuando no sea obvio del código, por qué — no repitas el diff línea
por línea.

## 3. Proponer el mensaje de commit

Formato, según el estilo real del historial de este repo (`git log --oneline`):

- Una línea corta, en modo imperativo, en español, sin punto final. Ejemplo:
  `Corregir solapamiento de tareas al agrandar un contenedor con el asa de resize`.
- Sin prefijos de Conventional Commits (`feat:`, `fix:`) — este repo no los usa.
- Si el cambio tiene un "por qué" no obvio (un bug sutil, una decisión de
  diseño), añade un cuerpo breve después de una línea vacía explicando esa
  razón — no repitas lo que ya dice el diff.
- No ejecutes `git commit` a menos que el usuario lo pida explícitamente en
  el mismo turno. Esta skill prepara la descripción; comitear es una acción
  del usuario o un paso separado.

## 4. Formato de salida

Entrega siempre las dos partes, en este orden y claramente separadas — no
mezcles el resumen con el mensaje de commit ni omitas ninguna:

```
**Resumen:** <qué cambió y, si no es obvio, por qué — 1 a 3 frases>

**Mensaje de commit:**
<línea corta imperativa>

<cuerpo opcional, solo si hay un "por qué" no obvio>
```

## Activación proactiva

Esta skill corre SIEMPRE después de terminar cualquier modificación de
código en este repositorio — no es opcional ni depende de que el usuario la
pida con esas palabras exactas. Antes de decir que una tarea está lista,
corre el paso 1 sobre el diff resultante y entrega el formato del paso 4. Si
el diff terminó vacío (nada quedó modificado), no hace falta invocarla.
