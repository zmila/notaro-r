## Notaro

Notare = "aro de notoj", set of notes, simple note-keeping app.
Written in tinyjs (https://tinyjs.app/docs.html), this implementation is in React.js. 
Database is Sqlite, in file notes.db located in root of the app. 

## How to run

install dependencies
> npm install

run dev build with hot reload
> tinyjs dev 

create executable in `.dist` folder
> tinyjs build



## Keyboard shortcuts

### Browsing notes

- `Insert`: create a new note.
- `Enter`: edit the selected note.
- `Delete`: delete the selected note.
- `Escape`: reset filters when the dialog is closed.
- `Ctrl+F`: focus and select the Find field.

### Editing a note

- `Escape`: cancel the note dialog.
- `Ctrl+Enter`: save the note from the dialog.
- `ArrowDown` in the title field: move to the start of the body.
- `ArrowUp` in the tags field: move to the end of the body.
- `ArrowUp` at the top of the body: move to the end of the title.
- `ArrowDown` at the bottom of the body: move to the start of the tags.
- `Ctrl+ArrowUp` in the body: move to the end of the title.
- `Ctrl+ArrowDown` in the body: move to the start of the tags.
- `Tab` in the body: insert a tab, or indent selected lines.
- `Shift+Tab` in the body: outdent selected lines.
- `Ctrl+Tab` in the body: toggle Edit/Preview mode.
