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
- `src-tauri/tests/`: pruebas de integración que usan repositorios reales.
- `src/features/`: una carpeta por funcionalidad de la interfaz.
- `src/shared/`: componentes, utilidades y hooks compartidos.
- `src/i18n/`: textos de la interfaz por idioma.

## Notas de rendimiento

- Las listas largas (historial, cambios, ramas, líneas de diff y de blame) están virtualizadas.
- El grafo usa el orden topológico de git. Al activarlo por primera vez en un repositorio, la aplicación genera el archivo `commit-graph` de git si no existe, lo que acelera la consulta en repositorios grandes.
