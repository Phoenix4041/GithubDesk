# GithubDesk

Cliente de Git y GitHub de escritorio hecho con Tauri 2, React y TypeScript.

## Funciones

- Repositorios: clonar, abrir y crear, con lista de recientes y vigilancia de cambios en disco.
- Cambios: preparar por archivo, bloque o línea; commit, modificar el último commit y deshacer.
- Ramas: crear, cambiar, renombrar, eliminar y publicar; fetch, pull y push con ahead y behind.
- Historial: lista con búsqueda por mensaje, autor, texto que cambió, ruta y fechas; vista de grafo; historial de un archivo.
- Diferencias: vista unificada o dividida, con opción de ignorar espacios.
- Acciones sobre commits: cherry-pick, revert, reset suave, mixto y duro, crear rama o etiqueta, commit desacoplado.
- Etiquetas: crear (ligeras o anotadas), eliminar, subir y borrar en el remoto.
- Stash: guardar con archivos nuevos, ver contenido, aplicar, aplicar y eliminar, crear rama, eliminar.
- Comparar ramas: commits propios de cada lado, archivos cambiados y sus diferencias.
- Conflictos: editor de tres paneles, elección por bloque, archivos binarios y borrados.
- Rebase interactivo: reordenar, combinar, descartar, cambiar mensajes y detenerse para editar.
- Blame: autoría línea por línea, en el archivo actual o en un commit.
- Reflog: registro de HEAD, volver a un punto y deshacer la última operación.
- Subida segura con `--force-with-lease` cuando el historial se reescribe.
- Cuentas de GitHub: varias a la vez, con token personal o con el flujo de dispositivo de una OAuth App; cada repositorio elige su cuenta.
- Pull requests: lista, conversación, archivos con diff, comprobaciones, revisiones, combinar (merge, squash o rebase), cerrar, reabrir y traer la rama a tu equipo.
- Issues: lista con búsqueda y etiquetas, conversación, crear, comentar, cerrar con motivo y reabrir.
- Actions: ejecuciones con filtros, jobs y pasos, registro de cada job, volver a ejecutar, cancelar y lanzar un workflow a mano.
- Paleta de comandos (Ctrl+K) con todas las acciones y atajos de teclado que se pueden cambiar uno por uno.
- Terminal integrada abierta en la carpeta del repositorio, con una terminal real (PowerShell, Git Bash, cmd, bash o zsh).
- Worktrees: crear, abrir, bloquear y eliminar carpetas de trabajo adicionales del mismo repositorio.
- Submódulos: agregar, inicializar, actualizar y eliminar, con progreso y cancelación.
- Firma de commits con GPG o SSH, detección de claves, prueba de firma e insignia de firma válida en cada commit.
- Git LFS: activar en el repositorio, elegir qué tipos de archivo van a LFS, ver los archivos y descargarlos.
- Editor de .gitignore con plantillas, comprobación de rutas y opción de dejar de seguir archivos que ya se ignoran.
- Abrir el repositorio o un archivo en el editor externo (VS Code, Cursor, Sublime, Zed, Notepad++ u otro) y mostrarlo en el explorador de archivos.

## Conectar GitHub

Abre Ajustes y elige Agregar cuenta. Hay dos formas:

- Con un token: pega un token personal con los permisos `repo`, `workflow` y `read:org`. Funciona con github.com y con GitHub Enterprise (escribe la dirección del servidor).
- Con el navegador: crea una OAuth App en GitHub (Settings, Developer settings), activa el flujo de dispositivo y pega su Client ID en el diálogo. La aplicación muestra un código que se escribe en la página de GitHub.

Los tokens se guardan en el almacén de credenciales del sistema (Administrador de credenciales en Windows), nunca en archivos de la aplicación ni en el registro.

Las secciones Pull requests, Issues y Actions aparecen cuando algún remoto del repositorio apunta a GitHub o a un servidor para el que hay una cuenta conectada. Con el chip junto al nombre del repositorio se elige la cuenta que usa y, de forma opcional, si git (fetch, pull y push) usa también el token de esa cuenta en lugar de las credenciales guardadas del sistema.

