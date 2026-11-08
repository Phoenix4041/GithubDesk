# Notas técnicas

Notas de diseño, límites conocidos y decisiones de cada fase de desarrollo. Los cambios por versión están en [CHANGELOG.md](../CHANGELOG.md).

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
  2. Sube la versión con `pnpm bump 0.6.1` (cambia `package.json`, `tauri.conf.json` y `Cargo.toml`), ejecuta `cargo check` dentro de `src-tauri` para refrescar `Cargo.lock`, haz el commit y sube una etiqueta `v0.6.1`.
  3. `release.yml` firma los instaladores y publica `latest.json` en un borrador. Publica el borrador: mientras sea borrador, las aplicaciones instaladas no lo ven.
  La aplicación comprueba a los 8 segundos de abrir, como mucho una vez al día, y también con el comando Buscar versiones nuevas de la paleta. Ofrece Instalar y reiniciar. La firma se comprueba con una clave de usar y tirar en las pruebas de integración (`src-tauri/tests/self_update.rs`); no se probó una actualización completa contra un repositorio real de GitHub.
- Firma de los instaladores: Windows necesita un certificado de firma de código (por ejemplo de Azure Trusted Signing o de una autoridad como DigiCert) y se configura en `bundle.windows` con `certificateThumbprint` o `signCommand`; macOS necesita una cuenta de Apple Developer y los secretos `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` y `APPLE_TEAM_ID`, que `tauri-action` lee del entorno. Sin ellos los instaladores siguen sin firmar.

## Notas de la Fase 8

- Inicio: al no haber repositorio abierto se muestra un panel con saludo, acciones rápidas, repositorios recientes con su estado, pull requests por revisar, CI roto, issues asignados y menciones.
- Paleta: con `Ctrl+K` escribe para saltar a repositorios, ramas, pull requests, issues y archivos, con prioridad a lo reciente.
- Secretos: antes de confirmar se revisan las líneas agregadas en staging. Se puede sacar el archivo del staging, agregarlo a `.gitignore` o commitear igual. Una línea con `secretscan:ignore` se omite.
- Deshacer: ahora cubre también el cambio de rama, muestra una vista previa y se niega si hay cambios sin guardar, salvo que se guarden antes en un stash.
- Reflog: línea de tiempo de HEAD y de cada rama con filtros por fecha, y recuperación de un commit creando una rama nueva.

## Notas de la Fase 7

- Rescate: las copias viven como referencias `refs/githubdesk/rescue/*` del propio repositorio (no tocan el stash), se conservan 30 días o las últimas 50 y se aplican sin borrar nada; si chocan con lo que tienes, avisa y deja una copia previa.
- Guardia previa al commit: revisa solo lo preparado y solo las líneas agregadas. Es una red de seguridad por patrones: no detecta todos los secretos y puede equivocarse. Un secreto ya subido hay que cambiarlo aunque se borre del historial.
- Predictor de conflictos: usa `git merge-tree --write-tree` (git 2.38 o superior); con un git anterior la función se oculta.
- Absorber, dividir y reajustar pilas solo reescriben commits que no están en ningún remoto, guardan antes una copia en Rescate y se detienen ante conflictos con el aviso de operación en curso. La división es por archivo, no por línea.
- Iniciar sesión con el administrador de credenciales o GitHub CLI trae los permisos que ese programa pidió (por ejemplo `repo`, `gist` y `workflow`): para administrar organizaciones, llaves o borrar repositorios hace falta el código de dispositivo con un Client ID o un token con más permisos. Una compilación puede embeber un Client ID con la variable `GITHUBDESK_OAUTH_CLIENT_ID` al compilar.
- Enlaces del sistema: solo se aceptan direcciones `https://` sin usuario ni contraseña, y un nombre de rama que empiece con guion se descarta.
- Bandeja, inicio automático, instancia única y la entrada del Explorador se pueden comprobar solo en Windows y a mano.
- Fuera de alcance: resaltado de líneas movidas en el diff, funciones con IA o en la nube, Discussions, Projects v2, Gists y facturación.
