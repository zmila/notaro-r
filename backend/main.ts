// src/main.js
import { Database } from 'tjs:sqlite';
import { TRAY_ICON_PNG_BASE64 } from './trayIcon';

const HOTKEY = 'ctrl+alt+f11';
const HOTKEY_LABEL = 'Ctrl+Alt+F11';
// as in the nib example: txiki has no os.platform()
const IS_MAC = tjs.env.OS !== 'Windows_NT' && !/linux/i.test(globalThis.navigator?.platform ?? '');

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
let dbPath = '';
let stmts: Record<string, any> = {};
let ready = Promise.resolve();

export function init(_app: TinyApp) {

  _app.menu.set([
    // Ids reach the page through tiny.menu.on; it owns the note actions.
    { title: 'File', items: [
      { id: 'file:import', label: 'Import…' },
      { separator: true },
      { id: 'file:exportAll', label: 'Export All…' },
      { id: 'file:exportListed', label: 'Export Selected…' },
      { separator: true },
      { id: 'file:exit', label: 'Exit' },
    ] },
    // Native accelerators: WebView2's browser-key filter swallows Ctrl+B/I/U/K/D
    // (and Ctrl+N) before the page sees them, but menu accelerators always fire.
    // Copy/Paste/Delete get no accelerators: they would steal Ctrl+C/Ctrl+V/Del
    // from text fields; the page handles those keys itself.
    // macOS always installs a stock Edit menu, so these items join it there
    // (role 'edit'); Windows/Linux get a plain Edit menu of their own.
    { ...(IS_MAC ? { role: 'edit' as const } : { title: 'Edit' }), items: [
      { id: 'note:new', label: 'New Note', key: 'n' },
      { separator: true },
      { id: 'note:copy', label: 'Copy Note', enabled: false },
      { id: 'note:paste', label: 'Paste as Note' },
      { separator: true },
      { id: 'note:delete', label: 'Delete Note', enabled: false },
    ] },
    // checked states are synced from the page (it restores them from tiny.store)
    { title: 'View', items: [
      { id: 'view:tags', label: 'Tags Column', key: 'shift+t', checked: true },
      { id: 'view:calendar', label: 'Calendar Column', key: 'shift+d', checked: true },
      { separator: true },
      // '=' / '-' are the physical plus/minus keys (VK_OEM_PLUS / VK_OEM_MINUS)
      { id: 'view:noteGrow', label: 'Expand Selected Note', key: '=' },
      { id: 'view:noteShrink', label: 'Collapse Selected Note', key: '-' },
      { id: 'view:allGrow', label: 'Expand All Notes', key: 'shift+=' },
      { id: 'view:allShrink', label: 'Collapse All Notes', key: 'shift+-' },
    ] },
    { title: 'Format', items: [
      { id: 'format:bold', label: 'Bold', key: 'b' },
      { id: 'format:italic', label: 'Italic', key: 'i' },
      { id: 'format:underline', label: 'Underline', key: 'u' },
      { id: 'format:strike', label: 'Strikethrough', key: 'k' },
      { id: 'format:code', label: 'Monospace', key: 'm' },
      { separator: true },
      { id: 'format:heading1', label: 'Heading 1', key: '1' },
      { id: 'format:heading2', label: 'Heading 2', key: '2' },
      { id: 'format:heading3', label: 'Heading 3', key: '3' },
      { separator: true },
      { id: 'format:orderedList', label: 'Numbered List', key: '9' },
      { id: 'format:bulletList', label: 'Bulleted List', key: '0' },
      { separator: true },
      { id: 'format:clear', label: 'Clear Formatting', key: 'd' },
    ] },
    // Mass actions (Remove/Replace Tag, Clear Updated-at Drift) are implemented
    // in src/massActions.ts + the bulkUpdateNotes API below, but not wired into
    // any menu — not needed in production yet; see AGENTS.md "Mass actions".
    { title: 'Help', items: [{ id: 'about', label: 'About Notaro' }] },
  ]);
  setupTray(_app);
  
  // tjs.* fs is async; sqlite is sync — mkdir MUST complete first.
  // But init() isn't awaited by the runtime, so do the setup in an
  // async IIFE and let api calls await a readiness promise.
  ready = (async () => {
    await tjs.makeDir(tjs.cwd, { recursive: true });
    dbPath = tjs.cwd + '/notes.db';
    db = new Database(dbPath);

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
    // Mass actions set updated_at explicitly (preserved or deliberately changed by
    // the processing function) instead of always bumping it to now.
    stmts.bulkSet = db.prepare(
      `UPDATE note SET title = ?, body = ?, tags = ?, updated_at = ? WHERE id = ?`
    );
    stmts.delete = db.prepare(`DELETE FROM note WHERE id = ?`);
    stmts.count = db.prepare(`SELECT COUNT(*) AS n FROM note`);
    stmts.now = db.prepare(`SELECT datetime('now') AS now`);

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

// ---------------------------------------------------------------- export

interface ExportInput {
  /** true: every note; otherwise `ids`, written in the given order */
  all?: boolean;
  ids?: number[];
  /** the file chosen in the page's Save As dialog */
  path: string;
}

// Characters XML 1.0 forbids even in CDATA.
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function xmlAttr(value: unknown): string {
  return String(value ?? '').replace(XML_INVALID, '').replace(/[&<>"\t\n\r]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\t': '&#9;', '\n': '&#10;', '\r': '&#13;',
  }[c]!));
}

function xmlCdata(value: string): string {
  // `]]>` would end the section: split it across two.
  return `<![CDATA[${value.replace(XML_INVALID, '').replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
}

interface ImportNote {
  title?: string;
  body?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------- mass actions

interface BulkUpdate {
  id: number;
  title?: string;
  body?: string;
  tags?: string[];
  updated_at: string;
}

// A `notes.db` copy taken right before a mass action writes, since there is
// no undo. Nothing else writes to the file between the read and the copy:
// the caller does this before opening the write transaction.
async function backupDb(): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.bak-${stamp}`;
  await tjs.writeFile(backupPath, await tjs.readFile(dbPath));
  return backupPath;
}

// 'yyyy-mm-dd' or 'yyyy-mm-dd HH:MM[:SS]' (a 'T' separator is accepted) → the DB's 'yyyy-mm-dd HH:MM:SS'.
function validDate(value: unknown): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(:\d{2})?)?$/.exec(String(value ?? '').trim());
  if (!match) return null;
  return `${match[1]} ${match[2] ?? '00:00'}${match[3] ?? ':00'}`;
}

