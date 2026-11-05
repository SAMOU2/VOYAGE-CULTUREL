'use client'

import { useEffect, type RefObject } from 'react'

export function useFocusTrap(ref: RefObject<HTMLElement | null>, onEscape: () => void) {
  useEffect(() => {
    // Un dialogue défile dans sa feuille, jamais derrière elle (notamment après
    // une insertion tactile qui replace le curseur sur un navigateur mobile).
    const body = document.body,
      previous = body.style.cssText,
      x = window.scrollX,
      y = window.scrollY
    Object.assign(body.style, {
      position: 'fixed',
      top: `${-y}px`,
      left: `${-x}px`,
      width: '100%',
      overflow: 'hidden',
    })
    return () => {
      body.style.cssText = previous
      window.scrollTo({ left: x, top: y, behavior: 'instant' })
    }
  }, [])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscape()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), a[href], select:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((n) => n.getClientRects().length > 0)
      const first = nodes[0],
        last = nodes.at(-1)
      if (!first) {
        event.preventDefault()
        return
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || !ref.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [onEscape, ref])
}
