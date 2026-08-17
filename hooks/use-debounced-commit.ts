'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export function useDebouncedCommit(
  externalValue: string,
  onChange: (v: string) => void,
  delayMs = 300
): [string, (v: string) => void, () => void] {
  const [localValue, setLocalValue] = useState(externalValue)
  const pendingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!pendingRef.current && externalValue !== localValue) {
      setLocalValue(externalValue)
    }
  }, [externalValue, localValue])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const setValue = useCallback((v: string) => {
    setLocalValue(v)
    pendingRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      pendingRef.current = false
      onChange(v)
    }, delayMs)
  }, [onChange, delayMs])

  const commitNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (pendingRef.current) {
      pendingRef.current = false
      onChange(localValue)
    }
  }, [onChange, localValue])

  return [localValue, setValue, commitNow]
}
