'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DOMPurify from 'isomorphic-dompurify';
import { ArrowLeft, AlertCircle, UserPlus, Send, Paperclip, X } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import SLATimer from '@/components/tickets/SLATimer';
import Badge from '@/components/common/Badge';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import LoadingState from '@/components/common/LoadingState';
import api from '@/lib/api';
import { useSLA } from '@/hooks/useSLA';
import { validateTicketComment } from '@/lib/validation';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

const COMMENT_TEMPLATES_FALLBACK = [
  {
    id: 'acknowledge',
    label: 'Acknowledge Ticket',
    text: 'Hi, we received your ticket and an IT support technician is now reviewing it. We will update you shortly.',
  },
  {
    id: 'need_more_info',
    label: 'Request More Details',
    text: 'Hello, to proceed we need additional details: device name, exact error message, and when the issue started.',
  },
  {
    id: 'resolved_check',
    label: 'Resolution Check',
    text: 'We applied a fix on our side. Please check now and confirm if the issue is resolved.',
  },
  {
    id: 'closure_notice',
    label: 'Close Confirmation',
    text: 'Since the issue appears resolved, we will close this ticket unless we hear back from you.',
  },
];

const STATUS_OPTIONS_FALLBACK = ['new', 'open', 'in_progress', 'reopened', 'resolved', 'closed'];
const HEADER_RIGHT_ACTIONS_MIN_WIDTH = 1080;

