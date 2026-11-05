# Contributing to PDR 2.0

Thanks for your interest. The project is a local, single-user planner, so changes should keep it simple and local-first.

## Before you open a pull request

1. Use Node.js 24.22.1 (see [`.nvmrc`](.nvmrc)) and install the dependencies with `npm install`.
2. Run the checks:
   ```bash
   npm run typecheck
   npm test
   ```
   `npm test` needs a PostgreSQL 18 database named `pdr2_test` on `127.0.0.1:55432`, set with `PDR2_TEST_DATABASE_URL`. It refuses any other target, so your working database is never touched.
3. Keep each pull request focused on one change, and add or update tests for it.
4. Update the README when user-visible behaviour changes, in both English and Spanish.
5. Never commit `.env`, database dumps, backups, or personal data. Check your staged changes for secrets before pushing, for example with `gitleaks protect --staged`.

## Commit messages

Short, in the imperative, starting with a gitmoji, as in the existing history. English or Spanish are both fine.

## Reporting a bug

Open an issue with the steps to reproduce, what you expected, what happened, the commit hash you ran, and your browser and operating system.

---

# Contribuir a PDR 2.0

Gracias por tu interés. El proyecto es un planificador local de un solo usuario, así que los cambios deben mantenerlo simple y local.

## Antes de abrir una propuesta de cambio

1. Usa Node.js 24.22.1 (ver [`.nvmrc`](.nvmrc)) e instala las dependencias con `npm install`.
2. Ejecuta las comprobaciones:
   ```bash
   npm run typecheck
   npm test
   ```
   `npm test` necesita una base PostgreSQL 18 llamada `pdr2_test` en `127.0.0.1:55432`, definida con `PDR2_TEST_DATABASE_URL`. Rechaza cualquier otro destino, así que tu base de trabajo nunca se toca.
3. Mantén cada propuesta centrada en un solo cambio y añade o actualiza sus pruebas.
4. Actualiza el README cuando cambie algo que el usuario ve, en inglés y en español.
5. Nunca subas `.env`, volcados de base de datos, copias de seguridad ni datos personales. Revisa los cambios preparados por si contienen secretos antes de subirlos, por ejemplo con `gitleaks protect --staged`.

## Mensajes de commit

Breves, en imperativo y empezando por un gitmoji, como en el historial existente. Son válidos el inglés y el español.

## Reportar un error

Abre una incidencia con los pasos para reproducirlo, lo que esperabas, lo que ocurrió, el hash del commit que ejecutaste y tu navegador y sistema operativo.
