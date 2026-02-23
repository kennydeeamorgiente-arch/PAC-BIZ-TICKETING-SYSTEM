import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

class API {
  constructor() {
    this.baseURL = API_URL;
  }

  getAssetUrl(assetPath) {
    if (!assetPath) return '';
    if (String(assetPath).startsWith('http://') || String(assetPath).startsWith('https://')) {
      return assetPath;
    }

    const cleanPath = String(assetPath).startsWith('/') ? assetPath : `/${assetPath}`;
    const base = this.baseURL.replace(/\/api\/?$/, '');
    return `${base}${cleanPath}`;
  }

  getHeaders() {
    const token = Cookies.get('auth_token');
    const headers = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    const config = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 401) {
        Cookies.remove('auth_token');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        throw new Error('Unauthorized');
      }

      const raw = await response.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = { message: raw };
      }

      if (!response.ok) {
        throw new Error((data && data.message) || 'Request failed');
      }

      return data;
    } catch (error) {
      if (error?.message === 'Failed to fetch') {
        console.error(`Network error calling ${url}. Ensure backend is running and reachable.`);
      }
      console.error('API Error:', error);
      throw error;
    }
  }

  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async patch(endpoint, data) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  async login(email, password) {
    return this.post('/auth/login', { email, password });
  }

  async getCurrentUser() {
    return this.get('/auth/me');
  }

  async getTickets() {
    return this.get('/tickets');
  }

  async getTicket(id) {
    return this.get(`/tickets/${id}`);
  }

  async getTicketSLA(id) {
    return this.get(`/tickets/${id}/sla`);
  }

  async createTicket(data) {
    return this.post('/tickets', data);
  }

  async deleteTicket(id) {
    return this.delete(`/tickets/${id}`);
  }

  async updateTicketStatus(id, status) {
    return this.patch(`/tickets/${id}/status`, { status });
  }

  async updateTicketPriority(id, priority, reason = '') {
    return this.patch(`/tickets/${id}/priority`, { priority, reason });
  }

  async getTicketPriorityInsights(id) {
    return this.get(`/tickets/${id}/priority-insights`);
  }

  async reevaluateTicketPriority(id) {
    return this.post(`/tickets/${id}/priority/reevaluate`, {});
  }

  async assignTicket(id, userId) {
    return this.patch(`/tickets/${id}/assign`, { assigned_to: userId });
  }

  async addComment(ticketId, comment) {
    return this.post(`/tickets/${ticketId}/comments`, { comment_text: comment });
  }

  async getTicketComments(ticketId) {
    return this.get(`/tickets/${ticketId}/comments`);
  }

  async addTicketComment(ticketId, commentText, isInternal = false) {
    if (typeof commentText === 'object' && commentText !== null) {
      return this.post(`/tickets/${ticketId}/comments`, commentText);
    }

    return this.post(`/tickets/${ticketId}/comments`, {
      comment_text: commentText,
      is_internal: isInternal,
    });
  }

  async getTicketStatusModel() {
    return this.get('/tickets/status-model');
  }

  async getUsers() {
    return this.get('/users');
  }

  async createUser(data) {
    return this.post('/users', data);
  }

  async updateUser(id, data) {
    return this.patch(`/users/${id}`, data);
  }

  async deleteUser(id) {
    return this.delete(`/users/${id}`);
  }

  async getShiftReport(startDate, endDate) {
    return this.get(`/reports/shifts?start=${startDate}&end=${endDate}`);
  }

  async getTechnicianPerformance(startDate, endDate) {
    return this.get(`/reports/technicians?start=${startDate}&end=${endDate}`);
  }

  async getTicketActivity(startDate, endDate) {
    return this.get(`/reports/ticket-activity?start=${startDate}&end=${endDate}`);
  }

  async getShifts() {
    return this.get('/shifts');
  }

  async updateShift(id, data) {
    return this.patch(`/shifts/${id}`, data);
  }

  async getNotifications(limit = 30) {
    return this.get(`/notifications?limit=${limit}`);
  }

  async markNotificationRead(id) {
    return this.patch(`/notifications/${id}/read`, {});
  }

  async markAllNotificationsRead() {
    return this.patch('/notifications/read-all', {});
  }

  async getEmailReplyTemplates() {
    return this.get('/templates/email-replies');
  }

  async previewEmailReplyTemplate(code, vars = {}) {
    return this.post('/templates/email-replies/preview', { code, vars });
  }

  async getAiReviewQueue(status = 'pending', limit = 50, page = 1) {
    return this.get(
      `/ai-review/queue?status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}&page=${encodeURIComponent(page)}`
    );
  }

  async getAiIntakeQueue({ status = 'new', decision = 'all', limit = 20, page = 1 } = {}) {
    return this.get(
      `/ai-review/intake-queue?status=${encodeURIComponent(status)}&decision=${encodeURIComponent(decision)}&limit=${encodeURIComponent(
        limit
      )}&page=${encodeURIComponent(page)}`
    );
  }

  async getAiReviewMetrics() {
    return this.get('/ai-review/metrics');
  }

  async getAiReviewDashboard(days = 30) {
    return this.get(`/ai-review/dashboard?days=${encodeURIComponent(days)}`);
  }

  async getAiReviewRecommendations(days = 30) {
    return this.get(`/ai-review/recommendations?days=${encodeURIComponent(days)}`);
  }

  async getAiReadiness() {
    return this.get('/ai-review/readiness');
  }

  async runAiEmailSync({ dryRun = false, markAsRead } = {}) {
    const payload = { dry_run: Boolean(dryRun) };
    if (markAsRead !== undefined) payload.mark_as_read = Boolean(markAsRead);
    return this.post('/ai-review/email-sync', payload);
  }

  async reviewAiInference(inferenceId, payload) {
    return this.patch(`/ai-review/${inferenceId}/review`, payload);
  }

  async releaseAiIntakeEmail(id) {
    return this.patch(`/ai-review/intake-queue/${id}/release`, {});
  }

  async dismissAiIntakeEmail(id) {
    return this.patch(`/ai-review/intake-queue/${id}/dismiss`, {});
  }

  async deleteAiIntakeEmail(id) {
    return this.delete(`/ai-review/intake-queue/${id}`);
  }
}

const api = new API();

export default api;



