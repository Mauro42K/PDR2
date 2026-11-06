/** Transitional API compatibility: codes remain stable while legacy Spanish messages remain available. */
export const apiErrorMessages = {
  invalid_project_name: [
    'El nombre del proyecto debe tener entre 1 y 160 caracteres.',
    'Project name must be between 1 and 160 characters.',
  ],
  invalid_project_state: ['El estado del proyecto no es válido.', 'The project state is invalid.'],
  dependency_cycle: ['La dependencia crearía un ciclo.', 'The dependency would create a cycle.'],
  notes_too_long: [
    'Las notas no pueden superar 10 000 caracteres.',
    'Notes cannot exceed 10,000 characters.',
  ],
  invalid_task_dates: [
    'Revisa el nombre y las fechas de la tarea.',
    'Check the task name and dates.',
  ],
  invalid_task_status: ['El estado de una tarea no es válido.', 'A task status is invalid.'],
  invalid_task_progress: [
    'El progreso de una tarea debe ser un número entero entre 0 y 100.',
    'Task progress must be an integer between 0 and 100.',
  ],
  missing_task_fields: [
    'Faltan datos de la tarea en el archivo.',
    'Task data is missing from the file.',
  ],
  invalid_milestone_dates: [
    'Un hito debe tener la misma fecha de inicio y fin.',
    'A milestone must have the same start and end date.',
  ],
  invalid_dependency_selection: [
    'Selecciona dos tareas distintas para crear una dependencia.',
    'Select two different tasks to create a dependency.',
  ],
  tasks_not_in_project: [
    'Ambas tareas deben pertenecer al proyecto abierto.',
    'Both tasks must belong to the open project.',
  ],
  duplicate_dependency: ['Esta dependencia ya existe.', 'This dependency already exists.'],
  task_not_in_project: [
    'Una de las tareas no pertenece al proyecto.',
    'One of the tasks does not belong to the project.',
  ],
  invalid_file: ['El archivo no es válido.', 'The file is invalid.'],
  invalid_import_mode: [
    'Indica si deseas importar como copia o reemplazar.',
    'Choose whether to import as a copy or replace a project.',
  ],
  missing_import_target: [
    'Selecciona el proyecto que se reemplazará.',
    'Select the project to replace.',
  ],
  invalid_file_task: [
    'El archivo contiene una tarea inválida.',
    'The file contains an invalid task.',
  ],
  invalid_task_number: [
    'El número de tarea debe ser un entero mayor que cero.',
    'The task number must be an integer greater than zero.',
  ],
  incomplete_project: [
    'El proyecto tiene campos incompletos.',
    'The project has incomplete fields.',
  ],
  invalid_project_id: [
    'El identificador del proyecto no es válido.',
    'The project identifier is invalid.',
  ],
  duplicate_task_number: [
    'El archivo repite el número de una tarea.',
    'The file contains a duplicate task number.',
  ],
  invalid_group: ['El archivo contiene un grupo inválido.', 'The file contains an invalid group.'],
  invalid_group_note: ['La nota de un grupo no es válida.', 'A group note is invalid.'],
  invalid_group_color: ['El color de un grupo no es válido.', 'A group color is invalid.'],
  missing_task_group: [
    'La tarea hace referencia a un grupo inexistente.',
    'A task references a group that does not exist.',
  ],
  invalid_task_note: ['La nota de una tarea no es válida.', 'A task note is invalid.'],
  invalid_file_dependency: [
    'El archivo contiene una dependencia inválida.',
    'The file contains an invalid dependency.',
  ],
  file_dependency_cycle: [
    'El archivo contiene un ciclo de dependencias.',
    'The file contains a dependency cycle.',
  ],
  invalid_file_project: [
    'El archivo no contiene un proyecto válido.',
    'The file does not contain a valid project.',
  ],
  unsupported_file: [
    'Formato o versión de archivo no compatibles.',
    'The file format or version is not supported.',
  ],
  invalid_request: ['La solicitud no es válida.', 'The request is invalid.'],
  not_found: ['No se encontró el recurso.', 'The requested resource was not found.'],
  dependency_conflict: [
    'El cambio entra en conflicto con una dependencia.',
    'The change conflicts with a dependency.',
  ],
} as const;

export type ApiErrorCode = keyof typeof apiErrorMessages;

export class DomainValidationError extends Error {
  constructor(readonly code: ApiErrorCode) {
    super(apiErrorMessages[code][0]);
    this.name = 'DomainValidationError';
  }
}
