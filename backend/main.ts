// src/main.js
import { Database } from 'tjs:sqlite';

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

  // magic, workaround to show react tinyjs app in windows. 
  (_app as any).setMenu([{ title: 'Help', items: [] }]);
  
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
