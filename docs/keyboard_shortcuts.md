# Keyboard shortcuts

## Global

- `Ctrl+Alt+F11`: show the app (also restores it from the tray), or hide it to the tray when it is focused.
- `Alt+F4`: quit the app (the `X` button only hides it to the tray).
- `F1`: open this list (also `Help > Keyboard Shortcuts`); `Escape` closes it.

## Browsing notes

- `Insert` or `Ctrl+N`: create a new note (also the `N+` toolbar button).
- `Ctrl+Shift+T`: show/hide the tags column.
- `Ctrl+Shift+D`: show/hide the calendar (dates) column.
- `Ctrl+plus`: expand the selected note (preview or title only → full, full → preview).
- `Ctrl+minus`: collapse the selected note (preview or full → title only, title only → preview).
- `Ctrl+Shift+plus` / `Ctrl+Shift+minus`: the same for all notes (like the toolbar toggle).
- `Ctrl+V`: open a new note titled `clipboard` with the clipboard text as its body.
  Review it, then save with `OK`.
- `Ctrl+C`: copy the selected note (title, blank line, body); several selected notes are copied
  one after another, separated by `---` lines. With text selected in a note,
  `Ctrl+C` (or `Ctrl+Insert`) copies just that text.
- `Enter` or `F2`: edit the selected note (or double-click the note's header bar).
- `Delete`: delete the selected note(s), after one confirmation; the next note (or the previous one, at the end) gets selected.
- `Escape`: with several notes selected, keep only the current one; otherwise reset filters
  (outside the note editor) and move the focus to the notes list, keeping the selected note or selecting the top one.
- `Ctrl+ArrowDown` / `Ctrl+ArrowUp`: select the next / previous note; a note off screen scrolls
  just into view (at the bottom when moving down, at the top when moving up).
- `Ctrl+PageDown` / `Ctrl+PageUp`: move the selection 10 notes down / up.
- `Ctrl+Home` / `Ctrl+End`: select the first / last note.
  (`Ctrl+ArrowUp/Down` and `Ctrl+PageUp/Down` also work from the Find field.)
- Several notes: `Ctrl+click` adds a note to the selection or removes it; `Ctrl+Shift` with the
  keys above extends the selection from where it started; `Ctrl+A` selects all listed notes
  (also `Edit > Select All`). The current note has a dashed outline and the toolbar
  shows `N of M`; a plain click or `Ctrl+arrow` selects one note again. `Ctrl+plus/minus`,
  copy, delete and `File > Export Selected…` act on all selected notes.
- Changing the sort keeps the selected notes and scrolls to the current one; a filter keeps
  those still listed, or selects the top listed note.
- `Ctrl+F`: focus and select the Find field (while a note is being edited: find in that note).
- `ArrowDown` in the Find field: select the first listed note and move the focus to the notes list,
  so `Enter`, `Delete` and the other keys act on notes.
- Right-click a note or the empty list: menu with the commands above and their shortcuts
  (`ArrowUp`/`ArrowDown`, `Enter`, `Escape`); `Copy Selection` is added when text in the note is selected.
- Note text can be selected with the mouse (drag, double-click a word).
- `Shift`+right-click: the browser's own menu, for `Inspect` (DevTools are available in `tinyjs dev`; `F12` opens them too).

## Editing a note

- `Escape` or `Cancel`: leave the editor without saving (no question asked).
- `Ctrl+Enter`, or `Enter` in the title: save the note (`OK`).
- The view shortcuts (`Ctrl+Shift+T`/`D`, `Ctrl(+Shift)+plus/minus`) work while editing.
- `Ctrl+F`: find in the note (the selected text, if any, becomes the search text); `Ctrl+R`: find and replace.
- `Enter` / `Shift+Enter` or `F3` / `Shift+F3` in the find panel: next / previous match.
- `Enter` in the replace field: replace the current match; `Ctrl+Alt+Enter`: replace all.
- `Escape` in the find panel: close it, leaving the current match selected in the body.
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
- Typing `#` and a letter shows a popup with existing tags starting with the text typed
  so far (it follows further typing). The same happens after pasting such text, and after
  typing or deleting inside an existing `#tag` (the tag is matched by its part before the
  cursor, and picking one replaces the whole tag). `Down` moves into the list, `Up`/`Down`/`PgUp`/`PgDn` pick a tag,
  `Enter` inserts it (or click one with the mouse), `Esc` or a click elsewhere closes the popup.
  `Up` on the first tag returns to the text.
- Typing `[[` and a character shows a popup with notes to link (title, id and last-change date), the first one highlighted;
  further typing filters it (pasting `[[text` works too). `Up`/`Down`/`PgUp`/`PgDn` pick a note, `Enter` (or a click) inserts
  the link, `Esc` closes the popup for this `[[`.
- Typing or deleting inside the text of an existing note link `[Note title](#note-234)` shows the
  same popup, filtered by the text before the cursor; here `Down` moves into the list first
  (so `Enter` still makes a new line), and picking a note replaces the whole link.

## Formatting the note body

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

All Markdown markers, with examples of how they look: `Help > Markdown Syntax`
([markdown_syntax.md](./markdown_syntax.md)).
