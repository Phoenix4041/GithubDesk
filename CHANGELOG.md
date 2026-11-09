# Cambios

Todos los cambios importantes de GithubDesk. Este archivo se genera a partir de los commits con `node scripts/changelog.mjs <version> [desde-etiqueta]`.

## 0.7.1 - 2026-11-09

### Correcciones

- **ui**: scroll long dropdown menus (44230d4)

## 0.7.0 - 2026-11-08

### Novedades

- **github**: sign in with the system credential manager or GitHub CLI so no OAuth App has to be created (6b2e95c)
- **updates**: configure the updater with the public key and the release endpoint (50f4907)
- **rescue**: save a safety copy before destructive actions and recover it from a Rescue dialog (e720cc3)
- **guard**: review staged changes for secrets, large files and conflict markers before committing and flag branches that would conflict (d9ce839)
- **absorb**: send staged blocks to the unpushed commits that wrote them as fixups and fold them (586bc96)
- **stack**: chain branches into a stack, restack it in one go, open chained pull requests and split unpushed commits by file (fda1dab)
- **overview**: show the state of every recent repository and fetch or fast-forward pull them all with groups (f206dbe)
- **commit**: add co-authors, issue number shortcut and per repository message templates (2fa4532)
- **browse**: list, read and restore files at any revision and diff two revisions directly (f102c65)
- **browse**: explore the files of any commit, restore one file and compare two selected commits (3608646)
- **diff**: compare images side by side, with a swipe slider or as onion skin (1fa43e4)
- **launch**: open folders and clone links from the system in the running window (8441361)
- **github**: sync a fork with its original and add the upstream remote (9055b6e)
- **stats**: compute activity, contributors, churn, bus factor and pending notes from the history (2ff79c3)
- **stats**: add the repository statistics dialog with an activity calendar, contributors, files and pending notes (8c2b872)
- **clone**: offer shallow and blobless clones for large repositories (b3d3202)
- **health**: measure the git folder, find the largest blobs, manage sparse-checkout and run gc maintenance (d14e2d8)
- **settings**: add custom themes with VS Code import, live preview and interface density (b8c859d)
- **health**: add the repository health dialog with size, large files, sparse-checkout and maintenance (0a7828b)
- **background**: fetch the open repository on a timer, keep a tray icon and start with the system (7474d47)

### Mantenimiento

- **launch**: add the launch argument and link parser for later wiring (7a68484)
- **i18n**: reapply the texts of the merged blocks (6e19a34)
- format the merged command imports (c0dace4)
- **release**: bump the version to 0.7.0 and document the seventh phase (102cd3f)

## 0.6.0 - 2026-11-08

### Novedades

- **patches**: export commits as patches and apply patch files with a preview and a banner for conflicts (9afeaf6)
- **bisect**: guide the search for the first bad commit with a banner, a start dialog and history menu entries (de31439)
- **cleanup**: remove untracked files, merged branches and stale remote branches from one dialog with a preview (71f8074)
- **github**: report token permissions and expiry, ask for missing permissions in place and keep the same account when widening them (ae2e99f)
- **profiles**: switch between accounts and organizations with a profile that sets the Git identity, the push account and the signing key per repository (a9ea81a)
- **github**: browse the repositories of the active context, clone with the chosen account, create and publish repositories and see what waits for you (35e43c7)
- **github**: edit titles, labels, assignees, milestones and reviewers, mark pull requests as draft or ready and update their branch (eaf1018)
- **github**: manage repository settings, collaborators, team access, protected branches, webhooks, deploy keys and the danger zone with typed confirmations (ce740e0)
- **github**: manage Actions secrets and variables for repositories and organizations, encrypting secrets with a sealed box that libsodium can open (a6a0417)
- **github**: create releases with generated notes and attached files, and manage labels and milestones from the repository settings (cf5f918)
- **github**: manage the account profile, SSH and GPG keys, emails and organizations with members, invitations, teams and outside collaborators (5b86785)
- **github**: add the notifications inbox with desktop alerts and a read-only list of Dependabot security alerts (739e39f)
- **updates**: install new versions inside the app once a signing key and a release repository are configured (1e0386b)

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
