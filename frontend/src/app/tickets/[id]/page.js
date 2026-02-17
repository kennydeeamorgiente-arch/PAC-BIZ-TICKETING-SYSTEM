'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCcw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import TicketDetail from '@/components/tickets/TicketDetail';
import SLATimer from '@/components/tickets/SLATimer';
import api from '@/lib/api';

export default function TicketDetailPage() {
  const params = useParams();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState(null);
  const [sla, setSla] = useState({ totalMinutes: 0, isActive: false, formattedTime: '0h 0m' });

  const loadData = async () => {
    if (!id) return;

    setLoading(true);
    try {
      const [ticketData, slaData] = await Promise.all([
        api.getTicket(id),
        api.get(`/tickets/${id}/sla`),
      ]);

      const ticketRow = ticketData?.data || ticketData || null;
      const slaRow = slaData?.data || slaData || { totalMinutes: 0, isActive: false, formattedTime: '0h 0m' };

      setTicket(ticketRow);
      setSla(slaRow);
    } catch {
      setTicket({
        id: Number(id),
        ticket_number: `TKT-${id}`,
        title: 'Sample Ticket Detail',
        description: 'This is fallback data shown when API is not available.',
        status: 'open',
        priority: 'medium',
        category: 'General',
        assigned_to_name: 'Unassigned',
        created_at: new Date().toISOString(),
      });
      setSla({ totalMinutes: 15, isActive: true, formattedTime: '0h 15m' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <ProtectedRoute allowedRoles={['admin', 'technician', 'manager']}>
      <DashboardLayout>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/tickets" className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Tickets
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Ticket Detail</h1>
          </div>

          <button
            onClick={loadData}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCcw className="mr-1 h-4 w-4" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading ticket details...</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <TicketDetail ticket={ticket} />
            </div>
            <div className="xl:col-span-1">
              <SLATimer initialMinutes={sla?.totalMinutes || 0} isActive={!!sla?.isActive} />
              <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
                <p className="text-xs uppercase text-gray-500">SLA Summary</p>
                <p className="mt-2">Elapsed: <span className="font-semibold">{sla?.formattedTime || '0h 0m'}</span></p>
                <p>Total Minutes: <span className="font-semibold">{sla?.totalMinutes || 0}</span></p>
              </div>
            </div>
          </div>
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
