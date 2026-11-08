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
- Combinar una rama en la actual, con vista previa y tres modos (normal, sin avance rápido y squash); los conflictos pasan al editor de tres paneles.
- Rebase sobre otra rama, con la opción de conservar los merges, y reordenar los commits del rebase interactivo arrastrándolos.
- Resaltado de las palabras que cambiaron dentro de cada línea modificada.
- Estado de las comprobaciones de GitHub en cada commit y en la rama actual, junto al nombre del repositorio.
- Comentarios en línea en las pull requests: ver los hilos de cada línea del diff, responderlos y empezar uno nuevo, en vista unificada y dividida.
- Aviso de versión nueva y actualización dentro de la aplicación, apagados hasta que se indica el repositorio de versiones y la clave de firma.
- Parches: exportar commits con `git format-patch` y aplicar un `.patch` con vista previa, en modo normal o con `git am`.
- Bisect guiado: marcar commits buenos y malos hasta dar con el primero que rompió algo.
- Limpieza: archivos sin seguimiento, ramas ya combinadas o sin remoto y ramas remotas obsoletas, con vista previa y casillas.
- Perfiles: cada perfil junta una cuenta de GitHub, un contexto (personal u organización) y una identidad de Git; se cambia desde la barra, la pantalla de inicio o la paleta, y cada repositorio recuerda el suyo.
- Inicio de GitHub: repositorios del contexto activo para clonar con un clic, crear repositorios, publicar uno local y una bandeja de pull requests e issues que esperan tu respuesta.
- Pull requests e issues completos: revisores, etiquetas, asignados, hito, editar título y descripción, actualizar la rama y pasar a borrador o a lista.
- Ajustes del repositorio en GitHub: datos generales, colaboradores e invitaciones, equipos, ramas protegidas, webhooks, llaves de despliegue, secretos y variables de Actions, etiquetas, hitos, alertas de seguridad en lectura y zona de peligro con confirmación escrita.
- Releases: crear con notas generadas por GitHub, editar, borrar y subir archivos adjuntos.
- Cuenta de GitHub: perfil público, llaves SSH, de firma y GPG, correos y permisos del token, con un botón para pedir permisos que falten.
- Organizaciones: miembros, invitaciones, equipos, colaboradores externos y secretos, para quien es propietario.
- Notificaciones de GitHub con bandeja, marcar como leídas y avisos del sistema (apagados por defecto).
- Registro local de errores con los secretos ya quitados, y un comando en la paleta para abrir su carpeta.

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

## Instalar

El instalador de Windows (`GithubDesk_0.6.0_x64-setup.exe`) instala solo para tu usuario, sin permisos de administrador, y se ofrece en español e inglés. Para generarlo:

```bash
pnpm tauri build --bundles nsis
```

El instalador queda en `src-tauri/target/release/bundle/nsis/`. Si el equipo no tiene WebView2, el instalador lo descarga. Para instalar y desinstalar sin ventanas: `GithubDesk_0.6.0_x64-setup.exe /S` y `uninstall.exe /S` dentro de la carpeta de instalación.

Los instaladores no están firmados con un certificado de firma de código. Windows (SmartScreen) y macOS (Gatekeeper) van a mostrar un aviso la primera vez; en Windows se pulsa Más información y Ejecutar de todas formas, y en macOS se abre con clic derecho y Abrir.

## Plataformas

| Sistema | Estado | Motor web mínimo |
| --- | --- | --- |
| Windows 10 y 11 | Probado a mano en cada fase | WebView2 111 o superior (se actualiza solo) |
| Linux | Compila, pasa todas las pruebas y arranca en Ubuntu 26.04 (WSL2) | WebKitGTK 2.40 o superior |
| macOS | Preparado, sin probar en un equipo real | macOS 13.3 o superior (Safari 16.4) |

