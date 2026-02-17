'use client';

import { useEffect, useMemo, useState } from 'react';
import { KanbanSquare, Table2, Search } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import TicketCard from '@/components/tickets/TicketCard';
import TicketTable from '@/components/tickets/TicketTable';
import api from '@/lib/api';

const STATUS_COLUMNS = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved/Closed' },
];

export default function TicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [viewMode, setViewMode] = useState('kanban');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
            { id: 1, ticket_number: 'TKT-0001', title: 'Cannot access email', status: 'open', priority: 'high', assigned_to_name: 'John Smith' },
            { id: 2, ticket_number: 'TKT-0002', title: 'Printer not working', status: 'in_progress', priority: 'medium', assigned_to_name: 'Jane Doe' },
            { id: 3, ticket_number: 'TKT-0003', title: 'Software install request', status: 'resolved', priority: 'low', assigned_to_name: null },
          ]);
        }
      }
    };

    loadTickets();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const status = ticket.status || 'open';
      const inStatus =
        statusFilter === 'all' ||
        (statusFilter === 'resolved' && (status === 'resolved' || status === 'closed')) ||
        status === statusFilter;

      const inSearch =
        q.length === 0 ||
        (ticket.title || '').toLowerCase().includes(q) ||
        (ticket.ticket_number || '').toLowerCase().includes(q) ||
        (ticket.assigned_to_name || '').toLowerCase().includes(q);

      return inStatus && inSearch;
    });
  }, [tickets, search, statusFilter]);

  const kanbanColumns = useMemo(() => {
    return {
      open: filteredTickets.filter((t) => t.status === 'open'),
      in_progress: filteredTickets.filter((t) => t.status === 'in_progress'),
      resolved: filteredTickets.filter((t) => t.status === 'resolved' || t.status === 'closed'),
    };
  }, [filteredTickets]);

  return (
    <ProtectedRoute allowedRoles={['admin', 'technician', 'manager']}>
      <DashboardLayout>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
            <p className="mt-1 text-sm text-gray-500">Track and manage support tickets in Kanban or Table view.</p>
          </div>

          <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 bg-white">
            <button
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center px-3 py-2 text-sm ${viewMode === 'kanban' ? 'bg-primary-500 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <KanbanSquare className="mr-1 h-4 w-4" /> Kanban
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center px-3 py-2 text-sm ${viewMode === 'table' ? 'bg-primary-500 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <Table2 className="mr-1 h-4 w-4" /> Table
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ticket, title, assigned user"
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-secondary-500 focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-secondary-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved / Closed</option>
          </select>
        </div>

        {viewMode === 'table' ? (
          <TicketTable tickets={filteredTickets} />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {STATUS_COLUMNS.map((column) => (
              <section key={column.key} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700">{column.label}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-600">
                    {kanbanColumns[column.key].length}
                  </span>
                </div>

                <div className="space-y-3">
                  {kanbanColumns[column.key].length > 0 ? (
                    kanbanColumns[column.key].map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-center text-xs text-gray-500">
                      No tickets
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
