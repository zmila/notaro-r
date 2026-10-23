## Notaro

Notare = "aro de notoj", set of notes, simple note-keeping app.
Written in tinyjs (https://tinyjs.app/docs.html), this implementation is in React.js. 
Database is SQLite, in file `notes.db` located in root of the app (auto-created on first run). 
Notes support Markdown formatting.

Currently implemented:
 - create note;
 - edit note in place: the note card turns into an editor (toolbar with Edit/Preview, OK, Cancel on top, then the title and the body; drag the body's bottom-right corner to resize it). One note is edited at a time; the pencil button next to N+ starts editing the selected note, or scrolls back to the note being edited. Actions that change which notes are shown or edited (tag/date/Find filters, new, paste, edit another note, delete) close the editor, asking `Discard unsaved changes?` first when there are unsaved edits; view toggles, sorting, copying and clicks or text selection in other notes keep it open;
 - delete note;
 - filtering by tag, date and text;
 - tags are written in the note body as `#word` (letters of any script, digits, `_`, `-`, `.`; e.g. `#tag1`, `#новый_tag`, `#1-2.3`; not inside code or links); they are collected from the body when the note is saved with `OK`. Tags are shown in blue; clicking one in the notes list selects it in the tags column. A note shown as preview or in full (and the editor's Preview) ends with a row of its tags (`#todo #demo`); a last body line holding only tags is hidden there, but stays in the editor. Notes from before this change keep their tags: opening such a note for editing appends the missing ones as a last `#a #b` line;
 - sorting by updated/created date or title, 🔽 descending / 🔼 ascending;
 - collapsible tags and calendar columns: toggle buttons `#` and calendar icon at the right end of the toolbar (pressed = column shown), `View` menu, `Ctrl+Shift+T` / `Ctrl+Shift+D`; the state is remembered;
 - calendar years are collapsed on start; click a year header to show or hide its months
   (a collapsed year containing the selected month has its header highlighted in blue);
 - per-note height toggle left of the title: `█` full note, `▀` 5-line preview (default), `▔` title only; click cycles forward, Shift+click backward; kept in memory only;
 - the same toggle at the right end of the toolbar applies a mode to all notes (the top 20 at once, the rest a moment later); per-note changes made afterwards don't change it, and the next press overrides them again;
 - tray icon (letter N): minimizing or closing the window with the `X` button hides it to the tray, `Alt+F4` quits the app; left click on the icon shows/hides it, right click opens a menu with `Show / Hide` and `Quit`;
 - app icon (thin N, `assets/icon.png`) in the window title bar and taskbar, embedded into the exe by `tinyjs build`;
 - global shortcut `Ctrl+Alt+F11` shows/hides the app from anywhere;
 - `Help > About Notaro` popup showing the current version and release date (taken from the top section of `changelog.md`, `## version X.Y.Z, YYYY-MM-DD`).

## Screenshots

Main screen:
![main screen](./docs/main_screen.png)

Edit note:
![main screen](./docs/edit_note.png)

Filtering:
![filtering](./docs/filtering.png)

About popup:
![about popup](./docs/about.png)

## Keyboard shortcuts

### Global

- `Ctrl+Alt+F11`: show the app (also restores it from the tray), or hide it to the tray when it is focused.
- `Alt+F4`: quit the app (the `X` button only hides it to the tray).

### Browsing notes

- `Insert` or `Ctrl+N`: create a new note (also the `N+` toolbar button).
- `Ctrl+Shift+T`: show/hide the tags column.
- `Ctrl+Shift+D`: show/hide the calendar (dates) column.
- `Ctrl+plus`: expand the selected note (preview or title only → full, full → preview).
- `Ctrl+minus`: collapse the selected note (preview or full → title only, title only → preview).
- `Ctrl+Shift+plus` / `Ctrl+Shift+minus`: the same for all notes (like the toolbar toggle).
- `Ctrl+V`: open a new note titled `clipboard` with the clipboard text as its body.
  Review it, then save with `OK`.
- `Ctrl+C`: copy the selected note (title, blank line, body). With text selected in a note,
  `Ctrl+C` (or `Ctrl+Insert`) copies just that text.
- `Enter` or `F2`: edit the selected note (or double-click the note's header bar).
- `Delete`: delete the selected note; the next note (or the previous one, at the end) gets selected.
- `Escape`: reset filters (outside the note editor) and move the focus to the notes list,
  keeping the selected note or selecting the top one.
- `Ctrl+ArrowDown` / `Ctrl+ArrowUp`: select the next / previous note; a note off screen scrolls
  just into view (at the bottom when moving down, at the top when moving up).
- `Ctrl+PageDown` / `Ctrl+PageUp`: move the selection 10 notes down / up.
- `Ctrl+Home` / `Ctrl+End`: select the first / last note.
  (`Ctrl+ArrowUp/Down` and `Ctrl+PageUp/Down` also work from the Find field.)
- Changing the sort keeps the selected note and scrolls to it; a filter that hides it selects
  the top listed note instead.
- `Ctrl+F`: focus and select the Find field.
- Right-click a note or the empty list: menu with the commands above and their shortcuts
  (`ArrowUp`/`ArrowDown`, `Enter`, `Escape`); `Copy Selection` is added when text in the note is selected.
- Note text can be selected with the mouse (drag, double-click a word).
- `Shift`+right-click: the browser's own menu, for `Inspect` (DevTools are available in `tinyjs dev`; `F12` opens them too).

### Editing a note

- `Escape` or `Cancel`: leave the editor without saving (no question asked).
- `Ctrl+Enter`, or `Enter` in the title: save the note (`OK`).
- The view shortcuts (`Ctrl+Shift+T`/`D`, `Ctrl(+Shift)+plus/minus`) and `Ctrl+F` work while editing.
- `ArrowDown` in the title field: move to the start of the body.
- `ArrowUp` at the top of the body: move to the end of the title.
- `Ctrl+ArrowUp` in the body: move to the end of the title.
- `Tab` in the body: on a list item, nest it one level deeper (four spaces), taking its
  sub-items along and the marker style of the items already on that level; elsewhere
  insert a tab, or indent selected lines.
- `Shift+Tab` in the body: move a list item one level up (restyled to match that level),
  or outdent selected lines.
- `Ctrl+Tab` in the body: toggle Edit/Preview mode.
- `Enter` in a list item (`-`, `*`, `+`, `1.`, `1)` or `>`): start the next item
  (numbers count up). `Enter` on an empty nested item moves it one level up; on an empty
  top-level item it ends the list. `Shift+Enter` inserts a plain line break.
- Numbered lists renumber themselves when an item is added, removed or moved; only the
  list being edited changes, and it keeps its starting number. `Ctrl+Z` undoes the
  renumbering first, then the edit.
- Typing `#` and two or more letters shows a popup with existing tags starting with them
  (it follows further typing). `Down` moves into the list, `Up`/`Down`/`PgUp`/`PgDn` pick a tag,
  `Enter` inserts it (or click one with the mouse), `Esc` or a click elsewhere closes the popup.
  `Up` on the first tag returns to the text.

### Formatting the note body

The same commands are in the `Format` menu.
Inline styles wrap the selection; pressing the shortcut again removes the style.
With no selection they insert an empty pair of markers and put the cursor between them.
Line styles apply to every line touched by the selection; pressing again removes them.
`Ctrl+Z` undoes each step.

- `Ctrl+B`: bold, `**text**`.
- `Ctrl+I`: italic, `*text*`.
- `Ctrl+U`: underline, `<u>text</u>`.
- `Ctrl+K`: strikethrough, `~~text~~`.
- `Ctrl+M`: monospace, `` `text` `` (a fenced code block when the selection spans several lines).
- `Ctrl+1`, `Ctrl+2`, `Ctrl+3`: heading level 1, 2, 3.
- `Ctrl+9`: numbered list.
- `Ctrl+0`: bulleted list.
- `Ctrl+D`: clear all formatting from the selected lines.

## How to run

### install tinyjs

mac/linux:
> curl -fsSL https://tinyjs.app/install | sh

windows:
> irm https://tinyjs.app/install.ps1 | iex

verify (in new terminal): 
> tinyjs version


### install dependencies
> npm install

### run dev build with hot reload
> tinyjs dev 

### create executable in `.dist` folder
> tinyjs build


## Versioning

`changelog.md` is the single source of truth for the version and release date: its top
`## version X.Y.Z, YYYY-MM-DD` entry is shown in `Help > About Notaro`.
The `"version"` in `tinyjs.json` (used by `tinyjs build`) must match it;
`npm run build` (and therefore `tinyjs build`) fails when they differ.
Check manually with
> npm run check-version

To release, ask the `Update Changelog` agent (`.github/agents/update-changelog.agent.md`),
e.g. "update changelog, minor": it adds a new section with the bumped version and today's date
and updates `tinyjs.json`.


# h1 example of formatting

1. Lorem **ipsum** *dolor sit* <u>amet</u>, ~~consectetur~~ `adipiscing` ~elit~ \*escape\*
- code example `inline` or ```triple``` 
> blockquote
> multiline
```
and code
several lines
```

## TODO

- export and import
- find (and replace) while edit notes - new popup.
- implement soft delete (changes in db) and "show deleted", "clear deleted".
- implement history feature (list of visited notes with navigation back/forward as in browser). 
- persist settings in DB (new table `settings`).
