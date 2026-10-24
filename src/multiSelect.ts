// Click / Ctrl+click picking for the tag and month filters (an empty list
// means "no filter"). Returns `current` itself when nothing changes, so the
// caller can skip the filter change (and its unsaved-edit guard).
export function pickItem(current: readonly string[], item: string, toggle: boolean, plainClickDeselects = false): readonly string[] {
  const has = current.includes(item)
  if (toggle) return has ? current.filter((value) => value !== item) : [...current, item]
  if (has && current.length === 1) return plainClickDeselects ? [] : current
  return [item]
}

export function modifierToggle(event: { ctrlKey: boolean, metaKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey
}
