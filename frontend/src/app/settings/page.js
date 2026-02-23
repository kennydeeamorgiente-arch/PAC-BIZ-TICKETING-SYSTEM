'use client';

import { useEffect, useState } from 'react';
import { Save, BellRing, LockKeyhole, ShieldCheck, MoonStar, MonitorCog, Mail, Bell } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

const PREF_KEY = 'pacbiz_settings';

function PreferenceTile({ icon: Icon, title, description, enabled, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-xl border p-4 text-left transition-all ${
        enabled
          ? 'border-secondary-300 bg-secondary-50/70 shadow-sm dark:border-secondary-500/50 dark:bg-secondary-500/15'
          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-700 dark:bg-slate-900/80 dark:hover:border-slate-500'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`rounded-lg p-2 ${
              enabled
                ? 'bg-secondary-100 text-secondary-700 dark:bg-secondary-500/25 dark:text-secondary-100'
                : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{description}</p>
          </div>
        </div>
        <span
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-secondary-500' : 'bg-gray-300 dark:bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform dark:bg-slate-100 ${
              enabled ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </span>
      </div>
    </button>
  );
}

export default function SettingsPage() {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [prefs, setPrefs] = useState({
    emailAlerts: true,
    browserAlerts: true,
    darkMode: false,
    autoRefresh: true,
  });

  const [savingSection, setSavingSection] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPrefs((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore invalid local data
    }
  }, []);

  const savePassword = async (e) => {
    e.preventDefault();
    setMessage('');

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setMessage('Please fill all password fields.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage('New password and confirmation do not match.');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setMessage('New password must be at least 6 characters.');
      return;
    }

    setSavingSection('password');

    // Backend password endpoint is not yet available in current phase.
    setTimeout(() => {
      setSavingSection('');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('Password change request saved (endpoint pending).');
    }, 400);
  };

  const savePreferences = async () => {
    setSavingSection('prefs');
    setMessage('');

    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
      document.documentElement.classList.toggle('dark', Boolean(prefs.darkMode));
      setMessage('Preferences saved.');
    } catch {
      setMessage('Failed to save preferences in browser storage.');
    } finally {
      setSavingSection('');
    }
  };

  const requestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setMessage('Browser notifications are not supported in this browser.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setMessage('Browser notifications enabled.');
      new Notification('PAC BIZ Notifications', {
        body: 'You will now receive browser alerts.',
      });
    } else {
      setMessage('Notification permission was denied.');
    }
  };

  return (
    <ProtectedRoute allowedRoles={['technician', 'admin']}>
      <DashboardLayout>
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Manage web app security, notifications, and interface preferences.</p>
        </div>

        {message ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {message}
          </div>
        ) : null}

        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center">
              <LockKeyhole className="mr-2 h-5 w-5 text-primary-600" />
              <h2 className="text-sm font-semibold text-gray-900">Security</h2>
            </div>

            <form onSubmit={savePassword} className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                placeholder="Current password"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                placeholder="New password"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                placeholder="Confirm new password"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />

              <div className="lg:col-span-3">
                <button
                  type="submit"
                  disabled={savingSection === 'password'}
                  className="inline-flex items-center rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  <ShieldCheck className="mr-1 h-4 w-4" />
                  {savingSection === 'password' ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-violet-900/50 dark:bg-slate-950/80">
            <div className="mb-4 flex items-center">
              <BellRing className="mr-2 h-5 w-5 text-primary-600 dark:text-violet-300" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Preferences</h2>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <PreferenceTile
                icon={Mail}
                title="Email Alerts"
                description="Receive ticket updates in your email inbox."
                enabled={prefs.emailAlerts}
                onToggle={() => setPrefs((p) => ({ ...p, emailAlerts: !p.emailAlerts }))}
              />
              <PreferenceTile
                icon={Bell}
                title="Browser Notifications"
                description="Show desktop notifications for assignments and SLA warnings."
                enabled={prefs.browserAlerts}
                onToggle={() => setPrefs((p) => ({ ...p, browserAlerts: !p.browserAlerts }))}
              />
              <PreferenceTile
                icon={MonitorCog}
                title="Auto Refresh Data"
                description="Keep ticket data synced in real-time views."
                enabled={prefs.autoRefresh}
                onToggle={() => setPrefs((p) => ({ ...p, autoRefresh: !p.autoRefresh }))}
              />
              <PreferenceTile
                icon={MoonStar}
                title="Dark Mode"
                description="Switch to a darker interface theme."
                enabled={prefs.darkMode}
                onToggle={() => setPrefs((p) => ({ ...p, darkMode: !p.darkMode }))}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={savePreferences}
                disabled={savingSection === 'prefs'}
                className="inline-flex items-center rounded-lg bg-secondary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-secondary-600 disabled:opacity-50"
              >
                <Save className="mr-1 h-4 w-4" />
                {savingSection === 'prefs' ? 'Saving...' : 'Save Preferences'}
              </button>
              <button
                onClick={requestBrowserPermission}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Enable Browser Permission
              </button>
            </div>
          </section>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
