import { useEffect, useRef } from 'react'
import { about } from '../about'

interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (open && dialog && !dialog.open) {
      // showModal() focuses the first focusable element (the link) unless one
      // carries the native autofocus attribute; Enter should close instead
      okRef.current?.setAttribute('autofocus', '')
      dialog.showModal()
    }
  }, [open])

  function close() {
    dialogRef.current?.close()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="about"
      onCancel={(event) => { event.preventDefault(); close() }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
        }
      }}
    >
      <form method="dialog" className="about-form" onSubmit={(event) => { event.preventDefault(); close() }}>
        <h2 className="about-name">{about.name}</h2>
        <p>Version {about.version}, released {about.date}</p>
        <p>{about.description}</p>
        <p>Written with tinyjs (<a href={about.url}>{about.url}</a>)</p>
        <div className="about-actions">
          <button ref={okRef} type="submit" className="head-btn dialog-btn">OK</button>
        </div>
      </form>
    </dialog>
  )
}
