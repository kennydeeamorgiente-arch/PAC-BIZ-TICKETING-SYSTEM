'use client';

import { useEffect, useMemo, useState } from 'react';
import { KanbanSquare, Table2, Search, ArrowDown, ArrowUp } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import TicketCard from '@/components/tickets/TicketCard';
import TicketTable from '@/components/tickets/TicketTable';
import { useTickets } from '@/hooks/useTickets';
import api from '@/lib/api';

const STATUS_COLUMNS = [
  { key: 'new', label: 'New' },
  { key: 'active', label: 'Active' },
  { key: 'complete', label: 'Complete' },
];

const STATUS_OPTIONS_FALLBACK = ['new', 'open', 'in_progress', 'reopened', 'resolved', 'closed'];
const PRIORITY_OPTIONS = ['critical', 'high', 'medium', 'low'];
const PRIORITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

function statusToList(status) {
  if (status === 'new') return 'new';
  if (status === 'resolved' || status === 'closed' || status === 'deleted') return 'complete';
  return 'active';
}

function formatStatusLabel(status) {
  return String(status || '').replaceAll('_', ' ');
}

function formatPriorityLabel(priority) {
  return String(priority || '').replaceAll('_', ' ');
}

function compareValues(a, b, direction = 'desc') {
  const dir = direction === 'asc' ? 1 : -1;
  if (a < b) return -1 * dir;
  if (a > b) return 1 * dir;
  return 0;
}

function sortTicketRows(rows, direction) {
  const sortedRows = [...rows];
  sortedRows.sort((a, b) => {
    const pa = PRIORITY_RANK[String(a.priority || 'low').toLowerCase()] || 0;
    const pb = PRIORITY_RANK[String(b.priority || 'low').toLowerCase()] || 0;
    const priorityCmp = compareValues(pa, pb, direction);
    if (priorityCmp !== 0) return priorityCmp;
    return compareValues(
      new Date(a.created_at || 0).getTime(),
      new Date(b.created_at || 0).getTime(),
      direction
    );
  });
  return sortedRows;
}

