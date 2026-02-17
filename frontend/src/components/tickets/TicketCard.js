import Link from 'next/link';
import { Clock3, User2 } from 'lucide-react';

function priorityClasses(priority) {
  switch ((priority || '').toLowerCase()) {
    case 'critical':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'high':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'medium':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export default function TicketCard({ ticket }) {
  const id = ticket?.id;
  const title = ticket?.title || 'Untitled ticket';
  const number = ticket?.ticket_number || `TKT-${id}`;
  const description = ticket?.description || 'No description provided.';
  const assignedTo = ticket?.assigned_to_name || 'Unassigned';
  const priority = ticket?.priority || 'low';

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500">{number}</p>
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        <span className={`rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${priorityClasses(priority)}`}>
          {priority}
        </span>
      </div>

      <p className="line-clamp-2 text-xs text-gray-600">{description}</p>

      <div className="mt-4 space-y-2 text-xs text-gray-500">
        <div className="flex items-center">
          <User2 className="mr-1 h-4 w-4" />
          {assignedTo}
        </div>
        <div className="flex items-center">
          <Clock3 className="mr-1 h-4 w-4" />
          {ticket?.created_at ? new Date(ticket.created_at).toLocaleString() : 'No date'}
        </div>
      </div>

      <Link
        href={`/tickets/${id}`}
        className="mt-4 inline-flex rounded-lg bg-secondary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-secondary-600"
      >
        View details
      </Link>
    </article>
  );
}
