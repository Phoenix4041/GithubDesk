# GithubDesk

Cliente de Git y GitHub de escritorio hecho con Tauri 2, React y TypeScript.

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
- `src/features/`: una carpeta por funcionalidad de la interfaz.
- `src/shared/`: componentes, utilidades y hooks compartidos.
- `src/i18n/`: textos de la interfaz por idioma.
