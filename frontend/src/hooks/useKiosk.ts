'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { IDLE_DELAY_MS } from '@shared/game'
import type { CountryFact } from '@shared/types'

export type KioskView = 'attract' | 'welcome' | 'name'
export function useKiosk(activeGame: boolean) {
  const [view, setView] = useState<KioskView>('welcome')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current)
      if (!activeGame) timer.current = setTimeout(() => setView('attract'), IDLE_DELAY_MS)
    }
    reset()
    window.addEventListener('pointerdown', reset, { passive: true })
    window.addEventListener('keydown', reset)
    window.addEventListener('input', reset)
    window.addEventListener('wheel', reset, { passive: true })
    return () => {
      if (timer.current) clearTimeout(timer.current)
      window.removeEventListener('pointerdown', reset)
      window.removeEventListener('keydown', reset)
      window.removeEventListener('input', reset)
      window.removeEventListener('wheel', reset)
    }
  }, [activeGame])
  return { view, setView, wake: useCallback(() => setView('welcome'), []) }
}
export function useAttractFact(countries: CountryFact[] | undefined, enabled: boolean) {
  const [current, setCurrent] = useState<{
    country: CountryFact
    fact: CountryFact['facts'][number]
  } | null>(null)
  const previous = useRef('')
  useEffect(() => {
    if (!enabled || !countries?.length) return
    const choose = () => {
      if (document.hidden) return
      const choices = countries.filter((c) => c.countryId !== previous.current)
      const country = choices[Math.floor(Math.random() * choices.length)] ?? countries[0]
      previous.current = country.countryId
      setCurrent({ country, fact: country.facts[Math.floor(Math.random() * country.facts.length)] })
    }
    choose()
    const timer = setInterval(choose, 9_000)
    return () => clearInterval(timer)
  }, [countries, enabled])
  return current
}
