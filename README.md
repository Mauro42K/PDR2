# PDR 2.0 · Project Trace

A local, single-user schedule planner for projects made of tasks, dependencies, milestones and groups. It runs in your browser against a PostgreSQL database on your own machine.

**Language / Idioma:** [English](#english) · [Español](#español)

---

## English

### What it does

PDR 2.0 helps you plan and follow a project as a timeline:

- **Projects.** Create, open, rename and delete projects, with several saved at once. Deleting asks for confirmation in two steps.
- **Tasks and the timeline.** Each task has a start date, an end date and a duration in calendar days. Drag and resize bars in an editable Gantt chart.
- **Dependencies.** Finish-to-start links between tasks. Links that would create a cycle are rejected, and conflicts are shown so you can accept or reject them.
- **Progress.** Status (pending, in progress, blocked, completed), progress from 0 to 100 %, and milestones shown as ◆.
- **Groups and notes.** Create, rename, colour, collapse and delete groups. Add notes to tasks and groups.
- **Ordering.** Move a task up or down within its group or within "No group", without changing task numbers or predecessors.
- **Undo and redo** for planning changes.
- **Three views:** Planning, Tracking (calendar alerts such as overdue, due soon and late start) and Summary (group progress bars).
- **Zoom, fit-to-project and density** controls.
- **Themes:** light, dark or system. **Languages:** Spanish by default, English in Settings. Keyboard shortcuts are listed in a dialog.
- **Import and export** of JSON files, as a copy or as a replacement. The importer reads the current format (v3) and the earlier v1 and v2 formats.
- **Automatic saving** to PostgreSQL.

### Status and limitations

PDR 2.0 is a release candidate for version 1.0. The project follows a documented roadmap: see [`02-DOCS/wiki/roadmap.md`](02-DOCS/wiki/roadmap.md) and the functional scope in [`02-DOCS/wiki/alcance-funcional.md`](02-DOCS/wiki/alcance-funcional.md).

Not included yet:

- Subtasks, baselines and nested work breakdown.
- Export to PNG, PDF or CSV, duplicate project, saved filters.
- User accounts, sign-in, private projects, or real-time collaboration.
- Web deployment. The application is designed for a local network and has no authentication.
- Touch editing of the timeline is being validated on tablets; mouse and keyboard are the reference.

### Requirements

- **Node.js 24.22.1** (see [`.nvmrc`](.nvmrc)) and npm.
- **PostgreSQL 18**, reachable from your machine. By default the application connects to `127.0.0.1:55432`, database `pdr2_dev`, user `pdr2`. You can change this with the `DATABASE_URL` variable.

### Setup

1. Clone the repository and install the dependencies:

   ```bash
   npm install
   ```

2. Create the database user and the database in your PostgreSQL server. Replace the password with your own:

   ```sql
   CREATE USER pdr2 WITH PASSWORD 'choose-a-local-password';
   CREATE DATABASE pdr2_dev OWNER pdr2;
   ```

3. Copy the environment template and set the same password:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set `PDR2_POSTGRES_PASSWORD`. The `.env` file is ignored by Git and must never be committed.

4. Start the application. This applies the database migrations and starts the API and the web interface:

   ```bash
   npm run dev
   ```

   Open <http://127.0.0.1:5173>. The API listens on <http://127.0.0.1:3001>.

To run the built version instead:

```bash
npm run build
npm start
```

Then open <http://127.0.0.1:3001>.

### Testing

```bash
npm run test:unit   # unit tests, no database needed
npm run typecheck   # TypeScript checks
npm test            # unit and integration tests against the test database
```

`npm test` only runs against the database `pdr2_test` on `127.0.0.1:55432`, set with `PDR2_TEST_DATABASE_URL`. It refuses any other target, so your work database is never touched.

### Your data

- Data stays in your PostgreSQL database. Nothing is sent to external services.
- Use **Export JSON** to keep a copy of a project.
- `npm run copia:base` makes a copy of the work database and stores it outside the repository, by default in `../PDR2-backups`. This command runs `pg_dump` inside a Docker container; set `PDR2_CONTENEDOR_BD` to the name of your container (default `pdr2-db-1`). Without Docker, use your own `pg_dump` backup routine.

### Contributing

Issues and pull requests are welcome. Before opening a pull request, run `npm run typecheck` and `npm test`. The project's working rules are in [`02-DOCS/wiki/sdd/constitution.md`](02-DOCS/wiki/sdd/constitution.md) and [`REVIEW.md`](REVIEW.md).

### License

Released under the [MIT License](LICENSE). Copyright (c) 2026 Mauricio Sepulveda.

---

## Español

### Qué hace

PDR 2.0 ayuda a planificar y seguir un proyecto como cronograma:

- **Proyectos.** Crear, abrir, renombrar y eliminar proyectos, con varios guardados a la vez. Eliminar pide confirmación en dos pasos.
- **Tareas y cronograma.** Cada tarea tiene fecha de inicio, fecha de fin y duración en días calendario. Puedes mover y ajustar las barras en un diagrama de Gantt editable.
- **Dependencias.** Enlaces fin a inicio entre tareas. Un enlace que crearía un ciclo se rechaza, y los conflictos se muestran para aceptarlos o rechazarlos.
- **Avance.** Estado (pendiente, en curso, bloqueada, completada), avance de 0 a 100 % e hitos, que se muestran con ◆.
- **Grupos y notas.** Crear, renombrar, colorear, plegar y eliminar grupos. Añadir notas a tareas y grupos.
- **Orden.** Subir o bajar una tarea dentro de su grupo o dentro de «Sin grupo», sin cambiar sus números ni sus predecesoras.
- **Deshacer y rehacer** los cambios de planificación.
- **Tres vistas:** Planificación, Seguimiento (alertas de calendario como atrasada, vence pronto e inicio atrasado) y Resumen (barras de avance por grupo).
- **Zoom, ajuste al proyecto y densidad.**
- **Temas:** claro, oscuro o del sistema. **Idiomas:** español por defecto, inglés en Ajustes. Los atajos de teclado aparecen en un diálogo.
- **Importar y exportar** archivos JSON, como copia o como reemplazo. El importador lee el formato actual (v3) y los anteriores v1 y v2.
- **Guardado automático** en PostgreSQL.

### Estado y limitaciones

PDR 2.0 es un candidato a la versión 1.0. El proyecto sigue una hoja de ruta documentada: ver [`02-DOCS/wiki/roadmap.md`](02-DOCS/wiki/roadmap.md) y el alcance funcional en [`02-DOCS/wiki/alcance-funcional.md`](02-DOCS/wiki/alcance-funcional.md).

Todavía no incluye:

- Subtareas, líneas base y desglose anidado de trabajo.
- Exportar a PNG, PDF o CSV, duplicar proyecto y filtros guardados.
- Cuentas de usuario, inicio de sesión, proyectos privados ni colaboración en tiempo real.
- Despliegue web. La aplicación está pensada para una red local y no tiene autenticación.
- La edición táctil del cronograma se está validando en tabletas; la referencia es el ratón y el teclado.

### Requisitos

- **Node.js 24.22.1** (ver [`.nvmrc`](.nvmrc)) y npm.
- **PostgreSQL 18** accesible desde tu equipo. Por defecto la aplicación se conecta a `127.0.0.1:55432`, base `pdr2_dev`, usuario `pdr2`. Puedes cambiarlo con la variable `DATABASE_URL`.

### Instalación

1. Clona el repositorio e instala las dependencias:

   ```bash
   npm install
   ```

2. Crea el usuario y la base de datos en tu servidor PostgreSQL. Sustituye la contraseña por una propia:

   ```sql
   CREATE USER pdr2 WITH PASSWORD 'elige-una-contraseña-local';
   CREATE DATABASE pdr2_dev OWNER pdr2;
   ```

3. Copia la plantilla de variables de entorno y define la misma contraseña:

   ```bash
   cp .env.example .env
   ```

   Edita `.env` y define `PDR2_POSTGRES_PASSWORD`. El archivo `.env` está ignorado por Git y nunca debe subirse al repositorio.

4. Arranca la aplicación. Esto aplica las migraciones de la base de datos y levanta la API y la interfaz web:

   ```bash
   npm run dev
   ```

   Abre <http://127.0.0.1:5173>. La API escucha en <http://127.0.0.1:3001>.

Para ejecutar la versión compilada:

```bash
npm run build
npm start
```

Después abre <http://127.0.0.1:3001>.

### Pruebas

```bash
npm run test:unit   # pruebas unitarias, sin base de datos
npm run typecheck   # comprobación de tipos de TypeScript
npm test            # pruebas unitarias e integración contra la base de pruebas
```

`npm test` solo se ejecuta contra la base `pdr2_test` en `127.0.0.1:55432`, definida con `PDR2_TEST_DATABASE_URL`. Rechaza cualquier otro destino, así que tu base de trabajo nunca se toca.

### Tus datos

- Los datos se quedan en tu base PostgreSQL. No se envía nada a servicios externos.
- Usa **Exportar JSON** para guardar una copia de un proyecto.
- `npm run copia:base` crea una copia de la base de trabajo y la guarda fuera del repositorio, por defecto en `../PDR2-backups`. Este comando ejecuta `pg_dump` dentro de un contenedor de Docker; define `PDR2_CONTENEDOR_BD` con el nombre de tu contenedor (por defecto `pdr2-db-1`). Sin Docker, usa tu propio método de copia con `pg_dump`.

### Contribuir

Las incidencias y las propuestas de cambio (pull requests) son bienvenidas. Antes de abrir una propuesta, ejecuta `npm run typecheck` y `npm test`. Las reglas de trabajo del proyecto están en [`02-DOCS/wiki/sdd/constitution.md`](02-DOCS/wiki/sdd/constitution.md) y en [`REVIEW.md`](REVIEW.md).

### Licencia

Publicado bajo la [licencia MIT](LICENSE). Copyright (c) 2026 Mauricio Sepulveda.
