'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export function useRealtime({
  enabled = false,
  intervalMs = 15000,
  onTick,
} = {}) {
  const [error, setError] = useState('');
  const tickRef = useRef(onTick);
  const connected = useMemo(() => enabled && typeof onTick === 'function', [enabled, onTick]);

  useEffect(() => {
    tickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!connected || typeof tickRef.current !== 'function') return undefined;

    let active = true;

    const runTick = async () => {
      try {
        await tickRef.current?.();
        if (active) setError('');
      } catch (err) {
        if (active) setError(err?.message || 'Realtime update failed');
      }
    };

    runTick();
    const id = setInterval(runTick, intervalMs);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [connected, intervalMs]);

  return {
    connected,
    error,
  };
}
