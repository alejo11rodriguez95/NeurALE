import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchSettings, fetchShiftData, subscribeTactical, type Settings, type TacticalData } from './api'
import { currentShiftSV, todaySV, type ShiftId } from './config'

const POLL_MS = 60_000

/**
 * Carga los datos de un turno + la configuración, y los mantiene al día:
 * Supabase Realtime (cambios al instante) + re-consulta de respaldo cada 60 s.
 */
export function useTactical(date: string, shift: ShiftId) {
  const [data, setData] = useState<TacticalData | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const req = useRef(0)

  const reload = useCallback(async () => {
    const id = ++req.current
    try {
      const [d, s] = await Promise.all([fetchShiftData(date, shift), fetchSettings()])
      if (id !== req.current) return // respuesta vieja (cambió fecha/turno)
      setData(d)
      setSettings(s)
      setError(null)
      setLoadedAt(new Date())
    } catch (e) {
      if (id === req.current) setError(e instanceof Error ? e.message : String(e))
    }
  }, [date, shift])

  useEffect(() => {
    setData(null)
    reload()
    let t: ReturnType<typeof setTimeout> | undefined
    const unsub = subscribeTactical(() => {
      clearTimeout(t)
      t = setTimeout(reload, 300) // agrupa ráfagas de cambios
    })
    const poll = setInterval(reload, POLL_MS)
    return () => {
      unsub()
      clearTimeout(t)
      clearInterval(poll)
    }
  }, [reload])

  return { data, settings, error, loadedAt, reload }
}

/** Fecha/turno que sigue al reloj (El Salvador) hasta que el usuario elige otro. */
export function useLiveShift() {
  const [follow, setFollow] = useState(true)
  const [date, setDateState] = useState(todaySV)
  const [shift, setShiftState] = useState<ShiftId>(currentShiftSV)

  useEffect(() => {
    if (!follow) return
    const tick = () => {
      setDateState(todaySV())
      setShiftState(currentShiftSV())
    }
    tick()
    const i = setInterval(tick, 30_000)
    return () => clearInterval(i)
  }, [follow])

  return {
    date,
    shift,
    follow,
    setDate: (d: string) => {
      setFollow(false)
      setDateState(d)
    },
    setShift: (s: ShiftId) => {
      setFollow(false)
      setShiftState(s)
    },
    backToLive: () => setFollow(true),
  }
}
