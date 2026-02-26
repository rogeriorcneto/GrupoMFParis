import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

interface RealtimePayload<T = any> {
  eventType: PostgresChangeEvent
  new: T
  old: T
}

/**
 * Subscribe to Supabase Realtime changes on a table.
 * Calls `onEvent` for each INSERT, UPDATE, or DELETE.
 * Auto-cleans up on unmount.
 */
export function useRealtimeSubscription<T = any>(
  table: string,
  onEvent: (payload: RealtimePayload<T>) => void,
  enabled: boolean = true
) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(`realtime-${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          onEventRef.current({
            eventType: payload.eventType as PostgresChangeEvent,
            new: payload.new as T,
            old: payload.old as T,
          })
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [table, enabled])
}
