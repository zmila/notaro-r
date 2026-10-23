export interface ImportedNote {
  title: string
  body: string
  // from the `tags` attribute (space-separated)
  tags: string[]
  created_at: string
  updated_at: string
}

// Local time as yyyymmdd_hhmmss, for the `#imported_…` tag.
export function localStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

// Reads a Notaro export: the `<notaro>` root and its `<note>` children.
// The `id` attribute is ignored (ids are new).
export function parseNotaroXml(text: string): { notes: ImportedNote[] } | { error: string } {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) return { error: 'The file is not valid XML.' }
  const root = doc.documentElement.localName === 'notaro' ? doc.documentElement : doc.getElementsByTagName('notaro')[0]
  if (!root) return { error: 'No <notaro> element found.' }
  const notes = Array.from(root.children).filter((element) => element.localName === 'note').map((element) => ({
    title: element.getAttribute('title') ?? '',
    body: noteBody(element),
    tags: (element.getAttribute('tags') ?? '').split(/\s+/).map((tag) => tag.replace(/^#/, '')).filter(Boolean),
    created_at: element.getAttribute('createdAt') ?? '',
    updated_at: element.getAttribute('updatedAt') ?? '',
  }))
  if (notes.length === 0) return { error: 'No <note> elements found inside <notaro>.' }
  return { notes }
}

// The CDATA sections (a split `]]>` spans two); plain text when there are none.
function noteBody(element: Element): string {
  const cdata = Array.from(element.childNodes).filter((node) => node.nodeType === Node.CDATA_SECTION_NODE)
  const text = cdata.length > 0 ? cdata.map((node) => node.nodeValue ?? '').join('') : (element.textContent ?? '').trim()
  return text.replace(/\r\n?/g, '\n')
}
