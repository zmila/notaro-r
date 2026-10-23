# AGENTS.md — Notaro (notaro-r)

Project knowledge for coding agents. The tinyjs API reference is the vendored skill in
`.agents/skills/tinyjs/` (a copy of the tinyjs install's `skill/` folder, made by
`tinyjs new`); don't edit it — put project findings here instead.

## Project

- tinyjs app, React + Vite frontend (`src/`), TypeScript backend (`backend/main.ts`),
  SQLite in `notes.db` at the app root. Sibling `../notaro-h` is the earlier plain-HTML version.
- `notes.db` is the user's data: never commit it (it is untracked on purpose).
- Production DB has ~1800 notes; design for a few thousand.
- Lint baseline: `npx oxlint src` reports one pre-existing `react(set-state-in-effect)`
  warning (`App.tsx`). Anything beyond it is new.
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
  menu in `backend/main.ts` and `NoteEditor.tsx` (keeps a keydown path too, deduped by time).
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
- Column toggles `Ctrl+Shift+T`/`Ctrl+Shift+D` are `View` menu accelerators (`key: 'shift+t'`,
  ids `view:tags`/`view:calendar`) plus a page keydown path; `App.tsx` `toggleColumn` drops a
  menu/keydown pair within 300 ms (button clicks are never deduped). The page owns the state:
  it restores it from `tiny.store` key `view` and pushes `checked` back with `tiny.menu.update`.
  The toolbar (`Toolbar.tsx`) is one full-width `<header>` above the `.columns` row:
  left = `N+`, middle = Find, then Sort, right = column toggles; it never depends on which columns are shown.
- Menus: `File` (`file:import`, `file:exportAll`, `file:exportListed`, `file:exit`), `Edit` (`note:new`
  with `Ctrl+N`, `note:copy`, `note:paste`, `note:delete` — no accelerators on the last three,
  they'd steal Ctrl+C/V/Del from text fields; `key` always includes Ctrl, so Del can't be one), View, Format, Help. tiny.d.ts says `role: 'edit'`
  is skipped on Windows/Linux, so `backend/main.ts` uses it only when `IS_MAC`, else a plain
  `title: 'Edit'`. App enables/disables items with `tiny.menu.update(id, { enabled })`.
- Export: native dialogs exist only in the page (`tiny.dialog.saveFile`), not on the backend
  app, so the page asks for the path first, then calls the `exportNotes({ all, ids, path })`
  API, which builds the XML (`notesXml`) and writes it with `tjs.writeFile`. Exit goes through
  the page (`leaveEditor`, then `quitApp`) so unsaved edits prompt first.
- Import: page `tiny.dialog.openFile` → backend `readTextFile` (txiki has no XML parser) →
  page `parseNotaroXml` (`src/notesImport.ts`, DOMParser) → `withTagLine` (body tags + `tags`
  attribute + `imported_<local stamp>`, deduped, as the last line) and `extractTags` → backend `importNotes` (one transaction,
  `validDate` normalizes dates) → `refresh()` and select that tag. A Playwright `listNotes` stub
  must return a new array each call, or React sees no change after the import.
- `app.paths` is a function since tinyjs 0.57, but the bundled `backend/tiny.d.ts` predates it
  (see the cast in `setupTray`).
- The tinyjs CLI lives in `%LOCALAPPDATA%\tinyjs` (`cli.js`); read it to answer questions
  about build order or bridge behavior instead of guessing.

## Frontend patterns

- Startup speed: `NotesPanel` renders the first 20 notes immediately, then 50 more per frame
  (rAF + setTimeout); `markdownHtml` caches sanitized HTML (LRU-ish, 2000 entries, cap sized
  for the ~1800-note DB). Keep both when touching the notes list.
- `NoteCard` is `memo`ized and gets one stable `handlers` object (callbacks read the latest
  props through a ref), so a selection change or a bulk-view batch re-renders only the cards
  whose props changed. Don't pass inline per-card closures — that defeats the memo.
- Note view modes (`src/noteView.ts`): the toolbar's bulk toggle bumps `BulkNoteView.gen`; the
  same `useProgressiveLimit` (keyed by `gen`) spreads the new mode over the list (20, then +50
  per frame). Per-note overrides carry the `gen` they were made in: current-gen ones win,
  otherwise cards inside the apply limit show the bulk mode and cards beyond it keep the
  previous-gen override or `prev`.
