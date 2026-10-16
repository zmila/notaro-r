import changelog from '../changelog.md?raw'

// The newest (topmost) changelog section is the current release:
// "## version 0.3.0, 2026-10-16"
const [, version = 'unknown', date = 'unknown'] = changelog.match(/^## version\s+([^,\s]+)\s*,\s*(\S+)/m) ?? []

export const about = {
  name: 'Notaro',
  version,
  date,
  description: 'Simple note-taking app for Markdown-formatted notes stored in an SQLite file.',
  url: 'https://tinyjs.app/',
}
