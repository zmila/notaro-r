export interface FindOptions {
  matchCase: boolean
  wholeWord: boolean
  /** `*` = any run of characters, `?` = one character (within a line); `\*`, `\?`, `\\` are literal */
  wildcards: boolean
}

export interface FindMatch {
  start: number
  end: number
}

export const FIND_LIMIT = 5000

const WORD = '[\\p{L}\\p{N}_]'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

// The query as a regular expression, or null when there is nothing to look for.
export function findPattern(query: string, options: FindOptions): RegExp | null {
  if (query === '') return null
  let source = ''
  if (options.wildcards) {
    // With Whole word on, wildcards stay inside the word.
    const any = options.wholeWord ? WORD : '[^\\n]'
    for (let i = 0; i < query.length; i++) {
      const char = query[i]
      if (char === '\\' && i + 1 < query.length && '*?\\'.includes(query[i + 1])) {
        source += escapeRegExp(query[++i])
      } else if (char === '*') source += `${any}*?`
      else if (char === '?') source += any
      else source += escapeRegExp(char)
    }
  } else {
    source = escapeRegExp(query)
  }
  if (options.wholeWord) source = `(?<!${WORD})(?:${source})(?!${WORD})`
  return new RegExp(source, options.matchCase ? 'gu' : 'giu')
}

// Non-overlapping, non-empty matches in text order (at most `limit`). Each match is the
// shortest one: `те*ёт` in `литературными … течёт` is `течёт`, not `тературными … течёт`.
export function findMatches(text: string, query: string, options: FindOptions, limit = FIND_LIMIT): FindMatch[] {
  const pattern = findPattern(query, options)
  if (!pattern) return []
  const sticky = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'y')
  const matches: FindMatch[] = []
  pattern.lastIndex = 0
  let found: RegExpExecArray | null
  while ((found = pattern.exec(text))) {
    if (found[0] === '') {
      pattern.lastIndex = found.index + 1
      continue
    }
    let start = found.index
    let end = start + found[0].length
    // A later start inside the match that still matches within it gives a shorter match.
    for (let at = end - 1; at > start; at--) {
      sticky.lastIndex = at
      const inner = sticky.exec(text)
      if (inner && inner[0] !== '' && at + inner[0].length <= end) {
        start = at
        end = at + inner[0].length
        break
      }
    }
    matches.push({ start, end })
    if (matches.length >= limit) break
    pattern.lastIndex = end
  }
  return matches
}

// The index of the first match at or after `position`, wrapping to the first one.
export function matchIndexFrom(matches: FindMatch[], position: number): number {
  if (matches.length === 0) return -1
  const index = matches.findIndex((match) => match.start >= position)
  return index < 0 ? 0 : index
}

// One edit spanning all matches, so Replace All is a single undo step.
export function replaceAllEdit(text: string, matches: FindMatch[], replacement: string): { from: number, to: number, text: string } | null {
  if (matches.length === 0) return null
  const from = matches[0].start
  const to = matches[matches.length - 1].end
  let result = ''
  let at = from
  for (const match of matches) {
    result += text.slice(at, match.start) + replacement
    at = match.end
  }
  return { from, to, text: result }
}