## Atajos principales

Todos se pueden cambiar en Ajustes, Personalizar atajos, o desde la paleta de comandos.

| Atajo | Acción |
| --- | --- |
| Ctrl+K | Paleta de comandos |
| Ctrl+J | Mostrar u ocultar la terminal |
| Ctrl+1 a Ctrl+5 | Cambios, Historial, Pull requests, Issues y Actions |
| Ctrl+Shift+F, Ctrl+Shift+L, Ctrl+P | Fetch, pull y push |
| Ctrl+Shift+N | Crear una rama |
| Ctrl+Shift+S | Guardar los cambios en un stash |
| Ctrl+Shift+E | Abrir el repositorio en el editor externo |
| Ctrl+Shift+X | Mostrar el repositorio en el explorador |
| Ctrl+, | Ajustes |

## Requisitos

- Git instalado y disponible en el PATH
- Node.js 24 o superior y pnpm
- Rust estable (toolchain MSVC en Windows)
- Windows: Visual Studio Build Tools con la carga de trabajo de C++ y WebView2

## Comandos

```bash
pnpm install
pnpm tauri dev
```

```bash
pnpm typecheck
pnpm lint
pnpm test
```

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
```

```bash
pnpm tauri build
```

## Estructura

- `src-tauri/`: backend en Rust. Ejecuta el binario `git` del sistema y parsea salidas de formato estable.
- `src-tauri/src/commands/`: un módulo por área, todos asíncronos para no bloquear la ventana.
- `src-tauri/src/git/parse/`: parsers de la salida de git, con pruebas unitarias.
- `src-tauri/src/pty.rs`: sesiones de terminal con pseudoconsola real y eventos hacia la interfaz.
- `src-tauri/src/github/`: cliente de la API REST de GitHub (paginación, caché por ETag, errores tipados), cuentas, flujo de dispositivo, pull requests, issues y Actions.
- `src-tauri/tests/`: pruebas de integración que usan repositorios reales y un servidor HTTP local que imita a GitHub.
- `src/features/`: una carpeta por funcionalidad de la interfaz.
- `src/shared/`: componentes, utilidades y hooks compartidos.
- `src/i18n/`: textos de la interfaz por idioma.

## Notas de GitHub

- Todo va por la API REST. Las llamadas de lectura usan ETag, así que las respuestas sin cambios no gastan cuota.
- Las ejecuciones de Actions que están en curso se refrescan solas cada pocos segundos hasta que terminan.
- El registro de un job muestra como máximo los últimos 400 KB.
- Al lanzar un workflow a mano, el workflow necesita el disparador `workflow_dispatch`.

## Notas de la Fase 4

- La terminal usa ConPTY en Windows. xterm.js se carga solo la primera vez que se abre la terminal.
- Firma con GPG: la aplicación usa el `gpg` de tu PATH, el configurado en `gpg.program` o, en Windows, el que trae Git for Windows. Si la clave tiene contraseña, GPG necesita un programa de ingreso gráfico (pinentry), como el de Gpg4win.
- Firma con SSH: git necesita `ssh-keygen`. Para ver "Firma válida" en esta aplicación hace falta un archivo de firmantes permitidos; GitHub verifica las firmas SSH por su cuenta.
- Git LFS requiere tener instalado `git-lfs`. Activarlo en un repositorio solo cambia la configuración local de ese repositorio.
- Los submódulos con direcciones `file://` los bloquea git por seguridad desde la versión 2.38.1.
- Las secciones Worktrees, Submódulos y Git LFS se consultan solo cuando se abren en la barra lateral.

## Notas de rendimiento

- Las listas largas (historial, cambios, ramas, líneas de diff y de blame) están virtualizadas.
- El grafo usa el orden topológico de git. Al activarlo por primera vez en un repositorio, la aplicación genera el archivo `commit-graph` de git si no existe, lo que acelera la consulta en repositorios grandes.
