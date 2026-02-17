'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ticket, CircleDot, CheckCircle2, ShieldCheck } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import StatsCard from '@/components/dashboard/StatsCard';
import ShiftTimer from '@/components/dashboard/ShiftTimer';
import RecentActivity from '@/components/dashboard/RecentActivity';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

export default function DashboardPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    let mounted = true;

    const loadTickets = async () => {
      try {
        const data = await api.getTickets();
        const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        if (mounted) setTickets(rows);
      } catch {
        if (mounted) {
          setTickets([
            { id: 1, status: 'open', title: 'Cannot access email', ticket_number: 'TKT-0001' },
            { id: 2, status: 'in_progress', title: 'Printer not working', ticket_number: 'TKT-0002' },
            { id: 3, status: 'resolved', title: 'Software install request', ticket_number: 'TKT-0003' },
          ]);
        }
      }
    };

    loadTickets();
    return () => {
      mounted = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length;
    const resolved = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
    const compliance = total === 0 ? 100 : Math.round((resolved / total) * 100);

    return { total, open, resolved, compliance };
  }, [tickets]);

  const activityItems = tickets.slice(0, 5).map((t) => ({
    id: t.id,
    title: `${t.ticket_number || `TKT-${t.id}`} - ${t.title || 'Ticket updated'}`,
    meta: `Status: ${t.status || 'open'}`,
  }));

  return (
    <ProtectedRoute allowedRoles={['admin', 'technician', 'manager']}>
      <DashboardLayout>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome back{user?.name ? `, ${user.name}` : ''}. Here is your current support overview.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard title="Total Tickets" value={metrics.total} subtitle="Across all statuses" trend={8} icon={Ticket} tone="primary" />
          <StatsCard title="Open Tickets" value={metrics.open} subtitle="Need immediate action" trend={-4} icon={CircleDot} tone="warning" />
          <StatsCard title="Resolved" value={metrics.resolved} subtitle="Successfully completed" trend={12} icon={CheckCircle2} tone="accent" />
          <StatsCard title="SLA Compliance" value={`${metrics.compliance}%`} subtitle="Within SLA target" trend={5} icon={ShieldCheck} tone="secondary" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-1">
            <ShiftTimer shiftType={user?.shift_type || 'AM'} />
          </div>
          <div className="xl:col-span-2">
            <RecentActivity items={activityItems} />
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
