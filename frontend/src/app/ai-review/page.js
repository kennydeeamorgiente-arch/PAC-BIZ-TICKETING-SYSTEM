'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Button from '@/components/common/Button';
import Badge from '@/components/common/Badge';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';

const PRIORITIES = ['low', 'medium', 'high', 'critical'];

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
  const [windowDays, setWindowDays] = useState(30);
  const [queueRows, setQueueRows] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [dashboard, setDashboard] = useState(null);
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

  const loadDashboard = useCallback(async () => {
    try {
      const response = await api.getAiReviewDashboard(windowDays);
      setDashboard(response?.data || null);
    } catch (e) {
      setDashboard(null);
      setError((prev) => prev || e?.message || 'Failed to load AI dashboard.');
    }
  }, [windowDays]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadIntake();
  }, [loadIntake]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

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
      await loadDashboard();
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
        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">AI Review Queue</h1>
          <p className="mt-1 text-sm text-gray-500">Review low-confidence AI decisions and apply final priority safely.</p>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        ) : null}

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">Total Inferences</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{metrics?.total_inferences ?? 0}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">Pending Reviews</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{metrics?.pending_reviews ?? 0}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">Reviewed</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{metrics?.reviewed_count ?? 0}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">Reviewed Agreement</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{reviewedAgreementLabel}</p>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5">
            <label className="text-xs font-semibold uppercase text-gray-500">Analytics Window</label>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <Button type="button" variant="secondary" onClick={loadDashboard}>
              Refresh Analytics
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase text-gray-500">Window Inferences</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{dashboard?.summary?.total_inferences_window ?? 0}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase text-gray-500">Email Inferences</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{dashboard?.summary?.email_inferences_window ?? 0}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase text-gray-500">Override Rate</p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {Number.isFinite(Number(dashboard?.summary?.reviewed_override_rate))
                  ? `${Math.round(Number(dashboard.summary.reviewed_override_rate) * 100)}%`
                  : 'N/A'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase text-gray-500">Avg Confidence</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{Math.round(Number(dashboard?.summary?.avg_confidence_window || 0) * 100)}%</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="rounded-lg border border-gray-200 bg-white p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Source Quality</h3>
              {Array.isArray(dashboard?.source_quality) && dashboard.source_quality.length > 0 ? (
                <div className="space-y-2">
                  {dashboard.source_quality.map((row) => {
                    const reviewedCount = Number(row.reviewed_count || 0);
                    const reviewedAgree = Number(row.reviewed_agree_count || 0);
                    const reviewedOverride = Number(row.reviewed_override_count || 0);
                    const agreeRate = reviewedCount > 0 ? Math.round((reviewedAgree / reviewedCount) * 100) : null;
                    const overrideRate = reviewedCount > 0 ? Math.round((reviewedOverride / reviewedCount) * 100) : null;

                    return (
                      <div key={row.intake_source} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                        <p className="font-semibold">{row.intake_source}</p>
                        <p>Total: {row.total} | Needs review: {row.needs_review_count} | Avg conf: {Math.round(Number(row.avg_confidence || 0) * 100)}%</p>
                        <p>Agreement: {agreeRate === null ? 'N/A' : `${agreeRate}%`} | Overrides: {overrideRate === null ? 'N/A' : `${overrideRate}%`}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No source quality data in selected window.</p>
              )}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Noise Blocking Outcomes</h3>
              {Array.isArray(dashboard?.noise_outcomes) && dashboard.noise_outcomes.length > 0 ? (
                <div className="space-y-2">
                  {dashboard.noise_outcomes.map((row) => (
                    <div key={row.decision} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                      <p className="font-semibold">{row.decision}</p>
                      <p>Total: {row.total} | Avg risk: {Math.round(Number(row.avg_risk_score || 0))}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No noise outcome data yet.</p>
              )}
            </section>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="rounded-lg border border-gray-200 bg-white p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Top Noisy Senders</h3>
              {Array.isArray(dashboard?.top_noisy_senders) && dashboard.top_noisy_senders.length > 0 ? (
                <div className="space-y-2">
                  {dashboard.top_noisy_senders.map((row) => (
                    <div key={row.from_email} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                      <p className="font-semibold">{row.from_email}</p>
                      <p>Filtered emails: {row.total}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No blocked sender data yet.</p>
              )}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-3">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Weekly Trend</h3>
              {Array.isArray(dashboard?.weekly_trend) && dashboard.weekly_trend.length > 0 ? (
                <div className="space-y-2">
                  {dashboard.weekly_trend.map((row) => (
                    <div key={row.week_start} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                      <p className="font-semibold">Week of {row.week_start}</p>
                      <p>Total: {row.total} | Needs review: {row.needs_review_count} | Reviewed: {row.reviewed_count}</p>
                      <p>Avg confidence: {Math.round(Number(row.avg_confidence || 0) * 100)}%</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No weekly data in selected window.</p>
              )}
            </section>
          </div>

        </div>

        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-2.5">
            <h3 className="text-sm font-semibold text-gray-900">Priority Decision Review List</h3>
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
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading AI queue...</div>
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
                <article key={row.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
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
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs uppercase text-gray-500">Current Ticket Priority</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{row.ticket_current_priority || 'N/A'}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs uppercase text-gray-500">Confidence</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{Math.round(Number(row.confidence || 0) * 100)}%</p>
                      {Number.isFinite(ruleScore) ? (
                        <p className="mt-1 text-[11px] text-gray-500">Rule score: {Math.round(ruleScore)}</p>
                      ) : null}
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs uppercase text-gray-500">Created</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{formatDate(row.created_at)}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
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
                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
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

        <div className="mb-4 mt-5 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-2.5">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Email Intake Review (Filtered Emails)</h3>
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
                  <article key={row.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
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
