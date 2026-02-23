const db = require('../config/database');

// Track SLA events (assigned, paused, resumed, responded, resolved)
async function trackSLAEvent(ticketId, eventType, userId = null, notes = null) {
  try {
    let shiftCode = getCurrentShift();

    if (userId) {
      const [userRows] = await db.query(
        `SELECT s.shift_code
         FROM users u
         LEFT JOIN shifts s ON s.id = u.shift_id
         WHERE u.id = ? LIMIT 1`,
        [userId]
      );
      if (userRows.length > 0 && userRows[0].shift_code) {
        shiftCode = userRows[0].shift_code;
      }
    }

    const [shiftRows] = await db.query('SELECT id FROM shifts WHERE shift_code = ? LIMIT 1', [shiftCode]);
    const shiftId = shiftRows.length ? shiftRows[0].id : null;

    await db.query(
      `INSERT INTO sla_events (ticket_id, event_type, actor_user_id, shift_id, event_at, notes)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [ticketId, eventType, userId, shiftId, notes || `Event: ${eventType} at ${new Date().toISOString()}`]
    );

    console.log(`SLA event tracked: ${eventType} for ticket ${ticketId}`);
  } catch (error) {
    console.error('Error tracking SLA event:', error);
  }
}

// Calculate total SLA minutes for a ticket
async function calculateSLAMinutes(ticketId) {
  try {
    const [events] = await db.query(
      `SELECT se.event_type, se.event_at, s.shift_code
       FROM sla_events se
       LEFT JOIN shifts s ON s.id = se.shift_id
       WHERE se.ticket_id = ?
       ORDER BY se.event_at ASC`,
      [ticketId]
    );

    let totalMinutes = 0;
    let timerActive = false;
    let lastStart = null;
    let activeShiftType = null;

    for (const event of events) {
      switch (event.event_type) {
        case 'assigned':
        case 'resumed':
          if (!timerActive) {
            timerActive = true;
            lastStart = new Date(event.event_at);
            activeShiftType = event.shift_code || activeShiftType || getCurrentShift();
          }
          break;

        case 'paused':
        case 'responded':
        case 'resolved':
          if (timerActive && lastStart) {
            const endTime = new Date(event.event_at);
            const minutes = calculateShiftAwareMinutes(
              lastStart,
              endTime,
              activeShiftType || event.shift_code || getCurrentShift()
            );
            totalMinutes += minutes;
            timerActive = false;
            lastStart = null;
            activeShiftType = null;
          }
          break;
      }
    }

    if (timerActive && lastStart) {
      const currentTime = new Date();
      const minutes = calculateShiftAwareMinutes(lastStart, currentTime, activeShiftType || getCurrentShift());
      totalMinutes += minutes;
    }

    return totalMinutes;
  } catch (error) {
    console.error('Error calculating SLA minutes:', error);
    return 0;
  }
}

function calculateShiftAwareMinutes(startTime, endTime, shiftType) {
  if (!shiftType) return 0;

  let totalMinutes = 0;
  let current = new Date(startTime);
  const end = new Date(endTime);

  while (current < end) {
    if (isInShift(current, shiftType)) {
      totalMinutes++;
    }
    current.setMinutes(current.getMinutes() + 1);
  }

  return totalMinutes;
}

function isInShift(time, shiftType) {
  const hour = time.getHours();

  switch (shiftType) {
    case 'AM':
      return hour >= 6 && hour < 14;
    case 'PM':
      return hour >= 14 && hour < 22;
    case 'GY':
      return hour >= 22 || hour < 6;
    default:
      return false;
  }
}

function getCurrentShift() {
  const hour = new Date().getHours();

  if (hour >= 6 && hour < 14) return 'AM';
  if (hour >= 14 && hour < 22) return 'PM';
  return 'GY';
}

async function getSLAStatus(ticketId) {
  try {
    const totalMinutes = await calculateSLAMinutes(ticketId);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);

    return {
      totalMinutes,
      formattedTime: `${hours}h ${minutes}m`,
      isActive: await isTimerActive(ticketId),
    };
  } catch (error) {
    console.error('Error getting SLA status:', error);
    return {
      totalMinutes: 0,
      formattedTime: '0h 0m',
      isActive: false,
    };
  }
}

async function isTimerActive(ticketId) {
  try {
    const [lastEvent] = await db.query(
      `SELECT event_type
       FROM sla_events
       WHERE ticket_id = ?
       ORDER BY event_at DESC
       LIMIT 1`,
      [ticketId]
    );

    if (lastEvent.length === 0) return false;

    const eventType = lastEvent[0].event_type;
    return eventType === 'assigned' || eventType === 'resumed';
  } catch (error) {
    console.error('Error checking timer status:', error);
    return false;
  }
}

async function handleShiftChange() {
  try {
    const currentShift = getCurrentShift();

    const [activeTickets] = await db.query(
      `SELECT t.id AS ticket_id, t.assigned_to_user_id AS assigned_to
       FROM tickets t
       INNER JOIN users u ON u.id = t.assigned_to_user_id
       INNER JOIN shifts s ON s.id = u.shift_id
       INNER JOIN ticket_statuses ts ON ts.id = t.status_id
       INNER JOIN (
         SELECT se.ticket_id, se.event_type
         FROM sla_events se
         INNER JOIN (
           SELECT ticket_id, MAX(id) AS max_id
           FROM sla_events
           GROUP BY ticket_id
         ) latest ON latest.max_id = se.id
       ) le ON le.ticket_id = t.id
       WHERE t.assigned_to_user_id IS NOT NULL
         AND t.is_deleted = 0
         AND le.event_type IN ('assigned', 'resumed')
         AND s.shift_code <> ?
         AND ts.status_code NOT IN ('resolved', 'closed', 'deleted')`,
      [currentShift]
    );

    for (const ticket of activeTickets) {
      await trackSLAEvent(ticket.ticket_id, 'paused', ticket.assigned_to, 'Auto-paused: technician is off shift');
    }

    const [pausedTickets] = await db.query(
      `SELECT t.id AS ticket_id, t.assigned_to_user_id AS assigned_to
       FROM tickets t
       INNER JOIN users u ON u.id = t.assigned_to_user_id
       INNER JOIN shifts s ON s.id = u.shift_id
       INNER JOIN ticket_statuses ts ON ts.id = t.status_id
       INNER JOIN (
         SELECT se1.ticket_id, se1.event_type, se1.notes
         FROM sla_events se1
         INNER JOIN (
           SELECT ticket_id, MAX(id) AS max_id
           FROM sla_events
           GROUP BY ticket_id
         ) latest ON latest.max_id = se1.id
       ) le ON le.ticket_id = t.id
       WHERE le.event_type = 'paused'
         AND le.notes = 'Auto-paused: technician is off shift'
         AND s.shift_code = ?
         AND t.is_deleted = 0
         AND ts.status_code NOT IN ('resolved', 'closed', 'deleted')`,
      [currentShift]
    );

    for (const ticket of pausedTickets) {
      await trackSLAEvent(ticket.ticket_id, 'resumed', ticket.assigned_to, 'Auto-resumed: technician shift started');
    }
  } catch (error) {
    console.error('Error handling shift change:', error);
  }
}

let shiftWatcher = null;
let lastKnownShift = null;

function startShiftAwareSLAMonitor() {
  if (shiftWatcher) {
    return;
  }

  lastKnownShift = getCurrentShift();
  console.log(`Shift-aware SLA monitor started. Current shift: ${lastKnownShift}`);

  shiftWatcher = setInterval(async () => {
    const currentShift = getCurrentShift();
    if (currentShift === lastKnownShift) {
      return;
    }

    console.log(`Shift changed from ${lastKnownShift} to ${currentShift}`);
    lastKnownShift = currentShift;
    await handleShiftChange();
  }, 60 * 1000);
}

function stopShiftAwareSLAMonitor() {
  if (shiftWatcher) {
    clearInterval(shiftWatcher);
    shiftWatcher = null;
  }
}

module.exports = {
  trackSLAEvent,
  calculateSLAMinutes,
  getSLAStatus,
  isTimerActive,
  handleShiftChange,
  startShiftAwareSLAMonitor,
  stopShiftAwareSLAMonitor,
  getCurrentShift,
  isInShift,
};
