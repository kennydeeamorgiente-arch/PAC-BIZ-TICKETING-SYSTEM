import Link from 'next/link';

function priorityClasses(priority) {
  switch ((priority || '').toLowerCase()) {
    case 'critical':
      return 'bg-red-100 text-red-700';
    case 'high':
      return 'bg-orange-100 text-orange-700';
    case 'medium':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export default function TicketTable({ tickets }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Ticket</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Priority</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Assigned To</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Created</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{ticket.ticket_number || `TKT-${ticket.id}`}</div>
                  <div className="text-xs text-gray-500">{ticket.title || 'Untitled ticket'}</div>
                </td>
                <td className="px-4 py-3 capitalize text-gray-700">{ticket.status || 'open'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${priorityClasses(ticket.priority)}`}>
                    {ticket.priority || 'low'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{ticket.assigned_to_name || 'Unassigned'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : 'No date'}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/tickets/${ticket.id}`} className="text-secondary-700 hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  No tickets found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
