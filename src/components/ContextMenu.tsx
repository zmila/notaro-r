import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react'

export type ContextMenuItem =
  | { label: string, shortcut?: string, disabled?: boolean, onSelect: () => void }
  | { separator: true }

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Measured, then nudged back inside the window so it never hangs off an edge.
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    menu.style.left = `${Math.max(4, Math.min(x, innerWidth - menu.offsetWidth - 4))}px`
    menu.style.top = `${Math.max(4, Math.min(y, innerHeight - menu.offsetHeight - 4))}px`
    menu.querySelector<HTMLButtonElement>('button:enabled')?.focus()
  }, [x, y])

  useEffect(() => {
    function closeOutside(event: Event) {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', closeOutside, { capture: true })
    document.addEventListener('wheel', onClose, { capture: true })
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', closeOutside, { capture: true })
      document.removeEventListener('wheel', onClose, { capture: true })
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:enabled'))
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape' || event.key === 'Tab') {
      onClose()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1
      buttons[(index + step + buttons.length) % buttons.length]?.focus()
    } else if (event.key !== 'Enter' && event.key !== ' ') {
      // Every other key belongs to the menu while it is open.
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div ref={menuRef} className="context-menu" role="menu" onKeyDown={keyDown} onContextMenu={(event) => event.preventDefault()}>
      {items.map((item, index) => 'separator' in item ? (
        <div key={`separator-${index}`} className="context-menu-separator" role="separator" />
      ) : (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="context-menu-item"
          disabled={item.disabled}
          onClick={() => {
            onClose()
            item.onSelect()
          }}
        >
          <span>{item.label}</span>
          {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
        </button>
      ))}
    </div>
  )
}
