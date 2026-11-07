# Cambios

Todos los cambios importantes de GithubDesk. Este archivo se genera a partir de los commits con `node scripts/changelog.mjs <version> [desde-etiqueta]`.

## 0.5.0 - 2026-11-07

### Novedades

- **git**: add runner, typed errors and output parsers (d37188d)
- **commands**: add repository, changes, commit, branch, remote and history commands (0d862d3)
- **ui**: add design tokens, shared components and translations (5f22818)
- **repositories**: add repository list, open, create and clone flows (edbb72f)
- **changes**: add change list, line staging, diff viewer and commit box (3155e0d)
- **history**: add paginated commit history and commit details (e034224)
- **branches**: add branch list and create, rename and delete dialogs (d15f042)
- **sync**: add fetch, pull, push and publish with progress (6ae2135)
- **app**: add workspace layout with sidebar, tabs and diff panel (1a72f35)
- **diff**: add split view and ignore whitespace option (2113f8e)
- **operation**: detect merge, cherry-pick, revert and rebase in progress with continue, skip and abort (a14e2d2)
- **commits**: add cherry-pick, revert, reset, detached checkout, tags and safe force push (e370eb9)
- **stash**: add stash list, save, apply, pop, drop, branch and file preview (c142f3c)
- **history**: add search filters, file history and commit graph view (1e78e27)
- **compare**: add branch comparison with commits, files and diff (e26c679)
- **conflicts**: add three pane conflict editor with per-block choices (0eb09e4)
- **rebase**: add interactive rebase with reorder, squash, fixup, reword, edit and drop (7cb6399)
- **history**: add blame view, reflog browser and safe undo of the last operation (010e25e)
- **github**: add authenticated http client with paging, etag cache and typed errors (d23c1f5)
- **github**: add accounts with device flow, personal tokens and keyring storage (460f11d)
- **github**: detect github remotes, choose an account per repository and use it for git (805aa8d)
- **github**: add pull requests with list, details, files, reviews, merge and local checkout (a41bf51)
- **github**: add issues with search, labels, comments and state changes (02adb4d)
- **github**: add actions with runs, jobs, logs, re-run, cancel and workflow dispatch (5533fdd)
- **commands**: add command palette and configurable keyboard shortcuts (eb10e54)
- **terminal**: add integrated terminal with a real pty in the repository folder (bc2dc6f)
- **worktrees**: add worktrees and submodules management in the sidebar (9614e12)
- **signing**: add commit signing with gpg and ssh, key discovery and signature badges (d9a8969)
- **lfs**: add git lfs panel with tracking, file listing and downloads (bfc829b)
- **gitignore**: add gitignore editor with templates, external editor and file manager actions (116f4a3)
- **merge**: add manual branch merge with preview, modes and conflict handoff (245e6b8)
- **rebase**: add rebase onto another branch with optional merge preservation (5e280d0)
- **diff**: highlight changed words inside modified lines (1a3d64e)
- **rebase**: reorder commits by dragging with pointer and keyboard support (8bf0248)
- **github**: show check status of commits and of the current branch (5c70c49)
- **github**: add inline review comments on pull request diffs (3e53228)
- **platform**: support macOS and Linux with editor paths, persistent keyring, process groups and CSS fallbacks (21090ce)
- **security**: add a local redacted error log, hide tokens from debug output and narrow plugin permissions (0f41c4d)
- **updates**: add a new-version notice that stays off until a release repository is configured (27650e7)

### Correcciones

- **ui**: close dialogs with Escape from anywhere and disable code ligatures (b5ed58c)
- **watcher**: stop freezing the window when watching large repositories (7b1168f)
- **app**: add render error boundary and throttle repository refreshes (04e8775)
- **ui**: keep sidebar tabs and history filters within their panels (afbbb5a)
- **conflicts**: use hex escapes in the stage listing fixture (64e6bc0)
- **app**: keep workspace tabs on one line and poll running workflow runs faster (396d446)

### Mantenimiento

- scaffold tauri app with react and strict typescript (b79c560)
- cover git operations against real repositories (14275db)
- format rust sources (dc86ee1)
- describe the phase 2 features and fix the idle rebase plan query (fbe3891)
- describe the github integration and how to connect an account (f2d45fa)
- **commands**: check shortcuts and titles of the command registry (80e0cae)
- describe the phase 4 features and shortcuts (2578805)
- **ui**: add component, accessibility and smoke tests and raise low-contrast colors to WCAG AA (81c0598)
- **release**: set version 0.5.0 and configure the per-user NSIS installer with clean uninstall (30c4a52)
- add test, lint and audit workflow for Windows, macOS and Linux and a tag-driven release workflow (8d943c9)
