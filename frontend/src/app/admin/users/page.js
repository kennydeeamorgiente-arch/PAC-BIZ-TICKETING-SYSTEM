'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, UserCog, Search, ShieldAlert } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import api from '@/lib/api';

const ROLES = ['technician', 'admin'];

function roleClass(role) {
  if (role === 'admin') return 'bg-red-100 text-red-700';
  if (role === 'technician' || role === 'agent') return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-700';
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    username: '',
    email: '',
    full_name: '',
    role: 'technician',
    shift_type: 'AM',
  });

  const loadUsers = async () => {
    setLoading(true);
    setMessage('');
    try {
      const data = await api.getUsers();
      const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setUsers(rows);
    } catch (e) {
      setUsers([]);
      setMessage(e?.message || 'Failed to load users from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const inRole = roleFilter === 'all' || (u.role || '').toLowerCase() === roleFilter;
      const inSearch =
        q.length === 0 ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.full_name || '').toLowerCase().includes(q);
      return inRole && inSearch;
    });
  }, [users, search, roleFilter]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const payload = {
        ...form,
        password: 'admin123',
      };

      await api.createUser(payload);
      setForm({ username: '', email: '', full_name: '', role: 'technician', shift_type: 'AM' });
      setFormOpen(false);
      setMessage('User created successfully.');
      await loadUsers();
    } catch (e) {
      setMessage(e?.message || 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user) => {
    const nextActive = user.is_active ? 0 : 1;
    try {
      await api.updateUser(user.id, { is_active: nextActive });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: nextActive } : u)));
    } catch (e) {
      setMessage(e?.message || 'Failed to update user status.');
    }
  };

  return (
    <ProtectedRoute allowedRoles={['technician', 'admin']}>
      <DashboardLayout>
        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">User Management</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-300">Create users, assign roles, and manage account access.</p>
        </div>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid w-full grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-2.5 lg:grid-cols-4 dark:border-slate-700 dark:bg-slate-800/70">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by username, email, name"
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="all">All Roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              onClick={() => setFormOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-lg bg-secondary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-secondary-600"
            >
              <Plus className="mr-1 h-4 w-4" /> New User
            </button>
          </div>
        </div>

        {message ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {message}
          </div>
        ) : null}

        {formOpen ? (
          <form onSubmit={handleCreate} className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center">
              <UserCog className="mr-2 h-5 w-5 text-secondary-700" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Create User</h2>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <input
                required
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                placeholder="Username"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="Email"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <input
                required
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                placeholder="Full name"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                value={form.shift_type}
                onChange={(e) => setForm((p) => ({ ...p, shift_type: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
                <option value="GY">GY</option>
              </select>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save User'}
              </button>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 dark:border-slate-600 dark:text-slate-200"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading users...</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-slate-800/80">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-slate-300">User</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-slate-300">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-slate-300">Shift</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-slate-300">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-slate-300">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-slate-100">{u.full_name || u.username}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${roleClass((u.role || '').toLowerCase())}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-slate-300">{u.shift_type || 'N/A'}</td>
                      <td className="px-4 py-3">
                        {u.is_active ? (
                          <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Active</span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleActive(u)}
                          className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-gray-500 dark:text-slate-400">No users found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
