'use client';

import { useEffect, useState } from 'react';
import { Save, Clock3, RotateCcw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import LoadingState from '@/components/common/LoadingState';
import api from '@/lib/api';

function toTimeInput(value) {
  if (!value) return '00:00';
  return String(value).slice(0, 5);
}

export default function AdminShiftsPage() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');

  const loadShifts = async () => {
    setLoading(true);
    setMessage('');

    try {
      const data = await api.getShifts();
      const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

      if (rows.length > 0) {
        setShifts(
          rows.map((s) => ({
            ...s,
            start_time: toTimeInput(s.start_time),
            end_time: toTimeInput(s.end_time),
          }))
        );
      } else {
        setShifts([]);
      }
    } catch (e) {
      setShifts([]);
      setMessage(e?.message || 'Failed to load shifts from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

  const handleChange = (id, field, value) => {
    setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const saveShift = async (shift) => {
    setSavingId(shift.id);
    setMessage('');

    try {
      await api.updateShift(shift.id, {
        start_time: shift.start_time,
        end_time: shift.end_time,
      });
      setMessage(`${shift.shift_name} shift updated.`);
    } catch (e) {
      setMessage(e?.message || `Failed to update ${shift.shift_name} shift.`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['technician', 'admin']}>
      <DashboardLayout>
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Shift Configuration</h1>
              <p className="mt-1 text-sm text-gray-500">Manage AM, PM, and GY shift windows used by SLA and assignment rules.</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-2.5">
              <button
                onClick={loadShifts}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <RotateCcw className="mr-1 h-4 w-4" /> Reload
              </button>
            </div>
          </div>
        </div>

        {message ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {message}
          </div>
        ) : null}

        {loading ? (
          <LoadingState label="Loading shifts..." />
        ) : shifts.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">No shifts found.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {shifts.map((shift) => (
              <section key={shift.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center">
                  <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700">
                    <Clock3 className="h-5 w-5" />
                  </div>
                  <div className="ml-3">
                    <h2 className="text-lg font-semibold text-gray-900">{shift.shift_name} Shift</h2>
                    <p className="text-xs text-gray-500">Configure start and end times</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Start Time</label>
                    <input
                      type="time"
                      value={shift.start_time}
                      onChange={(e) => handleChange(shift.id, 'start_time', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-gray-500">End Time</label>
                    <input
                      type="time"
                      value={shift.end_time}
                      onChange={(e) => handleChange(shift.id, 'end_time', e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={() => saveShift(shift)}
                  disabled={savingId === shift.id}
                  className="mt-4 inline-flex items-center rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  <Save className="mr-1 h-4 w-4" />
                  {savingId === shift.id ? 'Saving...' : 'Save'}
                </button>
              </section>
            ))}
          </div>
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