export default function TicketsPage() {
  const { tickets, loading, error } = useTickets({
    autoRefresh: true,
    refreshIntervalMs: 20000,
  });
  const [viewMode, setViewMode] = useState('kanban');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [tableSortDir, setTableSortDir] = useState('desc');
  const [columnSortDir, setColumnSortDir] = useState({ new: 'desc', active: 'desc', complete: 'desc' });
  const [pageSize, setPageSize] = useState(15);
  const [tablePage, setTablePage] = useState(1);
  const [columnPageSize, setColumnPageSize] = useState(6);
  const [columnPage, setColumnPage] = useState({ new: 1, active: 1, complete: 1 });
  const [statusOptions, setStatusOptions] = useState(STATUS_OPTIONS_FALLBACK);

  useEffect(() => {
    const loadStatusModel = async () => {
      try {
        const response = await api.getTicketStatusModel();
        const statuses = response?.data?.statuses || [];
        if (Array.isArray(statuses) && statuses.length > 0) {
          setStatusOptions(statuses.filter((s) => s.code !== 'deleted').map((s) => s.code));
        }
      } catch {
        setStatusOptions(STATUS_OPTIONS_FALLBACK);
      }
    };

    loadStatusModel();
  }, []);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const status = ticket.status || 'open';
      const priority = String(ticket.priority || 'low').toLowerCase();
      const inStatus = statusFilter === 'all' || status === statusFilter;
      const inPriority = priorityFilter === 'all' || priority === priorityFilter;

      const inSearch =
        q.length === 0 ||
        (ticket.title || '').toLowerCase().includes(q) ||
        (ticket.ticket_number || '').toLowerCase().includes(q) ||
        (ticket.assigned_to_name || '').toLowerCase().includes(q);

      return inStatus && inPriority && inSearch;
    });
  }, [tickets, search, statusFilter, priorityFilter]);

  const tableSortedTickets = useMemo(
    () => sortTicketRows(filteredTickets, tableSortDir),
    [filteredTickets, tableSortDir]
  );

  const kanbanColumns = useMemo(() => {
    const grouped = {
      new: filteredTickets.filter((t) => (t.status_list || statusToList(t.status)) === 'new'),
      active: filteredTickets.filter((t) => (t.status_list || statusToList(t.status)) === 'active'),
      complete: filteredTickets.filter((t) => (t.status_list || statusToList(t.status)) === 'complete'),
    };

    return {
      new: sortTicketRows(grouped.new, columnSortDir.new || 'desc'),
      active: sortTicketRows(grouped.active, columnSortDir.active || 'desc'),
      complete: sortTicketRows(grouped.complete, columnSortDir.complete || 'desc'),
    };
  }, [filteredTickets, columnSortDir]);

  const tableTotalPages = Math.max(1, Math.ceil(tableSortedTickets.length / pageSize));
  const safeTablePage = Math.min(tablePage, tableTotalPages);
  const tablePageRows = useMemo(() => {
    const start = (safeTablePage - 1) * pageSize;
    return tableSortedTickets.slice(start, start + pageSize);
  }, [tableSortedTickets, safeTablePage, pageSize]);

  const pagedColumnTickets = useMemo(() => {
    const out = {};
    for (const col of STATUS_COLUMNS) {
      const rows = kanbanColumns[col.key] || [];
      const page = Math.max(1, Number(columnPage[col.key] || 1));
      const totalPages = Math.max(1, Math.ceil(rows.length / columnPageSize));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * columnPageSize;
      out[col.key] = {
        rows: rows.slice(start, start + columnPageSize),
        total: rows.length,
        page: safePage,
        totalPages,
      };
    }
    return out;
  }, [kanbanColumns, columnPage, columnPageSize]);

  const toggleColumnSort = (columnKey) => {
    setColumnSortDir((prev) => ({
      ...prev,
      [columnKey]: (prev[columnKey] || 'desc') === 'desc' ? 'asc' : 'desc',
    }));
  };

  return (
    <ProtectedRoute allowedRoles={['technician', 'admin']}>
      <DashboardLayout>
        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
          <p className="mt-1 text-sm text-gray-500">Track and manage support tickets in Kanban or Table view.</p>
        </div>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="grid w-full grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-2.5 lg:grid-cols-12">
            <div className="relative lg:col-span-12 xl:col-span-4">
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
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-secondary-500 focus:outline-none lg:col-span-6 xl:col-span-2"
            >
              <option value="all">All Statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {formatStatusLabel(status)}
                </option>
              ))}
            </select>
              <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-secondary-500 focus:outline-none lg:col-span-6 xl:col-span-2"
            >
              <option value="all">All Priorities</option>
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>
                  {formatPriorityLabel(priority)}
                </option>
              ))}
            </select>
            <div className="inline-flex w-full overflow-hidden rounded-lg border border-gray-300 bg-white lg:col-span-12 xl:col-span-4 xl:w-full">
              <button
                onClick={() => setViewMode('kanban')}
                className={`inline-flex flex-1 items-center justify-center whitespace-nowrap px-3 py-2 text-sm ${viewMode === 'kanban' ? 'bg-primary-500 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <KanbanSquare className="mr-1 h-4 w-4" /> Kanban
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`inline-flex flex-1 items-center justify-center whitespace-nowrap px-3 py-2 text-sm ${viewMode === 'table' ? 'bg-primary-500 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <Table2 className="mr-1 h-4 w-4" /> Table
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            API warning: {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600">
            Loading latest tickets...
          </div>
        ) : null}

        {viewMode === 'table' ? (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setTableSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700"
              >
                <span className="mr-1">Sort Priority</span>
                {tableSortDir === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
              </button>
            </div>
            <TicketTable tickets={tablePageRows} />
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-500">
                {tableSortedTickets.length} tickets | page {safeTablePage} / {tableTotalPages}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
                >
                  <option value={10}>10/page</option>
                  <option value={15}>15/page</option>
                  <option value={25}>25/page</option>
                </select>
                <button
                  type="button"
                  onClick={() => setTablePage((prev) => Math.max(1, prev - 1))}
                  disabled={safeTablePage <= 1}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setTablePage((prev) => Math.min(tableTotalPages, prev + 1))}
                  disabled={safeTablePage >= tableTotalPages}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {STATUS_COLUMNS.map((column) => (
              <section key={column.key} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700">{column.label}</h2>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-600">
                      {pagedColumnTickets[column.key].total}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleColumnSort(column.key)}
                      className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700"
                      title={`Toggle ${column.label} sort direction`}
                      aria-label={`Sort ${column.label} ${(columnSortDir[column.key] || 'desc') === 'desc' ? 'descending' : 'ascending'}`}
                    >
                      {(columnSortDir[column.key] || 'desc') === 'desc' ? (
                        <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUp className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                  {pagedColumnTickets[column.key].rows.length > 0 ? (
                    pagedColumnTickets[column.key].rows.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-center text-xs text-gray-500">
                      No tickets
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-2 py-1.5">
                  <span className="text-[11px] text-gray-500">
                    page {pagedColumnTickets[column.key].page} / {pagedColumnTickets[column.key].totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setColumnPage((prev) => ({
                          ...prev,
                          [column.key]: Math.max(1, Number(prev[column.key] || 1) - 1),
                        }))
                      }
                      disabled={pagedColumnTickets[column.key].page <= 1}
                      className="rounded border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setColumnPage((prev) => ({
                          ...prev,
                          [column.key]: Math.min(
                            pagedColumnTickets[column.key].totalPages,
                            Number(prev[column.key] || 1) + 1
                          ),
                        }))
                      }
                      disabled={pagedColumnTickets[column.key].page >= pagedColumnTickets[column.key].totalPages}
                      className="rounded border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}

        {viewMode === 'kanban' ? (
          <div className="mt-3 flex justify-end">
            <select
              value={columnPageSize}
              onChange={(e) => setColumnPageSize(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs"
            >
              <option value={4}>4 per column</option>
              <option value={6}>6 per column</option>
              <option value={8}>8 per column</option>
            </select>
          </div>
        ) : null}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
