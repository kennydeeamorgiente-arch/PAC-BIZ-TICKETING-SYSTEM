'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bot, ShieldCheck, Inbox, BarChart3 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Button from '@/components/common/Button';
import Badge from '@/components/common/Badge';
import LoadingState from '@/components/common/LoadingState';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const PANEL = 'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm';
const SOFT_PANEL = 'rounded-xl border border-gray-200 bg-gray-50 p-3';

export default function AiReviewPage() {
  const [queueStatus, setQueueStatus] = useState('pending');
  const [queuePage, setQueuePage] = useState(1);
  const [queueLimit, setQueueLimit] = useState(20);
  const [queuePagination, setQueuePagination] = useState({ total: 0, page: 1, limit: 20, pages: 1 });
  const [intakeStatus, setIntakeStatus] = useState('new');
  const [intakeDecision, setIntakeDecision] = useState('all');
  const [intakePage, setIntakePage] = useState(1);
  const [intakeLimit, setIntakeLimit] = useState(12);
  const [intakeRows, setIntakeRows] = useState([]);
  const [intakePagination, setIntakePagination] = useState({ total: 0, page: 1, limit: 12, pages: 1 });
  const [queueRows, setQueueRows] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workingId, setWorkingId] = useState(null);
  const [workingIntakeId, setWorkingIntakeId] = useState(null);
  const [overrideForm, setOverrideForm] = useState({
    inferenceId: null,
    priorityCode: 'medium',
    reason: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [queueRes, metricsRes] = await Promise.all([
        api.getAiReviewQueue(queueStatus, queueLimit, queuePage),
        api.getAiReviewMetrics(),
      ]);

      setQueueRows(Array.isArray(queueRes?.data) ? queueRes.data : []);
      setQueuePagination(queueRes?.pagination || { total: 0, page: queuePage, limit: queueLimit, pages: 1 });
      setMetrics(metricsRes?.data || null);
    } catch (e) {
      setQueueRows([]);
      setQueuePagination({ total: 0, page: queuePage, limit: queueLimit, pages: 1 });
      setMetrics(null);
      setError(e?.message || 'Failed to load AI review queue.');
    } finally {
      setLoading(false);
    }
  }, [queueStatus, queueLimit, queuePage]);

  const loadIntake = useCallback(async () => {
    try {
      const response = await api.getAiIntakeQueue({
        status: intakeStatus,
        decision: intakeDecision,
        limit: intakeLimit,
        page: intakePage,
      });
      setIntakeRows(Array.isArray(response?.data) ? response.data : []);
      setIntakePagination(response?.pagination || { total: 0, page: intakePage, limit: intakeLimit, pages: 1 });
    } catch (e) {
      setIntakeRows([]);
      setIntakePagination({ total: 0, page: intakePage, limit: intakeLimit, pages: 1 });
      setError((prev) => prev || e?.message || 'Failed to load intake queue.');
    }
  }, [intakeStatus, intakeDecision, intakeLimit, intakePage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadIntake();
  }, [loadIntake]);

  const reviewedAgreementLabel = useMemo(() => {
    const rate = Number(metrics?.reviewed_agreement_rate);
    if (!Number.isFinite(rate)) return 'N/A';
    return `${Math.round(rate * 100)}%`;
  }, [metrics]);

  useEffect(() => {
    setQueuePage(1);
  }, [queueStatus, queueLimit]);

  useEffect(() => {
    setIntakePage(1);
  }, [intakeStatus, intakeDecision, intakeLimit]);

  const submitReview = async (inferenceId, payload) => {
    setWorkingId(inferenceId);
    setError('');
    try {
      await api.reviewAiInference(inferenceId, payload);
      setOverrideForm({ inferenceId: null, priorityCode: 'medium', reason: '' });
      await loadData();
    } catch (e) {
      setError(e?.message || 'Failed to submit AI review decision.');
    } finally {
      setWorkingId(null);
    }
  };

  const releaseToTicket = async (intakeId) => {
    setWorkingIntakeId(intakeId);
    setError('');
    try {
      await api.releaseAiIntakeEmail(intakeId);
      await loadIntake();
      await loadData();
    } catch (e) {
      setError(e?.message || 'Failed to release intake email to ticket.');
    } finally {
      setWorkingIntakeId(null);
    }
  };

  const dismissIntake = async (intakeId) => {
    setWorkingIntakeId(intakeId);
    setError('');
    try {
      await api.dismissAiIntakeEmail(intakeId);
      await loadIntake();
    } catch (e) {
      setError(e?.message || 'Failed to dismiss intake email.');
    } finally {
      setWorkingIntakeId(null);
    }
  };

  const deleteIntake = async (intakeId) => {
    const ok = window.confirm('Delete this intake email record permanently?');
    if (!ok) return;

    setWorkingIntakeId(intakeId);
    setError('');
    try {
      await api.deleteAiIntakeEmail(intakeId);
      await loadIntake();
    } catch (e) {
      setError(e?.message || 'Failed to delete intake email.');
    } finally {
      setWorkingIntakeId(null);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['technician', 'admin']}>
      <DashboardLayout>
        <div className={`mb-4 ${PANEL}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                <Bot className="h-6 w-6 text-primary-600" />
                AI Review Queue
              </h1>
              <p className="mt-1 text-sm text-gray-500">Review low-confidence AI decisions and apply final priority safely.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 font-semibold text-primary-700">
                Pending: {metrics?.pending_reviews ?? 0}
              </span>
              <span className="rounded-full border border-secondary-200 bg-secondary-50 px-2.5 py-1 font-semibold text-secondary-700">
                Reviewed: {metrics?.reviewed_count ?? 0}
              </span>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        ) : null}

        <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <div className="rounded-xl border border-primary-100 bg-gradient-to-br from-primary-50/70 to-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">Total Inferences</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{metrics?.total_inferences ?? 0}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/70 to-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">Pending Reviews</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{metrics?.pending_reviews ?? 0}</p>
          </div>
          <div className="rounded-xl border border-secondary-100 bg-gradient-to-br from-secondary-50/70 to-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">Reviewed</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{metrics?.reviewed_count ?? 0}</p>
          </div>
          <div className="rounded-xl border border-accent-100 bg-gradient-to-br from-accent-50/70 to-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">Reviewed Agreement</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{reviewedAgreementLabel}</p>
          </div>
        </div>

        <div className={`mb-4 ${PANEL}`}>
          <div className={`flex flex-wrap items-center justify-between gap-2 ${SOFT_PANEL}`}>
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <BarChart3 className="h-4 w-4 text-primary-600" />
                Deep Analytics moved to Reports
              </h2>
              <p className="mt-1 text-xs text-gray-600">
                This page stays focused on AI queue decisions and intake actions. Use Reports for trends and chart-based analysis.
              </p>
            </div>
            <Link
              href="/reports#ai-analytics"
              className="inline-flex rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
            >
              Open AI Analytics
            </Link>
          </div>
        </div>

        <div className={`mb-4 ${PANEL}`}>
          <div className={`mb-3 ${SOFT_PANEL}`}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <ShieldCheck className="h-4 w-4 text-primary-600" />
              Priority Decision Review List
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              Each row is an AI priority decision for a ticket. Review confidence and apply final action.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5 lg:grid-cols-12">
            <select
              value={queueStatus}
              onChange={(e) => setQueueStatus(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm lg:col-span-2"
            >
              <option value="pending">Pending</option>
              <option value="reviewed">Reviewed</option>
              <option value="all">All</option>
            </select>
            <select
              value={queueLimit}
              onChange={(e) => setQueueLimit(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm lg:col-span-2"
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={40}>40 per page</option>
            </select>
            <Button type="button" variant="secondary" onClick={loadData} className="lg:col-span-2">
              Refresh
            </Button>
            <span className="text-xs text-gray-500 lg:col-span-3 lg:justify-self-end">
              {queuePagination.total || 0} items | page {queuePagination.page || 1} / {queuePagination.pages || 1}
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setQueuePage((prev) => Math.max(1, prev - 1))}
              disabled={queuePage <= 1}
              className="lg:col-span-1"
            >
              Prev
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setQueuePage((prev) => Math.min(queuePagination.pages || 1, prev + 1))}
              disabled={queuePage >= (queuePagination.pages || 1)}
              className="lg:col-span-1"
            >
              Next
            </Button>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading AI queue..." />
        ) : queueRows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">No items in this queue.</div>
        ) : (
          <div className="max-h-[68vh] space-y-3 overflow-y-auto pr-1">
            {queueRows.map((row) => {
              const isWorking = Number(workingId) === Number(row.id);
              const isPending = Number(row.needs_review) === 1 && !row.reviewed_at;
              const showOverride = Number(overrideForm.inferenceId) === Number(row.id);
              const ruleScore = Number(row?.rule_hits?.scoring?.severity_score);

              return (
                <article key={row.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {row.ticket_number}: {row.ticket_subject}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Inference #{row.id} | {row.intake_source} | {row.provider} | {row.mode}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge type="priority" value={row.predicted_priority_code || 'medium'} />
                      <span className="text-xs text-gray-500">predicted</span>
                      <Badge type="priority" value={row.applied_priority_code || 'medium'} />
                      <span className="text-xs text-gray-500">applied</span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
                    <div className={SOFT_PANEL}>
                      <p className="text-xs uppercase text-gray-500">Current Ticket Priority</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{row.ticket_current_priority || 'N/A'}</p>
                    </div>
                    <div className={SOFT_PANEL}>
                      <p className="text-xs uppercase text-gray-500">Confidence</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{Math.round(Number(row.confidence || 0) * 100)}%</p>
                      {Number.isFinite(ruleScore) ? (
                        <p className="mt-1 text-[11px] text-gray-500">Rule score: {Math.round(ruleScore)}</p>
                      ) : null}
                    </div>
                    <div className={SOFT_PANEL}>
                      <p className="text-xs uppercase text-gray-500">Created</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{formatDate(row.created_at)}</p>
                    </div>
                    <div className={SOFT_PANEL}>
                      <p className="text-xs uppercase text-gray-500">Review State</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">
                        {isPending ? 'Pending' : `Reviewed${row.reviewed_by_name ? ` by ${row.reviewed_by_name}` : ''}`}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-gray-700">{row.decision_reason || 'No reason logged.'}</p>

                  {isPending ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        loading={isWorking}
                        onClick={() => submitReview(row.id, { decision: 'approve' })}
                      >
                        Approve Applied
                      </Button>
                      <Button
                        type="button"
                        loading={isWorking}
                        onClick={() => submitReview(row.id, { decision: 'apply_predicted' })}
                      >
                        Apply Predicted
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setOverrideForm({ inferenceId: row.id, priorityCode: row.applied_priority_code || 'medium', reason: '' })}
                      >
                        Override
                      </Button>
                    </div>
                  ) : null}

                  {showOverride ? (
                    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                        <select
                          value={overrideForm.priorityCode}
                          onChange={(e) => setOverrideForm((prev) => ({ ...prev, priorityCode: e.target.value }))}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                        >
                          {PRIORITIES.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={overrideForm.reason}
                          onChange={(e) => setOverrideForm((prev) => ({ ...prev, reason: e.target.value }))}
                          placeholder="Reason for override"
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm md:col-span-2"
                        />
                      </div>
                      <div className="mt-2 flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setOverrideForm({ inferenceId: null, priorityCode: 'medium', reason: '' })}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          loading={isWorking}
                          onClick={() => submitReview(row.id, {
                            decision: 'override',
                            priority_code: overrideForm.priorityCode,
                            reason: overrideForm.reason,
                          })}
                        >
                          Save Override
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        <div className={`mb-4 mt-5 ${PANEL}`}>
          <div className={`mb-3 ${SOFT_PANEL}`}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Inbox className="h-4 w-4 text-accent-600" />
              Email Intake Review (Filtered Emails)
            </h3>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
              <select
                value={intakeStatus}
                onChange={(e) => setIntakeStatus(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm lg:col-span-2"
              >
                <option value="new">New</option>
                <option value="released">Released</option>
                <option value="dismissed">Dismissed</option>
                <option value="all">All Statuses</option>
              </select>
              <select
                value={intakeDecision}
                onChange={(e) => setIntakeDecision(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm lg:col-span-2"
              >
                <option value="all">All Decisions</option>
                <option value="quarantine">Quarantine</option>
                <option value="review">Review</option>
                <option value="ignore">Ignore</option>
              </select>
              <select
                value={intakeLimit}
                onChange={(e) => setIntakeLimit(Number(e.target.value))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm lg:col-span-2"
              >
                <option value={8}>8 per page</option>
                <option value={12}>12 per page</option>
                <option value={20}>20 per page</option>
              </select>
              <Button type="button" variant="secondary" onClick={loadIntake} className="lg:col-span-2">
                Refresh Intake Queue
              </Button>
              <span className="text-xs text-gray-500 lg:col-span-2 lg:justify-self-end">
                {intakePagination.total || 0} items | page {intakePagination.page || 1} / {intakePagination.pages || 1}
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIntakePage((prev) => Math.max(1, prev - 1))}
                disabled={intakePage <= 1}
                className="lg:col-span-1"
              >
                Prev
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIntakePage((prev) => Math.min(intakePagination.pages || 1, prev + 1))}
                disabled={intakePage >= (intakePagination.pages || 1)}
                className="lg:col-span-1"
              >
                Next
              </Button>
            </div>
          </div>

          {intakeRows.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
              No filtered emails in this view.
            </div>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {intakeRows.map((row) => {
                const isWorking = Number(workingIntakeId) === Number(row.id);
                const primaryReason = Array.isArray(row.reasons) && row.reasons.length > 0 ? row.reasons[0] : 'No reason logged';
                return (
                  <article key={row.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3 transition-shadow hover:shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{row.subject}</p>
                        <p className="text-xs text-gray-500">
                          From: {row.from_email} | Decision: {row.decision} | Risk: {row.risk_level} ({row.risk_score})
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge type="status" value={row.status || 'new'} />
                        <span className="text-xs text-gray-500">{formatDate(row.created_at)}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-700">{primaryReason}</p>
                    {row.body_snippet ? <p className="mt-1 text-xs text-gray-500">{row.body_snippet}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.status !== 'released' ? (
                        <Button type="button" loading={isWorking} onClick={() => releaseToTicket(row.id)}>
                          Add to Ticket
                        </Button>
                      ) : (
                        <Link
                          href={row.released_ticket_id ? `/tickets/${row.released_ticket_id}` : '/tickets'}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          View Ticket {row.released_ticket_number ? `(${row.released_ticket_number})` : ''}
                        </Link>
                      )}
                      {row.status === 'new' ? (
                        <Button type="button" variant="secondary" loading={isWorking} onClick={() => dismissIntake(row.id)}>
                          Dismiss
                        </Button>
                      ) : null}
                      {row.status !== 'released' ? (
                        <Button type="button" variant="danger" loading={isWorking} onClick={() => deleteIntake(row.id)}>
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