export default function TicketDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState(null);
  const [users, setUsers] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [postingComment, setPostingComment] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [commentTemplates, setCommentTemplates] = useState(COMMENT_TEMPLATES_FALLBACK);
  const [statusOptions, setStatusOptions] = useState(STATUS_OPTIONS_FALLBACK);
  const [statusTransitions, setStatusTransitions] = useState({});
  const [showAssign, setShowAssign] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [takingTicket, setTakingTicket] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState('');
  const [sla, setSla] = useState({ totalMinutes: 0, isActive: false, formattedTime: '0h 0m' });
  const [priorityInsights, setPriorityInsights] = useState(null);
  const [priorityForm, setPriorityForm] = useState({ priority: '', reason: '' });
  const [savingPriority, setSavingPriority] = useState(false);
  const [reevaluatingPriority, setReevaluatingPriority] = useState(false);
  const [deletingTicket, setDeletingTicket] = useState(false);
  const [desktopRightActions, setDesktopRightActions] = useState(false);
  const [lock, setLock] = useState(null);
  const [locking, setLocking] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const headerSectionRef = useRef(null);

  const liveSla = useSLA({
    initialMinutes: sla?.totalMinutes || 0,
    isActive: !!sla?.isActive,
    targetMinutes: Number(ticket?.sla_target_minutes || 240),
  });

  const loadData = useCallback(async ({ showLoader = true } = {}) => {
    if (!id) return;

    if (showLoader) setLoading(true);
    setError('');
    try {
      const [ticketData, slaData, commentsData, usersData, lockData] = await Promise.all([
        api.getTicket(id),
        api.get(`/tickets/${id}/sla`),
        api.getTicketComments(id),
        api.getUsers(),
        api.getTicketLock(id),
      ]);

      let priorityData = null;
      try {
        const priorityResponse = await api.getTicketPriorityInsights(id);
        priorityData = priorityResponse?.data || null;
      } catch {
        priorityData = null;
      }

      const ticketRow = ticketData?.data || ticketData || null;
      const slaRow = slaData?.data || slaData || { totalMinutes: 0, isActive: false, formattedTime: '0h 0m' };
      const commentRows = Array.isArray(commentsData?.data) ? commentsData.data : Array.isArray(commentsData) ? commentsData : [];
      const userRows = Array.isArray(usersData?.data) ? usersData.data : Array.isArray(usersData) ? usersData : [];
      const lockRow = lockData?.data || lockData || null;

      setTicket(ticketRow);
      setSla(slaRow);
      setComments(commentRows);
      setUsers(userRows.filter((u) => ['technician', 'agent', 'admin'].includes(String(u.role || '').toLowerCase())));
      setLock(lockRow);
      setPriorityInsights(priorityData);
      setPriorityForm((prev) => ({
        ...prev,
        priority: String(ticketRow?.priority || 'medium').toLowerCase(),
      }));
    } catch (e) {
      setError(e?.message || 'Failed to load ticket data.');
      setTicket(null);
      setUsers([]);
      setComments([]);
      setSla({ totalMinutes: 0, isActive: false, formattedTime: '0h 0m' });
      setPriorityInsights(null);
      setPriorityForm({ priority: '', reason: '' });
      setLock(null);
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [id]);

  const refreshLock = useCallback(async () => {
    if (!id) return;
    try {
      const lockData = await api.getTicketLock(id);
      setLock(lockData?.data || lockData || null);
    } catch {
      setLock(null);
    }
  }, [id]);

  const ensureExternalLock = useCallback(async () => {
    if (!id || !user?.id) return false;
    if (lock?.is_locked && Number(lock?.locked_by_user_id || 0) === Number(user.id)) return true;

    setLocking(true);
    setError('');
    try {
      const resp = await api.lockTicket(id);
      setLock(resp?.data || resp || null);
      return true;
    } catch (e) {
      setError(e?.message || 'Ticket is locked by another user.');
      await refreshLock();
      return false;
    } finally {
      setLocking(false);
    }
  }, [id, lock?.is_locked, lock?.locked_by_user_id, refreshLock, user?.id]);

  const releaseLock = useCallback(async () => {
    if (!id || !user?.id) return;
    if (!lock?.is_locked || Number(lock?.locked_by_user_id || 0) !== Number(user.id)) return;

    setUnlocking(true);
    try {
      const resp = await api.unlockTicket(id);
      setLock(resp?.data || resp || null);
    } catch {
      await refreshLock();
    } finally {
      setUnlocking(false);
    }
  }, [id, lock?.is_locked, lock?.locked_by_user_id, refreshLock, user?.id]);

  const refreshPriorityInsights = useCallback(async () => {
    if (!id) return;
    try {
      const priorityResponse = await api.getTicketPriorityInsights(id);
      setPriorityInsights(priorityResponse?.data || null);
    } catch {
      setPriorityInsights(null);
    }
  }, [id]);

  const loadLookups = useCallback(async () => {
    try {
      const [statusModelResponse, templatesResponse] = await Promise.all([
        api.getTicketStatusModel(),
        api.getEmailReplyTemplates(),
      ]);

      const statuses = statusModelResponse?.data?.statuses || [];
      if (Array.isArray(statuses) && statuses.length > 0) {
        const allowed = statuses
          .filter((s) => s.code !== 'deleted')
          .map((s) => s.code);
        if (allowed.length > 0) setStatusOptions(allowed);
      }

      const transitions = statusModelResponse?.data?.transitions;
      if (transitions && typeof transitions === 'object') {
        setStatusTransitions(transitions);
      }

      const templateRows = Array.isArray(templatesResponse?.data) ? templatesResponse.data : [];
      if (templateRows.length > 0) {
        setCommentTemplates(
          templateRows.map((t) => ({
            id: t.code,
            label: t.name,
            text: t.body,
          }))
        );
      }
    } catch {
      setStatusOptions(STATUS_OPTIONS_FALLBACK);
      setStatusTransitions({});
      setCommentTemplates(COMMENT_TEMPLATES_FALLBACK);
    }
  }, []);

  const toBase64 = useCallback((file) => (
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result || '');
        const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })
  ), []);

  const onChangeStatus = async (nextStatus) => {
    if (!ticket || nextStatus === ticket.status) return;

    setUpdatingStatus(true);
    setError('');
    try {
      await api.updateTicketStatus(id, nextStatus);
      setTicket((prev) => ({ ...prev, status: nextStatus }));
      await loadData({ showLoader: false });
    } catch (e) {
      setError(e?.message || 'Could not update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const isStatusAllowed = (nextStatus) => {
    if (!ticket?.status || !nextStatus) return true;
    if (nextStatus === ticket.status) return true;

    const allowed = statusTransitions[ticket.status];
    if (!Array.isArray(allowed)) return true;
    return allowed.includes(nextStatus);
  };

  const onAssign = async () => {
    if (!selectedUserId) return;
    setAssigning(true);
    setError('');
    try {
      await api.assignTicket(id, selectedUserId);
      setShowAssign(false);
      setSelectedUserId('');
      await loadData({ showLoader: false });
    } catch (e) {
      setError(e?.message || 'Could not assign ticket');
    } finally {
      setAssigning(false);
    }
  };

  const onTakeTicket = async () => {
    if (!user?.id || !ticket) return;

    setTakingTicket(true);
    setError('');
    try {
      await api.assignTicket(id, user.id);
      await loadData({ showLoader: false });
    } catch (e) {
      setError(e?.message || 'Could not take ticket');
    } finally {
      setTakingTicket(false);
    }
  };

  const onDeleteTicket = async () => {
    if (!ticket?.id) return;
    const ok = window.confirm(`Delete ticket ${ticket.ticket_number || `#${ticket.id}`}? This is a soft delete and can affect reports.`);
    if (!ok) return;

    setDeletingTicket(true);
    setError('');
    try {
      await api.deleteTicket(ticket.id);
      router.push('/tickets');
    } catch (e) {
      setError(e?.message || 'Could not delete ticket');
    } finally {
      setDeletingTicket(false);
    }
  };

  const onSubmitComment = async (e) => {
    e.preventDefault();
    const validationError = validateTicketComment(commentText);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isInternal) {
      const ok = await ensureExternalLock();
      if (!ok) return;
    }

    setPostingComment(true);
    setError('');
    try {
      const preparedAttachments = [];
      for (const file of attachments) {
        const contentBase64 = await toBase64(file);
        preparedAttachments.push({
          file_name: file.name,
          mime_type: file.type || 'application/octet-stream',
          content_base64: contentBase64,
        });
      }

      const response = await api.addTicketComment(id, {
        comment_text: commentText.trim(),
        is_internal: isInternal,
        template_code: selectedTemplate || null,
        attachments: preparedAttachments,
      });

      setCommentText('');
      setIsInternal(false);
      setAttachments([]);
      setSelectedTemplate('');
      const appended = response?.data || null;
      if (appended) {
        setComments((prev) => [...prev, appended]);
      } else {
        await loadData({ showLoader: false });
      }
      await refreshPriorityInsights();
      await refreshLock();
    } catch (err) {
      setError(err?.message || 'Could not post comment');
      await refreshLock();
    } finally {
      setPostingComment(false);
    }
  };

  const onUpdatePriority = async () => {
    if (!ticket?.id) return;
    if (!priorityForm.priority) {
      setError('Please choose a priority value');
      return;
    }

    setSavingPriority(true);
    setError('');
    try {
      const response = await api.updateTicketPriority(ticket.id, priorityForm.priority, priorityForm.reason.trim());
      setPriorityForm((prev) => ({ ...prev, reason: '' }));
      if (response?.data) {
        setTicket(response.data);
      }
      await refreshPriorityInsights();
    } catch (e) {
      setError(e?.message || 'Could not update ticket priority');
    } finally {
      setSavingPriority(false);
    }
  };

  const onReevaluatePriority = async () => {
    if (!ticket?.id) return;

    setReevaluatingPriority(true);
    setError('');
    try {
      const response = await api.reevaluateTicketPriority(ticket.id);
      if (response?.data?.ticket) {
        setTicket(response.data.ticket);
        setPriorityForm((prev) => ({
          ...prev,
          priority: String(response.data.ticket.priority || prev.priority || 'medium').toLowerCase(),
        }));
      }
      await refreshPriorityInsights();
    } catch (e) {
      setError(e?.message || 'Could not re-evaluate ticket priority');
    } finally {
      setReevaluatingPriority(false);
    }
  };

  const applyTemplate = async (templateId) => {
    setSelectedTemplate(templateId);
    if (!templateId) return;

    const fallbackTemplate = commentTemplates.find((item) => item.id === templateId);
    try {
      const response = await api.previewEmailReplyTemplate(templateId, {
        requester_name: ticket?.requester_name || ticket?.requester_email?.split('@')[0] || 'Requester',
        ticket_number: ticket?.ticket_number || `TKT-${id}`,
        status: ticket?.status || 'open',
      });
      if (response?.data?.body) {
        setCommentText(response.data.body);
      } else if (fallbackTemplate) {
        setCommentText(fallbackTemplate.text);
      }
    } catch {
      if (fallbackTemplate) {
        setCommentText(fallbackTemplate.text);
      }
    }

    setIsInternal(false);
    await ensureExternalLock();
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    if (!ticket?.status) return;
    setStatusOptions((prev) => (prev.includes(ticket.status) ? prev : [ticket.status, ...prev]));
  }, [ticket?.status]);

  useEffect(() => {
    if (!ticket) {
      setDesktopRightActions(false);
      return undefined;
    }

    const node = headerSectionRef.current;
    if (!node) return undefined;

    const updateLayout = (width) => {
      setDesktopRightActions(width >= HEADER_RIGHT_ACTIONS_MIN_WIDTH);
    };

    const updateFromNodeWidth = () => {
      updateLayout(Math.max(0, Math.floor(node.getBoundingClientRect().width || 0)));
    };

    updateFromNodeWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const width = entries?.[0]?.contentRect?.width;
        if (typeof width === 'number') {
          updateLayout(Math.max(0, Math.floor(width)));
          return;
        }
        updateFromNodeWidth();
      });
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateFromNodeWidth);
    return () => window.removeEventListener('resize', updateFromNodeWidth);
  }, [ticket]);

  useEffect(() => {
    if (!id) return undefined;
    const timer = setInterval(() => {
      refreshLock();
    }, 15000);
    return () => clearInterval(timer);
  }, [id, refreshLock]);

  useEffect(() => {
    const hasDraft = Boolean(commentText.trim()) || attachments.length > 0;
    if (!hasDraft || isInternal) return undefined;
    if (!lock?.is_locked || Number(lock?.locked_by_user_id || 0) !== Number(user?.id || 0)) return undefined;

    const timer = setInterval(() => {
      api.lockTicket(id).then((resp) => {
        setLock(resp?.data || resp || null);
      }).catch(() => {});
    }, 120000);

    return () => clearInterval(timer);
  }, [attachments.length, commentText, id, isInternal, lock?.is_locked, lock?.locked_by_user_id, user?.id]);

  useEffect(() => {
    const hasDraft = Boolean(commentText.trim()) || attachments.length > 0;
    if (hasDraft) return;
    if (isInternal) return;
    if (!lock?.is_locked || Number(lock?.locked_by_user_id || 0) !== Number(user?.id || 0)) return;
    if (postingComment || locking) return;
    releaseLock();
  }, [attachments.length, commentText, isInternal, lock?.is_locked, lock?.locked_by_user_id, locking, postingComment, releaseLock, user?.id]);

  const lockOwnerId = Number(lock?.locked_by_user_id || 0);
  const lockActive = Boolean(lock?.is_locked);
  const isLockedByMe = lockActive && lockOwnerId && lockOwnerId === Number(user?.id || 0);
  const isLockedByOther = lockActive && lockOwnerId && lockOwnerId !== Number(user?.id || 0);

  return (
    <ProtectedRoute allowedRoles={['technician', 'admin']}>
      <DashboardLayout>
        {loading ? (
          <LoadingState label="Loading ticket details..." />
        ) : (
          <div className="mx-auto w-full max-w-[1500px] space-y-6">
            <button
              type="button"
              onClick={() => router.push('/tickets')}
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to Tickets
            </button>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span className="inline-flex items-center">
                  <AlertCircle className="mr-2 h-4 w-4" />
                  {error}
                </span>
              </div>
            ) : null}

            {!ticket ? (
              <section className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
                Ticket data is unavailable. Please check backend/API and try reloading.
              </section>
            ) : null}

            {ticket ? (
            <section ref={headerSectionRef} className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 lg:p-6">
              <div className={desktopRightActions ? 'mb-4 grid grid-cols-[minmax(0,1fr)_minmax(300px,340px)] gap-4' : 'mb-4 space-y-3'}>
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono text-gray-500">#{ticket?.ticket_number || ticket?.id}</span>
                    <Badge type="priority" value={ticket?.priority || 'medium'} />
                    <Badge type="status" value={ticket?.status || 'open'} />
                  </div>
                  <h1
                    className="max-w-full break-words text-2xl font-bold text-gray-900"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ticket?.title || 'Untitled Ticket') }}
                  />
                </div>

                <div className={desktopRightActions ? 'min-w-0 flex flex-col gap-2' : 'grid grid-cols-1 gap-2 2xl:grid-cols-2'}>
                  <div className={desktopRightActions ? '' : '2xl:col-span-2'}>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Change Status</label>
                    <select
                      value={ticket?.status || 'open'}
                      disabled={updatingStatus}
                      onChange={(e) => onChangeStatus(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s} disabled={!isStatusAllowed(s)}>
                          {s.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>

                  {Number(ticket?.assigned_to || 0) !== Number(user?.id || 0) ? (
                    <Button onClick={onTakeTicket} loading={takingTicket} variant="secondary" size="md" className="w-full">
                      Take Ticket
                    </Button>
                  ) : (
                    desktopRightActions ? null : <div className="hidden 2xl:block" />
                  )}

                  <Button onClick={() => setShowAssign(true)} variant="primary" size="md" className="w-full">
                    <UserPlus className="mr-1 h-4 w-4" />
                    <span className="truncate">{ticket?.assigned_to_name ? `Reassign (${ticket.assigned_to_name})` : 'Assign Technician'}</span>
                  </Button>

                  <Button
                    onClick={onDeleteTicket}
                    loading={deletingTicket}
                    variant="danger"
                    size="md"
                    className={desktopRightActions ? 'w-full' : 'w-full 2xl:col-span-2'}
                  >
                    Delete Ticket
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <div className="rounded-lg bg-gray-50 p-3 text-sm">
                  <p className="text-xs uppercase text-gray-500">Requester</p>
                  <p className="mt-1 font-medium text-gray-900">{ticket?.requester_email || 'N/A'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-sm">
                  <p className="text-xs uppercase text-gray-500">Category</p>
                  <p className="mt-1 font-medium text-gray-900">{ticket?.category || 'General'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-sm">
                  <p className="text-xs uppercase text-gray-500">Created</p>
                  <p className="mt-1 font-medium text-gray-900">{formatDate(ticket?.created_at)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-sm">
                  <p className="text-xs uppercase text-gray-500">Assigned To</p>
                  <p className="mt-1 font-medium text-gray-900">{ticket?.assigned_to_name || 'Unassigned'}</p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h2 className="mb-2 text-sm font-semibold text-gray-900">Description</h2>
                <div
                  className="whitespace-pre-wrap text-sm text-gray-700"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ticket?.description || '') }}
                />
              </div>
            </section>
            ) : null}

            {ticket ? (
            <div className="grid grid-cols-1 gap-6 2xl:grid-cols-3">
              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm 2xl:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900">Discussion Thread</h2>
                  <span className="text-xs text-gray-500">{comments.length} comments</span>
                </div>

                <form onSubmit={onSubmitComment} className="mb-4 space-y-3 rounded-lg border border-gray-200 p-3">
                  {lockActive ? (
                    <div
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        isLockedByOther ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {isLockedByOther
                            ? `Locked by ${lock?.locked_by_name || 'another user'}`
                            : `Locked by you`}
                          {lock?.lock_expires_at ? ` (expires ${formatDate(lock.lock_expires_at)})` : ''}
                        </span>
                        {isLockedByMe ? (
                          <Button type="button" variant="secondary" size="sm" loading={unlocking} onClick={releaseLock}>
                            Unlock
                          </Button>
                        ) : (
                          <Button type="button" variant="secondary" size="sm" onClick={refreshLock}>
                            Refresh
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <select
                      value={selectedTemplate}
                      onChange={(e) => applyTemplate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Use quick template...</option>
                      {commentTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      {commentTemplates.slice(0, 2).map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => applyTemplate(template.id)}
                          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={commentText}
                    onFocus={() => {
                      if (!isInternal) ensureExternalLock();
                    }}
                    disabled={!isInternal && isLockedByOther}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write a message to requester or internal note..."
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <div className="space-y-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <Paperclip className="h-4 w-4" />
                      Attach files
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setAttachments((prev) => [...prev, ...files].slice(0, 5));
                          if (!isInternal && files.length) ensureExternalLock();
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {attachments.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {attachments.map((file, idx) => (
                          <span
                            key={`${file.name}-${idx}`}
                            className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700"
                          >
                            {file.name}
                            <button
                              type="button"
                              onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-gray-500 hover:text-gray-800"
                              aria-label="Remove file"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <label className="inline-flex items-center text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setIsInternal(next);
                        if (!next) {
                          ensureExternalLock();
                        } else {
                          releaseLock();
                        }
                      }}
                      className="mr-2"
                    />
                    Internal note (visible to IT team only)
                  </label>
                  <div className="flex justify-end">
                    <Button type="submit" loading={postingComment || locking} disabled={!isInternal && isLockedByOther}>
                      <Send className="mr-1 h-4 w-4" />
                      {isInternal ? 'Post Internal Note' : 'Send Update (Email + Thread)'}
                    </Button>
                  </div>
                </form>

                <div className="space-y-3">
                  {comments.length === 0 ? (
                    <p className="text-sm text-gray-500">No comments yet.</p>
                  ) : (
                    comments.map((c) => (
                      <article
                        key={c.id}
                        className={`flex ${Number(c.created_by) === Number(user?.id) ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                            Number(c.created_by) === Number(user?.id)
                              ? 'bg-secondary-500 text-white'
                              : 'border border-gray-200 bg-white text-gray-900'
                          }`}
                        >
                          <div
                            className={`mb-1 flex items-center justify-between gap-4 text-xs ${
                              Number(c.created_by) === Number(user?.id) ? 'text-cyan-100' : 'text-gray-500'
                            }`}
                          >
                            <span>{c.created_by_name || 'IT Staff'}</span>
                            <span>{formatDate(c.created_at)}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm">{c.comment_text}</p>
                          {Array.isArray(c.attachments) && c.attachments.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {c.attachments.map((a) => (
                                <a
                                  key={a.id}
                                  href={api.getAssetUrl(a.public_url)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
                                    Number(c.created_by) === Number(user?.id)
                                      ? 'border-cyan-300 bg-cyan-700 text-cyan-100'
                                      : 'border-gray-300 bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  <Paperclip className="h-3 w-3" />
                                  {a.original_file_name}
                                </a>
                              ))}
                            </div>
                          ) : null}
                          {Number(c.is_internal) === 1 ? (
                            <span
                              className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                Number(c.created_by) === Number(user?.id)
                                  ? 'bg-cyan-700 text-cyan-100'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              Internal
                            </span>
                          ) : (
                            <span
                              className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                Number(c.created_by) === Number(user?.id)
                                  ? 'bg-cyan-700 text-cyan-100'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              External
                            </span>
                          )}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <div className="space-y-4 2xl:col-span-1">
                <SLATimer initialMinutes={liveSla.totalMinutes} isActive={!!sla?.isActive} />
                <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">SLA Summary</h3>
                  <p className="text-sm text-gray-700">Elapsed: <span className="font-semibold">{liveSla.formattedTime}</span></p>
                  <p className="text-sm text-gray-700">Remaining: <span className="font-semibold">{liveSla.remainingMinutes}m</span></p>
                  <p className="text-sm text-gray-700">Progress: <span className="font-semibold">{liveSla.progressPercent}%</span></p>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">Priority Intelligence</h3>
                  {!priorityInsights?.latest_inference ? (
                    <p className="text-sm text-gray-500">No AI/rules inference recorded yet.</p>
                  ) : (
                    <div className="space-y-2 text-sm text-gray-700">
                      <p>Predicted: <span className="font-semibold">{priorityInsights.latest_inference.predicted_priority_code}</span></p>
                      <p>Applied: <span className="font-semibold">{priorityInsights.latest_inference.applied_priority_code}</span></p>
                      <p>Confidence: <span className="font-semibold">{Math.round(Number(priorityInsights.latest_inference.confidence || 0) * 100)}%</span></p>
                      <p>Mode: <span className="font-semibold">{priorityInsights.latest_inference.mode}</span></p>
                      <p className="text-xs text-gray-500">{priorityInsights.latest_inference.decision_reason}</p>
                    </div>
                  )}
                  <div className="mt-4 space-y-2 border-t border-gray-200 pt-3">
                    <label className="text-xs font-semibold uppercase text-gray-500">Manual Override</label>
                    <select
                      value={priorityForm.priority}
                      disabled={savingPriority}
                      onChange={(e) => setPriorityForm((prev) => ({ ...prev, priority: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      {['low', 'medium', 'high', 'critical'].map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={priorityForm.reason}
                      disabled={savingPriority}
                      onChange={(e) => setPriorityForm((prev) => ({ ...prev, reason: e.target.value }))}
                      placeholder="Reason (optional)"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <Button
                      type="button"
                      onClick={onUpdatePriority}
                      loading={savingPriority}
                      className="w-full"
                    >
                      Save Priority
                    </Button>
                  </div>

                  {Array.isArray(priorityInsights?.history) && priorityInsights.history.length > 0 ? (
                    <div className="mt-4 border-t border-gray-200 pt-3">
                      <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Recent Changes</p>
                      <div className="space-y-2">
                        {priorityInsights.history.slice(0, 4).map((h) => (
                          <div key={h.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                            <p className="font-semibold">
                              {(h.old_priority || 'none')} {'->'} {h.new_priority}
                            </p>
                            <p className="text-gray-500">
                              {h.change_source} {h.changed_by_name ? `by ${h.changed_by_name}` : ''} {h.created_at ? `at ${formatDate(h.created_at)}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">AI Actions</h3>
                  <p className="mb-3 text-xs text-gray-500">
                    Manual AI re-check is optional. Normal email intake now auto-classifies and auto-updates priority.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onReevaluatePriority}
                    loading={reevaluatingPriority}
                    className="w-full"
                  >
                    Re-evaluate with AI
                  </Button>
                </section>
              </div>
            </div>
            ) : null}

            <Modal
              open={showAssign}
              onClose={() => setShowAssign(false)}
              title="Assign Technician"
              footer={(
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setShowAssign(false)}>Cancel</Button>
                  <Button onClick={onAssign} loading={assigning}>Assign</Button>
                </div>
              )}
            >
              <div className="space-y-2">
                <label className="text-sm text-gray-700">Select technician</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Choose a technician</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.username} ({u.shift_type || 'N/A'})
                    </option>
                  ))}
                </select>
              </div>
            </Modal>
          </div>
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
