'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import LoadingState from '@/components/common/LoadingState';
import DashboardLayout from '@/components/layout/DashboardLayout';

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const normalizedRole =
    user?.role === 'agent' || user?.role === 'user' ? 'technician' : user?.role;

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
        return;
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(normalizedRole)) {
        router.push('/dashboard');
      }
    }
  }, [user, loading, router, allowedRoles, normalizedRole]);

  if (loading) {
    return (
      <DashboardLayout>
        <LoadingState label="Loading account..." />
      </DashboardLayout>
    );
  }

  if (!user || (allowedRoles.length > 0 && !allowedRoles.includes(normalizedRole))) {
    return null;
  }

  return children;
}
