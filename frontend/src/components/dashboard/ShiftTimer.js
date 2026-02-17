'use client';

import { useMemo } from 'react';
import { Clock3 } from 'lucide-react';

function getShiftWindow(shiftType) {
  if (shiftType === 'AM') return { start: 6, end: 14, label: '6:00 AM - 2:00 PM' };
  if (shiftType === 'PM') return { start: 14, end: 22, label: '2:00 PM - 10:00 PM' };
  return { start: 22, end: 6, label: '10:00 PM - 6:00 AM' };
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

export default function ShiftTimer({ shiftType = 'AM' }) {
  const data = useMemo(() => {
    const now = new Date();
    const { start, end, label } = getShiftWindow(shiftType);

    const startTime = new Date(now);
    const endTime = new Date(now);

    startTime.setHours(start, 0, 0, 0);
    endTime.setHours(end, 0, 0, 0);

    if (shiftType === 'GY' && now.getHours() < 6) {
      startTime.setDate(startTime.getDate() - 1);
    }
    if (shiftType === 'GY') {
      endTime.setDate(endTime.getDate() + (now.getHours() >= 22 ? 1 : 0));
    }

    const isInShift = now >= startTime && now <= endTime;
    const remaining = isInShift ? endTime - now : 0;

    return {
      label,
      isInShift,
      remaining: formatDuration(remaining),
    };
  }, [shiftType]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center">
        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700">
          <Clock3 className="h-5 w-5" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-semibold text-gray-900">Current Shift</h3>
          <p className="text-xs text-gray-500">{shiftType} Shift</p>
        </div>
      </div>

      <p className="mt-4 text-sm text-gray-600">{data.label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{data.isInShift ? data.remaining : 'Off Shift'}</p>
      <p className="mt-1 text-xs text-gray-500">{data.isInShift ? 'Remaining in this shift' : 'Not currently in shift window'}</p>
    </div>
  );
}
