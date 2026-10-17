# changelog

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