- El almacén de credenciales es el de cada sistema: Administrador de credenciales en Windows, Llavero en macOS y el servicio de secretos (GNOME Keyring o KWallet) en Linux. Sin servicio de secretos en Linux, el token solo dura la sesión.
- En Linux hacen falta estos paquetes para compilar: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libsoup-3.0-dev`, `libdbus-1-dev` y `libssl-dev`.
- Los atajos usan Cmd en macOS y Ctrl en el resto. Las rutas de los editores externos se buscan en el PATH y en las carpetas habituales de cada sistema.
- Las aplicaciones abiertas desde el Finder o el menú de Linux reciben un PATH corto; la aplicación agrega `/opt/homebrew/bin` y `/usr/local/bin` para encontrar `git`.

## Requisitos

- Git instalado y disponible en el PATH
- Node.js 24 o superior y pnpm
- Rust estable 1.90 o superior (toolchain MSVC en Windows)
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

Hay un recorrido de humo para Windows que abre un repositorio en la aplicación en marcha, pasa por las pestañas, abre y cierra la paleta y revisa que no haya errores de script. La aplicación debe arrancar con la depuración remota de WebView2:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
.\src-tauri\target\release\githubdesk.exe
```

```bash
pnpm smoke C:/ruta/al/repositorio
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

## Notas de la Fase 5

- Calidad: hay pruebas de componentes (diálogos, menús, paleta, avisos, campos, worktrees, hilos de comentarios) con Testing Library y los comandos de Tauri simulados, y una prueba que calcula el contraste de todos los pares de colores del tema claro y oscuro contra WCAG AA (4,5 a 1). Los diálogos atrapan el foco, se cierran con Escape y devuelven el foco a quien los abrió.
- Seguridad: la ventana solo puede abrir enlaces `https://` y los de `localhost`, elegir carpetas y escuchar eventos. Los tokens no aparecen en los mensajes de depuración. `cargo audit` no encuentra vulnerabilidades (solo avisos de paquetes sin mantenimiento que trae Tauri en Linux) y `pnpm audit --prod` no encuentra nada; la única alerta de `pnpm audit` es de `minimatch` dentro de eslint, una herramienta de desarrollo que no viaja en la aplicación.
- Registro de errores: `errors.log` en la carpeta `logs` del directorio de datos de la aplicación, con una línea por error (hora UTC, origen, tipo y detalle). Se quitan tokens de GitHub, credenciales dentro de direcciones, cabeceras de autorización y parámetros secretos. Rota a `errors.1.log` al llegar a 1 MB. También guarda los pánicos del backend y los errores de pantalla. Nada sale del equipo.
- Rendimiento medido con la versión release: unos 111 MB en la pantalla de bienvenida, unos 144 MB con un repositorio abierto, unos 158 MB con el historial de un repositorio de 100000 commits recorrido por 25 páginas y unos 158 a 162 MB con las pestañas de pull requests y Actions abiertas. Abrir el repositorio de 100000 commits y dibujar la interfaz tarda unos 1,3 s, contando la recarga completa de la ventana de la prueba, y al pasar a Historial las primeras filas aparecen en menos de 40 ms. De esa memoria, el montón de JavaScript de la aplicación son unos 8 MB y el proceso de Rust unos 5 MB; el resto es el motor web del sistema.
- Aviso de versión nueva: está apagado. Para activarlo, escribe `Some("dueno/repositorio")` en `UPDATE_REPOSITORY` de `src-tauri/src/update_check.rs`. Consulta la última versión publicada una vez al día y también con el comando Buscar versiones nuevas de la paleta. La actualización dentro de la aplicación se explica en las notas de la Fase 6.
- Integración continua: `.github/workflows/ci.yml` prueba en Windows, macOS y Linux, y `.github/workflows/release.yml` genera los instaladores al subir una etiqueta `v*` y los deja en un borrador de release. Ninguno de los dos se pudo ejecutar fuera de GitHub; la sintaxis está validada y los mismos comandos se ejecutaron en Windows y en Linux.
- `CHANGELOG.md` se genera con `node scripts/changelog.mjs <versión> [desde-etiqueta]` a partir de los commits convencionales.

## Notas de la Fase 6

