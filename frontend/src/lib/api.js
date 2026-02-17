import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

class API {
  constructor() {
    this.baseURL = API_URL;
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

  async updateTicketStatus(id, status) {
    return this.patch(`/tickets/${id}/status`, { status });
  }

  async assignTicket(id, userId) {
    return this.patch(`/tickets/${id}/assign`, { assigned_to: userId });
  }

  async addComment(ticketId, comment) {
    return this.post(`/tickets/${ticketId}/comments`, { comment_text: comment });
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

  async getShifts() {
    return this.get('/shifts');
  }

  async updateShift(id, data) {
    return this.patch(`/shifts/${id}`, data);
  }
}

const api = new API();

export default api;