- `Ctrl(+Shift)+plus/minus` (expand/collapse selected/all notes) are `View` menu accelerators
  with `key: '='`/`'-'` (`'shift+='`/`'shift+-'`) — the launcher maps single chars with
  `VkKeyScan`, so these are the physical OEM plus/minus keys. The page keydown path matches
  `event.code` (`Equal`/`Minus`/numpad), shares the menu/keydown dedupe (`acceptShortcut`) and
  `preventDefault`s to block browser zoom. The selected note is changed through
  `NotesPanelHandle.stepSelected` (React 19 `ref` prop + `useImperativeHandle`).
- Tags (`src/noteTags.ts`): the source of truth is `#word` text in the body. `extractTags` runs
  on save (`App.saveNote`) and its result is sent as `tags` to the unchanged backend API; code
  spans/fences and `](#anchor)` link targets are skipped. `linkTagsHtml` wraps tags in
  `<span class="note-tag" data-tag>` inside `markdownHtml` (after DOMPurify, so it is cached);
  a click on one in a card calls `onTag`. DB rows from before keep tags only in the `tags`
  column; `App.openEditNote` appends them via `appendMissingTags` when such a note is opened.
- Tag suggestions (`TagSuggest.tsx`): focus never leaves the textarea — `NoteEditor` drives the
  popup from the body's keydown (`active` -1 until `Down`), opens/updates it on input
  (`refreshSuggest(body, true)`) and only updates/closes it on `onSelect` caret moves; a ref
  mirrors the open state because `onSelect` can run before the state update lands. The popup
  is portaled to `body` with `position: fixed` at `textareaCaretRect` (mirror-div caret
  measurement) and `preventDefault`s mousedown so the textarea keeps focus; textarea blur closes it.
- In-place editing (`NoteEditor.tsx`): App holds one `EditSession` (`note` null = new note, the
  `initial` draft, a `key` that remounts the editor). The draft lives in the editor; it reports
  only dirty flips (`onDirtyChange` → `editDirty` ref), so typing never re-renders App.
  `NotesPanel` renders the passed `editor` in place of the edited note's card, or on top
  for a new note. Actions that change which notes are shown or edited go through
  `guarded`/`leaveEditor` (confirm `Discard unsaved changes?` when dirty, then close);
  view toggles, sort, copy and clicks in other cards don't. The global keydown ignores events
  from inside `.note-editor` except Ctrl+F and the view shortcuts; the editor handles Esc,
  Ctrl+Enter, Ctrl+Tab and formatting itself. The toolbar pencil button edits the selected
  listed note (disabled with none), or, while editing, calls `revealNoteEditor`
  (`noteEditorDom.ts`) to scroll to the editor.
- Selection and scrolling: App bumps `revealGen` to have `NotesPanel` scroll the selected card
  (`[data-note-id]`) into view with `block: 'nearest'` (`.notes` has `scroll-padding`). Filter and
  sort changes are detected *during render* (`listKeys` state, React's "adjust state on prop
  change" pattern), so the filtered list never renders with a stale selection. `NotesPanel`
  mounts at least up to the selected index, so Ctrl+End works before the progressive mount ends.
  Ctrl+arrow/Home/End/PgUp/PgDn are page keydown only — as menu accelerators they would steal
  the same keys from text fields.
- The Playwright test page is "not visible": `requestAnimationFrame` never fires, so the
  progressive mount stays at 20 notes there. Test with ≤ 20 listed notes (or a filter).
- Test stubs: `tiny.menu.on` must return a real unsubscribe — React StrictMode mounts
  effects twice, and a no-op unsubscribe applies each Format command twice (bold toggles back).
- Modal `<dialog>` (`showModal()`):
  - it focuses the first focusable element (e.g. a link), and neither React's `autoFocus`
    nor `focus()` right after `showModal()` overrode that in testing; set the native
    `autofocus` attribute on the intended element *before* `showModal()`.
  - in the Playwright test browser Escape did not fire `cancel`;
    `AboutDialog` handles Escape in `onKeyDown` as well. Unverified in WebView2.
  - the global keydown handler in `App.tsx` must return early while any modal is open
    (`aboutOpen`), otherwise Enter/Escape also act on the main window.
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
