'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';

function normalizeRows(responseData) {
  if (Array.isArray(responseData?.data)) return responseData.data;
  if (Array.isArray(responseData)) return responseData;
  return [];
}

export function useTickets({
  autoRefresh = false,
  refreshIntervalMs = 30000,
} = {}) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await api.getTickets();
      setTickets(normalizeRows(data));
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.message || 'Failed to load tickets');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!autoRefresh || refreshIntervalMs <= 0) return undefined;

    const id = setInterval(() => {
      loadTickets();
    }, refreshIntervalMs);

    return () => clearInterval(id);
  }, [autoRefresh, refreshIntervalMs, loadTickets]);

  const summary = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => ['new', 'open'].includes(t.status)).length;
    const inProgress = tickets.filter((t) => ['in_progress', 'reopened'].includes(t.status)).length;
    const resolved = tickets.filter((t) => ['resolved', 'closed'].includes(t.status)).length;

    return {
      total,
      open,
      inProgress,
      resolved,
    };
  }, [tickets]);

  return {
    tickets,
    loading,
    error,
    summary,
    lastUpdated,
    refresh: loadTickets,
  };
}
