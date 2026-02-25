const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { requireAuth } = require('../middleware/auth');

// GET /api/tickets - Get all tickets
router.get('/', requireAuth, ticketController.getAllTickets);

// GET /api/tickets/status-model - Status source-of-truth and transitions
router.get('/status-model', requireAuth, ticketController.getTicketStatusModel);

// POST /api/tickets - Create a new ticket
router.post('/', requireAuth, ticketController.createTicket);

// GET /api/tickets/:id - Get one ticket
router.get('/:id', requireAuth, ticketController.getTicketById);

// PATCH /api/tickets/:id/priority - Manual priority update / override
router.patch('/:id/priority', requireAuth, ticketController.updateTicketPriority);

// GET /api/tickets/:id/priority-insights - AI/rules inference + history
router.get('/:id/priority-insights', requireAuth, ticketController.getTicketPriorityInsights);

// POST /api/tickets/:id/priority/reevaluate - Re-run AI/rules decision on existing ticket
router.post('/:id/priority/reevaluate', requireAuth, ticketController.reevaluateTicketPriority);

// PATCH /api/tickets/:id/status - Generic status update
router.patch('/:id/status', requireAuth, ticketController.updateTicketStatus);

// PATCH /api/tickets/:id/assign - Assign technician and start SLA timer
router.patch('/:id/assign', requireAuth, ticketController.assignTicket);

// PATCH /api/tickets/:id/pause - Pause SLA timer
router.patch('/:id/pause', requireAuth, ticketController.pauseTicketSLA);

// PATCH /api/tickets/:id/resume - Resume SLA timer
router.patch('/:id/resume', requireAuth, ticketController.resumeTicketSLA);

// PATCH /api/tickets/:id/respond - Stop first-response SLA timer
router.patch('/:id/respond', requireAuth, ticketController.respondToTicket);

// PATCH /api/tickets/:id/resolve - Stop resolution SLA timer
router.patch('/:id/resolve', requireAuth, ticketController.resolveTicket);

// DELETE /api/tickets/:id - Soft delete ticket
router.delete('/:id', requireAuth, ticketController.softDeleteTicket);

// GET /api/tickets/:id/comments - Ticket discussion thread
router.get('/:id/comments', requireAuth, ticketController.getTicketComments);

router.post('/:id/comments', requireAuth, ticketController.addTicketComment);

router.get('/:id/lock', requireAuth, ticketController.getTicketLock);

router.post('/:id/lock', requireAuth, ticketController.lockTicket);

router.delete('/:id/lock', requireAuth, ticketController.unlockTicket);

// GET /api/tickets/:id/sla - Get SLA status and elapsed minutes
router.get('/:id/sla', requireAuth, ticketController.getTicketSLAStatus);

module.exports = router;
