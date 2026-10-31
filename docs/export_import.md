# Export and import

`File > Export All…` saves all notes currently listed (after the tag, date and Find filters),
in list order; to export the whole database, clear the filters first (`Escape`). It is disabled
when the list is empty. `File > Export Selected…` saves the selected note(s), in list order
(also in the notes' right-click menu when several are selected).

The app first shows a `Save As` dialog with a suggested name (`notaro-all-YYYY-MM-DD.xml` or
`notaro-selected-YYYY-MM-DD.xml`), then writes the file and reports how many notes were exported.

`File > Import…` asks for an XML file in the format below and adds its notes to the database
as new notes:

- the `<notaro>` element and its `<note>` children are read; if either is missing, an alert says so and nothing is imported;
- `id` is ignored (new notes get new ids); `title`, `createdAt` and `updatedAt` are taken from the file (a missing or invalid `createdAt` becomes the import time, a missing `updatedAt` equals `createdAt`);
- the body is the `CDATA` text; its tags are the `#tags` in the body joined with the `tags` attribute (duplicates removed, case-insensitive) and the tag `#imported_yyyymmdd_hhmmss` (the import's local time);
- the full tag list is written as the body's last line (`#a #b #imported_…`), replacing a last line that held only tags;
- after the import the list reloads and that tag is selected, so exactly the imported notes are shown.

## File format

A UTF-8 XML file:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<notaro version="0.7.0" updatedAt="2026-10-23 17:00:00" notesCount="2">
  <note id="33" title="Shopping" createdAt="2026-10-01 10:00:00" updatedAt="2026-10-02 11:00:00" tags="todo home"><![CDATA[- milk
- bread
#todo #home]]></note>
  <note id="34" title="Idea" createdAt="2026-10-03 09:15:00" updatedAt="2026-10-03 09:15:00" tags=""><![CDATA[Some **markdown** text]]></note>
</notaro>
```

- `notaro`: the root element.
  - `version`: the app version that made the file.
  - `updatedAt`: the export time (`yyyy-mm-dd HH:MM:SS`, UTC).
  - `notesCount`: the number of `note` elements.
- `note`: one element per note.
  - `id`: the note's database id.
  - `title`: the note title. Attribute values are XML-escaped (`&amp;`, `&lt;`, `&gt;`, `&quot;`, line breaks as `&#10;`).
  - `createdAt`, `updatedAt`: as stored in the database (`yyyy-mm-dd HH:MM:SS`, UTC).
  - `tags`: the note's tags without `#`, separated by spaces.
  - The note body, as Markdown text in a `CDATA` section. A `]]>` inside the body is split across two `CDATA` sections, so XML parsers read it back unchanged.
