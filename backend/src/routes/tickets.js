const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');

// GET /api/tickets - Get all tickets
router.get('/', ticketController.getAllTickets);

// POST /api/tickets - Create a new ticket
router.post('/', ticketController.createTicket);

// GET /api/tickets/:id - Get one ticket
router.get('/:id', ticketController.getTicketById);

// PATCH /api/tickets/:id/assign - Assign technician and start SLA timer
router.patch('/:id/assign', ticketController.assignTicket);

// PATCH /api/tickets/:id/pause - Pause SLA timer
router.patch('/:id/pause', ticketController.pauseTicketSLA);

// PATCH /api/tickets/:id/resume - Resume SLA timer
router.patch('/:id/resume', ticketController.resumeTicketSLA);

// PATCH /api/tickets/:id/respond - Stop first-response SLA timer
router.patch('/:id/respond', ticketController.respondToTicket);

// PATCH /api/tickets/:id/resolve - Stop resolution SLA timer
router.patch('/:id/resolve', ticketController.resolveTicket);

// GET /api/tickets/:id/sla - Get SLA status and elapsed minutes
router.get('/:id/sla', ticketController.getTicketSLAStatus);

module.exports = router;
