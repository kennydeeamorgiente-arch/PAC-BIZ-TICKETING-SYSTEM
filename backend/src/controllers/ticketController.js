const db = require('../config/database');
const { trackSLAEvent, getSLAStatus } = require('../services/slaService');

async function fetchTicketById(ticketId) {
    const [rows] = await db.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    return rows.length > 0 ? rows[0] : null;
}

// GET /api/tickets - Get all tickets
const getAllTickets = async (req, res) => {
    try {
        const [tickets] = await db.query(`
            SELECT t.*,
                   u1.full_name AS created_by_name,
                   u2.full_name AS assigned_to_name
            FROM tickets t
            LEFT JOIN users u1 ON t.created_by = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            ORDER BY t.created_at DESC
        `);

        res.json({
            success: true,
            data: tickets,
            count: tickets.length
        });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tickets',
            error: error.message
        });
    }
};

// POST /api/tickets - Create a new ticket
const createTicket = async (req, res) => {
    try {
        const { title, description, priority, category, created_by } = req.body;

        const ticketNumber = `TKT-${String(Date.now()).slice(-4)}`;

        const [result] = await db.query(`
            INSERT INTO tickets (ticket_number, title, description, priority, category, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [ticketNumber, title, description, priority, category, created_by]);

        const [newTicket] = await db.query(`
            SELECT t.*, u.full_name AS created_by_name
            FROM tickets t
            LEFT JOIN users u ON t.created_by = u.id
            WHERE t.id = ?
        `, [result.insertId]);

        res.status(201).json({
            success: true,
            message: 'Ticket created successfully',
            data: newTicket[0]
        });
    } catch (error) {
        console.error('Error creating ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create ticket',
            error: error.message
        });
    }
};

// GET /api/tickets/:id - Get one ticket
const getTicketById = async (req, res) => {
    try {
        const ticketId = Number(req.params.id);
        const [rows] = await db.query(`
            SELECT t.*,
                   u1.full_name AS created_by_name,
                   u2.full_name AS assigned_to_name
            FROM tickets t
            LEFT JOIN users u1 ON t.created_by = u1.id
            LEFT JOIN users u2 ON t.assigned_to = u2.id
            WHERE t.id = ?
        `, [ticketId]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        return res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error fetching ticket:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch ticket', error: error.message });
    }
};

// PATCH /api/tickets/:id/assign
const assignTicket = async (req, res) => {
    try {
        const ticketId = Number(req.params.id);
        const { assigned_to } = req.body;

        if (!assigned_to) {
            return res.status(400).json({ success: false, message: 'assigned_to is required' });
        }

        const ticket = await fetchTicketById(ticketId);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        await db.query(
            `UPDATE tickets
             SET assigned_to = ?, status = 'in_progress', updated_at = NOW()
             WHERE id = ?`,
            [assigned_to, ticketId]
        );

        await trackSLAEvent(ticketId, 'assigned', assigned_to, 'Ticket assigned to technician');

        return res.json({ success: true, message: 'Ticket assigned successfully' });
    } catch (error) {
        console.error('Error assigning ticket:', error);
        return res.status(500).json({ success: false, message: 'Failed to assign ticket', error: error.message });
    }
};

// PATCH /api/tickets/:id/pause
const pauseTicketSLA = async (req, res) => {
    try {
        const ticketId = Number(req.params.id);
        const ticket = await fetchTicketById(ticketId);

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        const technicianId = ticket.assigned_to || req.body.user_id || null;
        await trackSLAEvent(ticketId, 'paused', technicianId, 'Manual SLA pause');

        return res.json({ success: true, message: 'SLA timer paused' });
    } catch (error) {
        console.error('Error pausing SLA:', error);
        return res.status(500).json({ success: false, message: 'Failed to pause SLA timer', error: error.message });
    }
};

// PATCH /api/tickets/:id/resume
const resumeTicketSLA = async (req, res) => {
    try {
        const ticketId = Number(req.params.id);
        const ticket = await fetchTicketById(ticketId);

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        const technicianId = ticket.assigned_to || req.body.user_id || null;
        await trackSLAEvent(ticketId, 'resumed', technicianId, 'Manual SLA resume');

        return res.json({ success: true, message: 'SLA timer resumed' });
    } catch (error) {
        console.error('Error resuming SLA:', error);
        return res.status(500).json({ success: false, message: 'Failed to resume SLA timer', error: error.message });
    }
};

// PATCH /api/tickets/:id/respond
const respondToTicket = async (req, res) => {
    try {
        const ticketId = Number(req.params.id);
        const ticket = await fetchTicketById(ticketId);

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        await db.query(
            `UPDATE tickets
             SET first_response_at = COALESCE(first_response_at, NOW()), updated_at = NOW()
             WHERE id = ?`,
            [ticketId]
        );

        const technicianId = ticket.assigned_to || req.body.user_id || null;
        await trackSLAEvent(ticketId, 'responded', technicianId, 'First response sent');

        return res.json({ success: true, message: 'Ticket response tracked' });
    } catch (error) {
        console.error('Error responding to ticket:', error);
        return res.status(500).json({ success: false, message: 'Failed to track response', error: error.message });
    }
};

// PATCH /api/tickets/:id/resolve
const resolveTicket = async (req, res) => {
    try {
        const ticketId = Number(req.params.id);
        const ticket = await fetchTicketById(ticketId);

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        await db.query(
            `UPDATE tickets
             SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [ticketId]
        );

        const technicianId = ticket.assigned_to || req.body.user_id || null;
        await trackSLAEvent(ticketId, 'resolved', technicianId, 'Ticket resolved');

        return res.json({ success: true, message: 'Ticket resolved' });
    } catch (error) {
        console.error('Error resolving ticket:', error);
        return res.status(500).json({ success: false, message: 'Failed to resolve ticket', error: error.message });
    }
};

// GET /api/tickets/:id/sla
const getTicketSLAStatus = async (req, res) => {
    try {
        const ticketId = Number(req.params.id);
        const ticket = await fetchTicketById(ticketId);

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        const sla = await getSLAStatus(ticketId);
        return res.json({ success: true, data: sla });
    } catch (error) {
        console.error('Error fetching SLA status:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch SLA status', error: error.message });
    }
};

module.exports = {
    getAllTickets,
    createTicket,
    getTicketById,
    assignTicket,
    pauseTicketSLA,
    resumeTicketSLA,
    respondToTicket,
    resolveTicket,
    getTicketSLAStatus
};