- Permisos: el token pide al principio `repo`, `workflow` y `read:org`. Las funciones que necesitan más (`admin:org`, `admin:public_key`, `admin:gpg_key`, `delete_repo`, `notifications`, `user:email`) muestran un botón Dar permiso que repite el flujo de dispositivo con los permisos actuales más el nuevo. Con un token personal, la aplicación abre la página de GitHub con los permisos ya marcados.
- Tokens: la API de GitHub no deja crear, listar ni revocar tokens personales. La aplicación muestra los permisos y el vencimiento de cada token, pide permisos extra y quita la cuenta y su token del almacén de credenciales; revocarlo en GitHub se hace en su página de tokens.
- Perfiles: un perfil guarda cuenta, contexto e identidad (nombre, correo y llave de firma opcional) en los ajustes locales, sin secretos. Al elegir un perfil para un repositorio se escribe `user.name`, `user.email` y la firma en la configuración local de ese repositorio, y la aplicación avisa cuando el correo de los commits no coincide con el del perfil.
- Acciones destructivas (borrar o transferir un repositorio, quitar miembros, borrar secretos, webhooks o llaves) piden escribir el nombre para confirmar.
- Administración: la de organización exige ser propietario y los ajustes de un repositorio exigen ser administrador; si no lo eres, se muestran en solo lectura. Los secretos de Actions se cifran en la aplicación con una caja sellada compatible con libsodium antes de enviarlos; GitHub nunca devuelve el valor.
- GraphQL se usa solo para pasar una pull request a borrador o a lista; todo lo demás es REST. Las subidas de archivos de un release se leen en memoria, hasta 256 MB por archivo.
- Notificaciones: se consultan cada dos minutos como mucho mientras la aplicación está abierta y solo si el aviso de escritorio está activado en Ajustes. La primera consulta no avisa de lo que ya estaba pendiente.
- Fuera de alcance: Discussions, Projects v2, facturación, SAML y SSO, rulesets, Pages, entornos de despliegue, Codespaces, Packages, Gists y escaneo de código.
- Actualización dentro de la aplicación: está configurada para `Phoenix4041/GithubDesk`, que debe ser público para que la aplicación pueda leer los releases. La clave pública está en `src-tauri/tauri.conf.json`. Para publicar una versión:
  1. Guarda el contenido de `~/.tauri/githubdesk.key` como secreto del repositorio con el nombre `TAURI_SIGNING_PRIVATE_KEY`. La clave no tiene contraseña, así que `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` puede quedar vacío.
  2. Sube la versión en `tauri.conf.json`, `Cargo.toml` y `package.json`, y sube una etiqueta `v*`.
  3. `release.yml` firma los instaladores y publica `latest.json` en un borrador. Publica el borrador: mientras sea borrador, las aplicaciones instaladas no lo ven.
  La aplicación comprueba a los 8 segundos de abrir, como mucho una vez al día, y también con el comando Buscar versiones nuevas de la paleta. Ofrece Instalar y reiniciar. La firma se comprueba con una clave de usar y tirar en las pruebas de integración (`src-tauri/tests/self_update.rs`); no se probó una actualización completa contra un repositorio real de GitHub.
- Firma de los instaladores: Windows necesita un certificado de firma de código (por ejemplo de Azure Trusted Signing o de una autoridad como DigiCert) y se configura en `bundle.windows` con `certificateThumbprint` o `signCommand`; macOS necesita una cuenta de Apple Developer y los secretos `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` y `APPLE_TEAM_ID`, que `tauri-action` lee del entorno. Sin ellos los instaladores siguen sin firmar.

## Notas de la Fase 8

- Inicio: al no haber repositorio abierto se muestra un panel con saludo, acciones rápidas, repositorios recientes con su estado, pull requests por revisar, CI roto, issues asignados y menciones.
- Paleta: con `Ctrl+K` escribe para saltar a repositorios, ramas, pull requests, issues y archivos, con prioridad a lo reciente.
- Secretos: antes de confirmar se revisan las líneas agregadas en staging. Se puede sacar el archivo del staging, agregarlo a `.gitignore` o commitear igual. Una línea con `secretscan:ignore` se omite.
- Deshacer: ahora cubre también el cambio de rama, muestra una vista previa y se niega si hay cambios sin guardar, salvo que se guarden antes en un stash.
- Reflog: línea de tiempo de HEAD y de cada rama con filtros por fecha, y recuperación de un commit creando una rama nueva.
