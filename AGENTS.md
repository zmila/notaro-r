# AGENTS.md — Notaro (notaro-r)

Project knowledge for coding agents. The tinyjs API reference is the vendored skill in
`.agents/skills/tinyjs/` (a copy of the tinyjs install's `skill/` folder, made by
`tinyjs new`); don't edit it — put project findings here instead.

## Project

- tinyjs app, React + Vite frontend (`src/`), TypeScript backend (`backend/main.ts`),
  SQLite in `notes.db` at the app root. Sibling `../notaro-h` is the earlier plain-HTML version.
- `notes.db` is the user's data: never commit it (it is untracked on purpose).
- Production DB has ~1800 notes; design for a few thousand.
- Lint baseline: `npx oxlint src` reports two pre-existing `react(set-state-in-effect)`
  warnings (`NoteDialog.tsx`, `App.tsx`). Anything beyond those is new.
- Validate frontend changes with `npm run build` (runs the version check, `tsc -b`, `vite build`).

## Versioning and releases

- `changelog.md` is the single source of truth for version and release date.
  Format of each section (newest first, separated by `---` with blank lines around it):
  ```
  ## version 0.4.0, 2026-10-16
  ### what's new
  - Sentence-case item ending with a period.
  ```
  The file starts with a `# changelog` title; code reads the first `## version X.Y.Z, YYYY-MM-DD` line.
- `tinyjs.json` `"version"` is what `tinyjs build` stamps into the exe; it must equal the
  changelog version. `scripts/check-version.mjs` runs as `prebuild` and fails the build on mismatch.
  It cannot sync automatically: `tinyjs build` loads `tinyjs.json` *before* running
  `frontend.build`, so a value written during the build would only apply to the next build.
- `package.json` `"version"` is unused (`0.0.0`); the `version` file was removed.
- Release bump: the `Update Changelog` agent (`.github/agents/update-changelog.agent.md`).
  It defaults to `patch`; pass `minor` for new features. It edits only `changelog.md` and
  `tinyjs.json` `"version"`, and does not commit.
- Commit message convention for releases: first line `version X.Y.Z, YYYY-MM-DD`,
  then the changelog items.
- The user edits files between turns (e.g. changed the changelog heading format mid-session):
  re-read a file before editing or parsing it.

## tinyjs findings (verified in this project)

- `tiny.dialog.alert(message, detail)` / `confirm`: `message` is always flattened to one line;
  `detail` keeps `\n` **only on Linux** (bridge.js `lines()`), on Windows/macOS newlines become
  spaces. For multi-line or rich content use an in-app `<dialog>` (see `AboutDialog.tsx`).
- Menu items declared in the backend with `app.menu.set([...])` reach the page via
  `tiny.menu.on((id) => ...)` (confirmed on Windows with the About item).
  `"about": "menu"` in `tinyjs.json` routes the macOS app-menu About item to id `about`;
  Windows/Linux have no app menu, so the Help menu declares its own `about` item.
- Open external links with `tiny.app.shell.open(url)` (default browser), not `<a target>`.
  A plain link click in WebView2 replaces the app page; `src/main.tsx` installs one capture-phase
  `click`/`auxclick` handler that sends every absolute `http(s)`/`mailto` link to `shell.open` and
  blocks relative ones — don't add per-link handlers (they'd open the URL twice).
- Windows: with `browserAccelerators` off (default) the native launcher's WebView2
  `AcceleratorKeyPressed` handler swallows browser shortcuts **before the page sees them** —
  in a textarea `Ctrl+B/I/U/K/D` never fire `keydown` (Ctrl+M and Ctrl+digits do). Don't enable
  `browserAccelerators` (brings back Ctrl+R reload / Ctrl+P print); bind such keys as native menu
  accelerators (`{ id, label, key: 'b' }`) and handle the id in `tiny.menu.on` — see the Format
  menu in `backend/main.ts` and `NoteDialog.tsx` (keeps a keydown path too, deduped by time).
  Playwright tests can't reveal this — they run in plain Chromium.
