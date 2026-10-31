// Copied so the mirror wraps text exactly like the textarea does.
const MIRRORED = [
  'box-sizing', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'font-style', 'font-variant', 'font-weight', 'font-stretch', 'font-size', 'line-height', 'font-family',
  'text-align', 'text-transform', 'text-indent', 'letter-spacing', 'word-spacing', 'tab-size',
  'white-space', 'word-break', 'overflow-wrap', 'direction',
]

export interface CaretRect {
  left: number
  top: number
  bottom: number
}

// The textarea's text layout properties, for an element that must wrap its
// text the same way (e.g. a highlight layer behind it).
export function textareaTextStyle(textarea: HTMLTextAreaElement): Record<string, string> {
  const computed = getComputedStyle(textarea)
  const style: Record<string, string> = {}
  for (const name of MIRRORED) style[name] = computed.getPropertyValue(name)
  return style
}

// Viewport rectangle of the character at `position` in a textarea, measured
// on a hidden copy of its text (a textarea has no API for this).
export function textareaCaretRect(textarea: HTMLTextAreaElement, position: number): CaretRect {
  const computed = getComputedStyle(textarea)
  const mirror = document.createElement('div')
  for (const name of MIRRORED) mirror.style.setProperty(name, computed.getPropertyValue(name))
  Object.assign(mirror.style, {
    position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', overflow: 'hidden',
    boxSizing: 'border-box', border: '0', width: `${textarea.clientWidth}px`,
    whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
  })
  const value = textarea.value
  mirror.textContent = value.slice(0, position)
  const marker = document.createElement('span')
  // The rest of the word wraps along with the caret.
  marker.textContent = /^\S*/.exec(value.slice(position))?.[0] || '.'
  mirror.append(marker)
  document.body.append(mirror)
  const box = mirror.getBoundingClientRect()
  const rect = marker.getClientRects()[0] ?? marker.getBoundingClientRect()
  mirror.remove()
  const area = textarea.getBoundingClientRect()
  const x = area.left + textarea.clientLeft - textarea.scrollLeft - box.left
  const y = area.top + textarea.clientTop - textarea.scrollTop - box.top
  return { left: rect.left + x, top: rect.top + y, bottom: rect.bottom + y }
}
