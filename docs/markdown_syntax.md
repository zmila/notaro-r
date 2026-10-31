# Markdown syntax

Note text is Markdown; a single `Enter` is a line break. The `Format` menu and the shortcuts
below insert most markers; see also [keyboard_shortcuts.md](./keyboard_shortcuts.md).
In the app this page is `Help > Markdown Syntax`, where the middle column is rendered exactly as notes show it.

## Text styles

A shortcut wraps the selected text in the markers; pressing it again removes them.
`Ctrl+D` clears all formatting from the selected lines.
A backslash shows a marker as is: `\*`, `\_`, `\~`, `` \` ``, `\#`, `\>`.

| Type | Looks like | Shortcut |
|------|------------|----------|
| `**bold**` | **bold** | `Ctrl+B` |
| `*italic*` or `_italic_` | *italic* or _italic_ | `Ctrl+I` |
| `<u>underline</u>` | <ins>underline</ins> | `Ctrl+U` |
| `~~strikethrough~~` | ~~strikethrough~~ | `Ctrl+K` |
| `` `monospace` `` | `monospace` | `Ctrl+M` |
| ```` ``with a ` backtick`` ```` | ``with a ` backtick`` | |
| `` ***bold italic***, **bold `code`** `` | ***bold italic***, **bold `code`** | |
| `\*not italic\*` | \*not italic\* | |

## Headings

The space after `#` matters: without it, `#word` is a tag.

| Type | Looks like | Shortcut |
|------|------------|----------|
| `# Heading 1` | <h1>Heading 1</h1> | `Ctrl+1` |
| `## Heading 2` | <h2>Heading 2</h2> | `Ctrl+2` |
| `### Heading 3` | <h3>Heading 3</h3> | `Ctrl+3` |

## Links

External links open in the default browser; a link to a note selects that note.

| Type | Looks like | Shortcut |
|------|------------|----------|
| `[tinyjs](https://tinyjs.app)` | [tinyjs](https://tinyjs.app) | |
| `https://tinyjs.app` | https://tinyjs.app | |
| `[Note title](#note-1)` | <ins>Note title</ins> (selects note 1) | type `[[` and a character, pick a note |

## Tags

Letters of any script, digits, `_`, `-` and `.`; not inside code or links. Shown in blue.

| Type | Looks like | Shortcut |
|------|------------|----------|
| `#todo #новый_tag #1-2.3` | three tags: `todo`, `новый_tag`, `1-2.3` | type `#` and a letter, pick a tag |
| `` `#not_a_tag` `` | `#not_a_tag` (code, no tag) | |

## Lists

`*` and `+` work as bullets too, `1)` as a number. `Enter` starts the next item, `Enter` on an
empty item ends the list. Nested items are indented by four spaces.

| Type | Looks like | Shortcut |
|------|------------|----------|
| <pre>- apple<br>- pear</pre> | <ul><li>apple</li><li>pear</li></ul> | `Ctrl+0` |
| <pre>1. first<br>2. second</pre> | <ol><li>first</li><li>second</li></ol> | `Ctrl+9` |
| <pre>- fruit<br>&nbsp;&nbsp;&nbsp;&nbsp;- apple<br>&nbsp;&nbsp;&nbsp;&nbsp;- pear<br>- vegetables</pre> | <ul><li>fruit<ul><li>apple</li><li>pear</li></ul></li><li>vegetables</li></ul> | `Tab` / `Shift+Tab` on an item |
| <pre>1. plan<br>&nbsp;&nbsp;&nbsp;&nbsp;- buy<br>&nbsp;&nbsp;&nbsp;&nbsp;- cook<br>2. eat</pre> | <ol><li>plan<ul><li>buy</li><li>cook</li></ul></li><li>eat</li></ol> | |

## Quotes and code blocks

| Type | Looks like | Shortcut |
|------|------------|----------|
| `> quoted text` | <blockquote>quoted text</blockquote> | `Enter` continues the quote |
| <pre>&gt; outer quote<br>&gt;&gt; nested quote</pre> | <blockquote>outer quote<blockquote>nested quote</blockquote></blockquote> | |
| `> \> starts with >` | <blockquote>&gt; starts with &gt;</blockquote> | |
| `\> not a quote` | \> not a quote | |
| <pre>&#96;&#96;&#96;<br>code block<br>&nbsp;&nbsp;&nbsp;&nbsp;keeps spaces<br>&#96;&#96;&#96;</pre> | <pre>code block<br>    keeps spaces</pre> | `Ctrl+M` on several lines |