- Right-click: the default WebView2 menu has Back/Reload, which leave the app on a blank page.
  `tiny.menu.setContext(items)` replaces it with one app-wide native menu (no per-element
  target, and it drops Inspect); there is no API to open DevTools from code (only `F12` when
  `TINYJS_DEBUG` is armed — always in `tinyjs dev`, `"debug": true` for packaged builds).
  So Notaro uses an in-page menu (`ContextMenu.tsx`, like nib) on note cards, and `main.tsx`
  blocks the browser menu everywhere except text fields and Shift+right-click (keeps Inspect).
  The screenshot tool blurs the window, which closes the menu; capture with `page.screenshot`.
- `Ctrl+N` is a browser accelerator too (new window) and is presumed swallowed, so it is also a
  native accelerator (`Note > New Note`, id `note:new`); the page ignores that id while a
  dialog or the context menu is open. `Ctrl+C`/`Ctrl+V` must NOT become menu accelerators —
  they would break copy/paste in text fields; they're handled in the page's keydown only.
- `app.paths` is a function since tinyjs 0.57, but the bundled `backend/tiny.d.ts` predates it
  (see the cast in `setupTray`).
- The tinyjs CLI lives in `%LOCALAPPDATA%\tinyjs` (`cli.js`); read it to answer questions
  about build order or bridge behavior instead of guessing.

## Frontend patterns

- Startup speed: `NotesPanel` renders the first 20 notes immediately, then 50 more per frame
  (rAF + setTimeout); `markdownHtml` caches sanitized HTML (LRU-ish, 2000 entries, cap sized
  for the ~1800-note DB). Keep both when touching the notes list.
- Modal `<dialog>` (`showModal()`):
  - it focuses the first focusable element (e.g. a link), and neither React's `autoFocus`
    nor `focus()` right after `showModal()` overrode that in testing; set the native
    `autofocus` attribute on the intended element *before* `showModal()`.
  - in the Playwright test browser Escape did not fire `cancel` (also for `NoteDialog`);
    `AboutDialog` handles Escape in `onKeyDown` as well. Unverified in WebView2.
  - the global keydown handler in `App.tsx` must return early while any modal is open
    (`dialogOpen || aboutOpen`), otherwise Enter/Escape also act on the main window.
- Markdown in docs: a line of `===` is not a divider (it makes the line above a heading);
  use `---` with blank lines around it.
- Body edits go through `execCommand('insertText')` (fallback `setRangeText`) so native
  `Ctrl+Z` keeps working; Enter list continuation (`continueList`) uses the same path.
- Chromium refuses `execCommand` inside an `input` event ("called recursively") and the
  `setRangeText` fallback then scrambles the undo stack. Follow-up edits made from
  `onChange` (list renumbering in `markdownLists.ts`) are deferred with `queueMicrotask`,
  guarded by a ref against re-entry, and skipped for `inputType` `history*` (undo/redo).
- List helpers (`indentLines`, `renumberLists`, `continueList`) are pure functions over
  `(value, selection)` returning a `FormatEdit`; test them by bundling a small script with
  `npx esbuild … --bundle --platform=node` (Node 20 can't run `.ts` directly).

## Testing without the native shell

- `npm run dev` serves on `127.0.0.1:5173` with `--strictPort`; if the port is taken, the
  user's `tinyjs dev` is probably running — reuse that server instead of starting another.
- In a browser, stub the bridge before the app loads (Playwright `addInitScript`):
  `window.tiny = { api: { call: async (name) => ... }, menu: { on: (fn) => { save fn; return () => {} } },
  dialog: { alert, confirm }, app: { shell: { open } } }`, then trigger menu ids by calling
  the saved callbacks. Measure progressive rendering by counting `article.note` per frame.
- Custom `.agent.md` agents are VS Code chat agents; outside VS Code, emulate one by giving
  a sub-agent the file's body as instructions plus the user request.

## Windows / PowerShell

- `git commit -F -` with a piped here-string failed (git saw the message as a pathspec).
  Write the message to a temp file and use `git commit -F <file>`.
- Write files with `Set-Content -Encoding utf8NoBOM`; git warns about LF→CRLF on commit,
  which is harmless here.
