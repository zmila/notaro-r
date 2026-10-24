# changelog

## version 0.9.0, 2026-10-24
### what's new
- Implemented reference/link to other note: typing `[[` in the editor shows a popup with notes (title, id and date) filtered as you type; picking one inserts a Markdown link `[Note title](#note-234)`, shown underlined, and clicking it selects that note.

---

## version 0.8.1, 2026-10-24
### what's new
- Find: the list is filtered as you type or paste, once the text has 3 or more characters (ignoring surrounding spaces); the Find button is gone.
- Find: a `×` button at the right end of the field clears it.
- Choosing a tag or a calendar month now also applies the text in the Find field, so the tag, calendar and text filters always work together.

---

## version 0.8.0, 2026-10-23
### what's new
- Export: `File > Export All…` and `File > Export Selected…` (the notes currently listed) save notes to an XML file with their titles, dates, tags and Markdown bodies.
- Import: `File > Import…` adds the notes from an exported XML file as new notes, keeping their titles and dates. Tags from the body and the `tags` attribute are merged into the body's last line, together with a new `#imported_yyyymmdd_hhmmss` tag; after the import that tag is selected, so only the imported notes are shown.
- Menus: the `Note` menu is now `Edit` (New Note, Copy Note, Paste as Note, Delete Note), and a new `File` menu holds Import, Export and Exit.

---

## version 0.7.0, 2026-10-23
### what's new
- Notes in the list (preview and full view) and the editor's Preview end with a row of their tags, e.g. `#todo #demo`; clicking a tag selects it in the tags column. A last body line that holds only tags is hidden there, but stays in the editor.
- Tag suggestions in the note editor: typing `#` and two or more characters shows a popup with the existing tags that start with them. Down moves into the list, Enter or a click inserts the tag, Esc or a click elsewhere closes the popup.

---

## version 0.6.0, 2026-10-17
### what's new
- Tags are now `#words` in the note body (any script, digits, `_`, `-`, `.`), collected when the note is saved; the separate tags field is gone. Tags are shown in blue, and clicking one in the notes list selects it in the tags column. Older notes get their tags appended as a `#a #b` line when opened for editing.
- Notes are edited in place instead of in a popup: the card shows Edit/Preview, OK and Cancel on top, then the title and a resizable body. Esc or Cancel leaves without saving; filtering, new, paste, edit or delete ask "Discard unsaved changes?" when there are unsaved edits. The ✏ toolbar button next to `N+` starts editing the selected note, or scrolls to the note being edited.
- Keyboard navigation in the notes list: Ctrl+Up / Ctrl+Down select the previous / next note, Ctrl+PgUp / Ctrl+PgDn move 10 notes, Ctrl+Home / Ctrl+End go to the first / last note; the selected note is scrolled just into view. Esc also moves the focus to the selected (or top) note.
- The selection follows list changes: sorting keeps the selected note in view, a filter that hides it selects the top note, and deleting a note selects the next one (or the previous one at the end).

---

## version 0.5.0, 2026-10-17
### what's new
- Markdown formatting hotkeys in the note editor (bold, italic, underline, strikethrough, code, headings, lists, clear formatting); they follow the active keyboard layout.
- Links in notes open in the default web browser.
- Lists: Enter continues the list; Tab and Shift+Tab change the nesting level; numbered lists renumber themselves.
- Custom right-click menu in the notes list: New Note, Paste as Note, Copy Note, Edit, Delete, with shortcuts shown.
- New shortcuts in the notes list: Ctrl+N, Ctrl+V (paste the clipboard as a new note), Ctrl+C (copy the note), F2.
- Note text in the notes list can be selected with the mouse and copied.
- Clearer styling for quotes, inline code and code blocks.
- New one-row toolbar: `N+` (new note) on the left, Find in the middle, Sort on the right; the sort direction button is an emoji (🔽/🔼).
- Tags and calendar columns can be hidden with the `#` and 📆 toolbar toggles, the View menu, or Ctrl+Shift+T / Ctrl+Shift+D; the choice is remembered.
- Calendar years collapse and expand by clicking the year header; all years start collapsed.
- Per-note height toggle left of the note title: █ full note, ▀ 5-line preview (default), ▔ title only; Shift+click goes back.
- Toolbar toggle to switch all notes at once (top notes first, then the rest, so there is no visible delay).
- Note height shortcuts: Ctrl+plus / Ctrl+minus expand or collapse the selected note; Ctrl+Shift+plus / Ctrl+Shift+minus do the same for all notes.

---

## version 0.4.0, 2026-10-16
### what's new
- Added a changelog.
- Added automatic version number updates.
- Added an About dialog.

---

## version 0.3.0, 2026-10-16
### what's new
- Tray icon and app icon.
- Minimize to tray.
- Global hotkey to show/hide the main window.
- Progressive note rendering: the first 20 notes are shown immediately for a faster first paint, then the rest are loaded.

---

## version 0.2.0, 2026-10-04
### what's new
- Rewrote the app from plain HTML to React.js.

---

## version 0.1.0, 2026-10-03
### what's new
- Read and write notes in the `notes.db` SQLite database.
- Show notes with Markdown formatting.
- Sorting by title and dates.
- Filtering by tag, date, and text query.
- Create/edit note popup with preview.
