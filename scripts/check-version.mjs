// Fails the build when tinyjs.json "version" differs from the newest
// changelog.md entry ("## version X.Y.Z, YYYY-MM-DD"), which is the source
// of truth. `tinyjs build` reads tinyjs.json before running the frontend
// build, so the version can't be synced here; it must already match.
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const changelog = readFileSync(new URL('changelog.md', root), 'utf8')
const config = JSON.parse(readFileSync(new URL('tinyjs.json', root), 'utf8'))

const match = changelog.match(/^## version\s+([^,\s]+)\s*,\s*(\S+)/m)
if (!match) {
  console.error('check-version: no "## version X.Y.Z, YYYY-MM-DD" entry found in changelog.md')
  process.exit(1)
}

const [, version, date] = match
if (!/^\d+\.\d+\.\d+$/.test(version) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`check-version: malformed changelog entry "${match[0]}", expected "## version X.Y.Z, YYYY-MM-DD"`)
  process.exit(1)
}

if (config.version !== version) {
  console.error(`check-version: tinyjs.json version "${config.version}" does not match changelog.md version "${version}".`)
  console.error(`Set "version": "${version}" in tinyjs.json and run the build again.`)
  process.exit(1)
}

console.log(`check-version: ${version} (${date}) OK`)
