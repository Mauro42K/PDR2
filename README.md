# PDR 2.0 · entorno local

PDR 2.0 es una aplicación local para planificar proyectos con tareas, fechas, dependencias y cronograma Gantt. La aplicación no requiere inicio de sesión. PostgreSQL se conserva en Docker Compose y solo escucha en `127.0.0.1:55432`; la interfaz y API de Fastify se sirven desde la Mac en el puerto `3001` para permitir el acceso desde una tablet de la misma red confiable.

## Preparar o iniciar

Se requiere macOS, Docker Desktop y Node `24.22.1` desde el SSD compartido indicado por `scripts/pdr2-node`. El archivo `.env` contiene la contraseña local y no debe compartirse.

```sh
docker compose up -d db
./scripts/pdr2-node npm ci
./scripts/pdr2-node npm run db:migrate
./scripts/pdr2-node npm run build
./scripts/pdr2-node npm start
```

Abre `http://localhost:3001` en la Mac. Para obtener la dirección de la Mac en la red Wi-Fi, usa `ipconfig getifaddr en0`; desde la tablet abre `http://<dirección-de-la-Mac>:3001`. Conecta ambos equipos a la misma red local confiable. No publiques el puerto de la aplicación ni el de PostgreSQL en el router. La preparación inicial descarga dependencias e imagen de PostgreSQL; una vez preparada, la app y sus recursos se sirven localmente sin internet.

Detén la aplicación con `Ctrl+C`. Detén PostgreSQL con `docker compose stop db`; el volumen persiste. No ejecutes `docker compose down -v` ni elimines el volumen para reiniciar la app.

## Desarrollo y pruebas

```sh
./scripts/pdr2-node npm run dev       # migra la base y abre API :3001 y Vite :5173
./scripts/pdr2-node npm run typecheck
./scripts/pdr2-node npm test          # migra y usa solo pdr2_test
./scripts/pdr2-node npm run test:e2e  # navegador y datos aislados en pdr2_test
```

Para desarrollo, Vite hace proxy de `/api` a Fastify. La aplicación compilada se sirve en un mismo origen desde Fastify.

## Alcance del MVP

- Varios proyectos locales y uno abierto a la vez; tareas con nombre, inicio y fin, y duración en días calendario.
- Dependencias fin a inicio. Si una edición crea conflicto de fechas, se solicita aceptar o rechazar; aceptar mueve la sucesora al día siguiente del fin más tardío de sus predecesoras y conserva su duración. Rechazar no cambia nada. Los ciclos de dependencias se rechazan.
- Guardado automático en PostgreSQL y archivos JSON versionados por proyecto, importables como copia o reemplazo confirmado.
- Español predeterminado e inglés seleccionable desde Ajustes.
- La interfaz usa tabla y Gantt juntos, editables con mouse y tacto. Login, colaboración y compatibilidad con archivos `.pdr` anteriores quedan fuera del MVP.

## Documentación

El estado del proyecto vive en Notion (PDR 2.0 → Inicio y la base Trabajo). Las especificaciones están en `02-DOCS/wiki/specifications/` y la evidencia de QA en `02-DOCS/attachments/evidencia/`. Para retomar el trabajo en un chat nuevo, ver `docs/handoff.md`.
