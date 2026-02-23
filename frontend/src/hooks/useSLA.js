'use client';

import { useEffect, useMemo, useState } from 'react';

function formatMinutes(totalMinutes) {
  const mins = Math.max(0, Number(totalMinutes || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export function useSLA({
  initialMinutes = 0,
  isActive = false,
  targetMinutes = 240,
} = {}) {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsedMinutes(0);

    if (!isActive) return undefined;

    const id = setInterval(() => {
      setElapsedMinutes((v) => v + 1);
    }, 60000);

    return () => clearInterval(id);
  }, [initialMinutes, isActive]);

  const computed = useMemo(() => {
    const baseMinutes = Number(initialMinutes || 0);
    const totalMinutes = baseMinutes + elapsedMinutes;
    const remainingMinutes = Math.max(0, targetMinutes - totalMinutes);
    const isBreached = totalMinutes > targetMinutes;
    const progressPercent = targetMinutes > 0
      ? Math.min(100, Math.round((totalMinutes / targetMinutes) * 100))
      : 0;

    return {
      totalMinutes,
      formattedTime: formatMinutes(totalMinutes),
      remainingMinutes,
      isBreached,
      progressPercent,
    };
  }, [initialMinutes, elapsedMinutes, targetMinutes]);

  return computed;
}