// <notaro version updatedAt notesCount><note id title createdAt updatedAt tags>body</note>…</notaro>
function notesXml(notes: Note[], version: string, exportedAt: string): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<notaro version="${xmlAttr(version)}" updatedAt="${xmlAttr(exportedAt)}" notesCount="${notes.length}">`,
  ];
  for (const note of notes) {
    const tags = note.tags.map((tag) => String(tag).trim().replace(/\s+/g, '_')).filter(Boolean).join(' ');
    lines.push(
      `  <note id="${note.id}" title="${xmlAttr(note.title)}" createdAt="${xmlAttr(note.created_at)}"`
      + ` updatedAt="${xmlAttr(note.updated_at)}" tags="${xmlAttr(tags)}">${xmlCdata(note.body)}</note>`,
    );
  }
  lines.push('</notaro>', '');
  return lines.join('\n');
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

  // Writes the notes as XML to `path`; returns how many were written.
  exportNotes: async (params, app) => {
    await ready;
    const { all, ids = [], path } = params as ExportInput;
    if (!path) throw new Error('no file chosen');
    const notes: Note[] = stmts.list.all().map(rowToNote);
    let picked = notes;
    if (!all) {
      const byId = new Map(notes.map((note) => [note.id, note]));
      picked = ids.map((id) => byId.get(Number(id))).filter((note): note is Note => !!note);
    }
    const { version } = await app.info();
    const xml = notesXml(picked, version, stmts.now.all()[0].now);
    await tjs.writeFile(path, new TextEncoder().encode(xml));
    return { path, count: picked.length };
  },

  // The page parses it (DOMParser); txiki has no XML parser.
  readTextFile: async ({ path }: { path?: string }) => {
    if (!path) throw new Error('no file chosen');
    return new TextDecoder().decode(await tjs.readFile(path));
  },

  // Inserts imported notes in one transaction; dates are kept as given
  // (created_at falls back to now, updated_at to created_at).
  importNotes: withDb(({ notes = [] }: { notes?: ImportNote[] }) => {
    const now = stmts.now.all()[0].now;
    db.exec('BEGIN');
    try {
      for (const note of notes) {
        const created = validDate(note.created_at) ?? now;
        const updated = validDate(note.updated_at) ?? created;
        stmts.insertAt.all(String(note.title ?? '').trim(), String(note.body ?? ''), normalizeTags(note.tags ?? []), created, updated);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return { count: notes.length };
  }),

  // Generic mass-action persistence: src/massActions.ts runs a processing
  // function over all notes in the page and hands the changed ones here.
  // Each row carries its own updated_at (preserved or deliberately changed
  // by the processing function) rather than always bumping it to now.
  bulkUpdateNotes: async ({ updates = [] }: { updates?: BulkUpdate[] }) => {
    await ready;
    if (updates.length === 0) return { count: 0, backup: null };
    const backup = await backupDb();
    db.exec('BEGIN');
    try {
      for (const update of updates) {
        stmts.bulkSet.run(
          String(update.title ?? '').trim(),
          String(update.body ?? ''),
          normalizeTags(update.tags ?? []),
          update.updated_at,
          update.id,
        );
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return { count: updates.length, backup };
  },
}