// src/main.js
import { Database } from 'tjs:sqlite';
import { TRAY_ICON_PNG_BASE64 } from './trayIcon';

const HOTKEY = 'ctrl+alt+f11';
const HOTKEY_LABEL = 'Ctrl+Alt+F11';

interface NoteRow {
  id: number;
  created_at: string;
  updated_at: string;
  title: string;
  body: string;
  tags: string;
}

interface Note {
  id: number;
  created_at: string;
  updated_at: string;
  title: string;
  body: string;
  tags: string[];
}

interface NoteInput {
  title?: string;
  body?: string;
  tags?: string[] | string;
  created_at?: string;
}

interface UpdateNoteInput extends NoteInput {
  id: number;
}

let db: Database;
let stmts: Record<string, any> = {};
let ready = Promise.resolve();

export function init(_app: TinyApp) {

  _app.menu.set([{ title: 'Help', items: [] }]);
  setupTray(_app);
  
  // tjs.* fs is async; sqlite is sync — mkdir MUST complete first.
  // But init() isn't awaited by the runtime, so do the setup in an
  // async IIFE and let api calls await a readiness promise.
  ready = (async () => {
    await tjs.makeDir(tjs.cwd, { recursive: true });
    db = new Database(tjs.cwd + '/notes.db');

    db.exec(`
      CREATE TABLE IF NOT EXISTS note (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        title      TEXT NOT NULL DEFAULT '',
        body       TEXT NOT NULL DEFAULT '',
        tags       TEXT NOT NULL DEFAULT '[]'
      )
    `);

    stmts.list = db.prepare(
      `SELECT * FROM note ORDER BY created_at DESC`
    );
    stmts.get = db.prepare(`SELECT * FROM note WHERE id = ?`);
    stmts.insert = db.prepare(
      `INSERT INTO note (title, body, tags) VALUES (?, ?, ?) RETURNING id`
    );
    stmts.insertAt = db.prepare(
      `INSERT INTO note (title, body, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?) RETURNING id`
    );
    stmts.update = db.prepare(
      `UPDATE note SET title = ?, body = ?, tags = ?, updated_at = datetime('now') WHERE id = ?`
    );
    stmts.delete = db.prepare(`DELETE FROM note WHERE id = ?`);
    stmts.count = db.prepare(`SELECT COUNT(*) AS n FROM note`);

    seed();
  })();
}

// ---------------------------------------------------------------- tray

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// X and minimize hide to tray; the tray icon and the hotkey bring it back
function setupTray(app: TinyApp) {
  app.setHideOnClose(true);
  try { app.hotkey.register('toggle', HOTKEY); } catch (e) { console.error('hotkey', e); }

  (async () => {
    // the icon ships inside the backend bundle, so it works in dev and builds;
    // app.paths() is a function since tinyjs 0.57 (the bundled tiny.d.ts predates it)
    const paths = app.paths as unknown;
    const dir = typeof paths === 'function' ? (await paths()).cache : app.paths.cache;
    await tjs.makeDir(dir, { recursive: true });
    const icon = dir + '/tray-n.png';
    await tjs.writeFile(icon, decodeBase64(TRAY_ICON_PNG_BASE64));
    app.tray.set({
      icon,
      template: false,
      tooltip: `Notaro (${HOTKEY_LABEL})`,
      primaryAction: true,
      menu: [
        { id: 'toggle', label: `Show / Hide   ${HOTKEY_LABEL}` },
        { separator: true },
        { id: 'quit', label: 'Quit' },
      ],
    });
  })().catch((e) => console.error('tray', e));
}

const mainWin = (app: TinyApp) => app.window('main');

function hideToTray(app: TinyApp) {
  mainWin(app).hide({ app: false });
}

function showFromTray(app: TinyApp, st: TinyWinState) {
  mainWin(app).show();
  if (st.minimized) mainWin(app).restore();
}

// requireFocus: the hotkey hides only a focused window (a visible one behind
// other apps is raised instead); a tray click always steals focus, so it
// doesn't care
async function toggleWindow(app: TinyApp, requireFocus: boolean) {
  const st = await mainWin(app).getState();
  if (!st) return;
  const shown = st.visible && !st.minimized && (!requireFocus || st.focused);
  if (shown) hideToTray(app);
  else showFromTray(app, st);
}

export function onTray(id: string | null, app: TinyApp) {
  if (id === null || id === 'toggle') return toggleWindow(app, false);
  if (id === 'quit') return app.quit();
}

export function onHotkey(id: string, app: TinyApp) {
  if (id === 'toggle') return toggleWindow(app, true);
}

export function onWindowState(info: { win?: string; minimized?: boolean }, app: TinyApp) {
  if ((info.win ?? 'main') === 'main' && info.minimized) hideToTray(app);
}

// inserts a single demo note into a fresh database
function seed() {
  if (stmts.count.all()[0].n > 0) return;
  stmts.insert.all(
    'welcome',
    'This is a demo note.\nPress Ins to create a new one, Enter to edit the selected one, Del to delete it, Esc to reset the filters.',
    JSON.stringify(['demo']),
  );
}

// helper: ensure DB is up before any handler runs
const withDb = <Params, Result>(fn: (params: Params) => Result): TinyApiHandler =>
  async (params) => {
    await ready;
    return fn(params as Params);
  };

function rowToNote(row: NoteRow): Note {
  return { ...row, tags: JSON.parse(row.tags || '[]') };
}

// accepts both an array and a comma separated string
function normalizeTags(tags: NoteInput['tags'] = []): string {
  const list = Array.isArray(tags) ? tags : String(tags ?? '').split(',');
  return JSON.stringify(list.map((t) => String(t).trim()).filter(Boolean));
}

export const api: Record<string, TinyApiHandler> = {
  // Alt+F4 in the page: terminate instead of hiding to tray
  quitApp: (_params, app) => { app.quit(); return true; },

  listNotes: withDb(() => stmts.list.all().map(rowToNote)),

  countNotes: withDb(() => stmts.count.all()[0].n),

  addNote: withDb(({ title = '', body = '', tags = [], created_at }: NoteInput) => {
    if (!title.trim() && !body.trim()) throw new Error('empty note');
    const id = created_at
      ? stmts.insertAt.all(title.trim(), body, normalizeTags(tags), created_at, created_at)[0].id
      : stmts.insert.all(title.trim(), body, normalizeTags(tags))[0].id;
    return rowToNote(stmts.get.all(id)[0]);
  }),

  updateNote: withDb(({ id, title = '', body = '', tags = [] }: UpdateNoteInput) => {
    stmts.update.run(title.trim(), body, normalizeTags(tags), id);
    const row = stmts.get.all(id)[0];
    return row ? rowToNote(row) : null;
  }),

  deleteNote: withDb<{ id: number }, { id: number }>(({ id }) => {
    stmts.delete.run(id);
    return { id };
  }),
}