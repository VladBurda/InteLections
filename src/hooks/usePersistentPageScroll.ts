import { useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

function buildScrollKey(scope: string, pathname: string, search: string) {
  return `intelections-scroll:${scope}:${pathname}${search}`
}

export function usePersistentPageScroll(scope: string) {
  const location = useLocation()
  const storageKey = buildScrollKey(scope, location.pathname, location.search)

  const rememberScroll = useCallback(() => {
    sessionStorage.setItem(storageKey, String(window.scrollY))
  }, [storageKey])

  const restoreScroll = useCallback(() => {
    const stored = Number(sessionStorage.getItem(storageKey) ?? '')
    if (!Number.isFinite(stored)) return

    const restore = () => window.scrollTo({ top: stored, behavior: 'auto' })
    restore()
    window.requestAnimationFrame(restore)
  }, [storageKey])

  useEffect(() => {
    restoreScroll()

    const onScroll = () => {
      rememberScroll()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      rememberScroll()
      window.removeEventListener('scroll', onScroll)
    }
  }, [rememberScroll, restoreScroll])

  return { rememberScroll, restoreScroll }
}
