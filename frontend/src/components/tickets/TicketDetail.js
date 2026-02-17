import { User2, Flag, FolderOpen, CalendarClock, Hash } from 'lucide-react';

function badgeClass(label) {
  const v = (label || '').toLowerCase();
  if (v === 'critical') return 'bg-red-100 text-red-700 border-red-200';
  if (v === 'high') return 'bg-orange-100 text-orange-700 border-orange-200';
  if (v === 'medium') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (v === 'resolved' || v === 'closed') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (v === 'in_progress') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

export default function TicketDetail({ ticket }) {
  if (!ticket) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
        Ticket not found.
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{ticket.title || 'Untitled ticket'}</h2>
          <p className="mt-1 text-sm text-gray-500">{ticket.ticket_number || `TKT-${ticket.id}`}</p>
        </div>

        <div className="flex gap-2">
          <span className={`rounded-md border px-2 py-1 text-xs font-semibold capitalize ${badgeClass(ticket.status)}`}>
            {(ticket.status || 'open').replace('_', ' ')}
          </span>
          <span className={`rounded-md border px-2 py-1 text-xs font-semibold capitalize ${badgeClass(ticket.priority)}`}>
            {ticket.priority || 'low'}
          </span>
        </div>
      </div>

      <div className="mb-6 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
        {ticket.description || 'No description provided.'}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-1 flex items-center text-xs uppercase text-gray-500"><User2 className="mr-1 h-4 w-4" /> Assigned To</p>
          <p className="text-sm font-medium text-gray-900">{ticket.assigned_to_name || 'Unassigned'}</p>
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-1 flex items-center text-xs uppercase text-gray-500"><Flag className="mr-1 h-4 w-4" /> Priority</p>
          <p className="text-sm font-medium capitalize text-gray-900">{ticket.priority || 'low'}</p>
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-1 flex items-center text-xs uppercase text-gray-500"><FolderOpen className="mr-1 h-4 w-4" /> Category</p>
          <p className="text-sm font-medium text-gray-900">{ticket.category || 'N/A'}</p>
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-1 flex items-center text-xs uppercase text-gray-500"><CalendarClock className="mr-1 h-4 w-4" /> Created</p>
          <p className="text-sm font-medium text-gray-900">
            {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : 'No date'}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-1 flex items-center text-xs uppercase text-gray-500"><Hash className="mr-1 h-4 w-4" /> Ticket ID</p>
          <p className="text-sm font-medium text-gray-900">{ticket.id}</p>
        </div>
      </div>
    </section>
  );
}
