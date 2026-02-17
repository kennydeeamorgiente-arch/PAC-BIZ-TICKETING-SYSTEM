const db = require('../config/database');

// Track SLA events (assigned, paused, resumed, responded, resolved)
async function trackSLAEvent(ticketId, eventType, userId = null, notes = null) {
    try {
        let shiftType = getCurrentShift();

        // Use the technician's configured shift whenever possible.
        if (userId) {
            const [userRows] = await db.query(
                'SELECT shift_type FROM users WHERE id = ?',
                [userId]
            );
            if (userRows.length > 0 && userRows[0].shift_type) {
                shiftType = userRows[0].shift_type;
            }
        }

        await db.query(`
            INSERT INTO sla_tracking (ticket_id, event_type, shift_type, notes)
            VALUES (?, ?, ?, ?)
        `, [ticketId, eventType, shiftType, notes || `Event: ${eventType} at ${new Date().toISOString()}`]);

        console.log(`SLA event tracked: ${eventType} for ticket ${ticketId}`);
    } catch (error) {
        console.error('Error tracking SLA event:', error);
    }
}

// Calculate total SLA minutes for a ticket
async function calculateSLAMinutes(ticketId) {
    try {
        const [events] = await db.query(`
            SELECT * FROM sla_tracking
            WHERE ticket_id = ?
            ORDER BY event_timestamp ASC
        `, [ticketId]);

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
                        lastStart = new Date(event.event_timestamp);
                        activeShiftType = event.shift_type || activeShiftType || getCurrentShift();
                    }
                    break;

                case 'paused':
                case 'responded':
                case 'resolved':
                    if (timerActive && lastStart) {
                        const endTime = new Date(event.event_timestamp);
                        const minutes = calculateShiftAwareMinutes(
                            lastStart,
                            endTime,
                            activeShiftType || event.shift_type || getCurrentShift()
                        );
                        totalMinutes += minutes;
                        timerActive = false;
                        lastStart = null;
                        activeShiftType = null;
                    }
                    break;
            }
        }

        // If timer is still active, calculate up to current time
        if (timerActive && lastStart) {
            const currentTime = new Date();
            const minutes = calculateShiftAwareMinutes(
                lastStart,
                currentTime,
                activeShiftType || getCurrentShift()
            );
            totalMinutes += minutes;
        }

        return totalMinutes;
    } catch (error) {
        console.error('Error calculating SLA minutes:', error);
        return 0;
    }
}

// Calculate minutes considering only active shift hours
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

// Check if a time is within a specific shift
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

// Get current shift based on current time
function getCurrentShift() {
    const hour = new Date().getHours();

    if (hour >= 6 && hour < 14) return 'AM';
    if (hour >= 14 && hour < 22) return 'PM';
    return 'GY';
}

// Get SLA status for a ticket
async function getSLAStatus(ticketId) {
    try {
        const totalMinutes = await calculateSLAMinutes(ticketId);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = Math.round(totalMinutes % 60);

        return {
            totalMinutes,
            formattedTime: `${hours}h ${minutes}m`,
            isActive: await isTimerActive(ticketId)
        };
    } catch (error) {
        console.error('Error getting SLA status:', error);
        return {
            totalMinutes: 0,
            formattedTime: '0h 0m',
            isActive: false
        };
    }
}

// Check if SLA timer is currently active for a ticket
async function isTimerActive(ticketId) {
    try {
        const [lastEvent] = await db.query(`
            SELECT event_type FROM sla_tracking
            WHERE ticket_id = ?
            ORDER BY event_timestamp DESC
            LIMIT 1
        `, [ticketId]);

        if (lastEvent.length === 0) return false;

        const eventType = lastEvent[0].event_type;
        return eventType === 'assigned' || eventType === 'resumed';
    } catch (error) {
        console.error('Error checking timer status:', error);
        return false;
    }
}

// Auto-pause off-shift tickets and auto-resume at shift start.
async function handleShiftChange() {
    try {
        const currentShift = getCurrentShift();

        const [activeTickets] = await db.query(`
            SELECT t.id AS ticket_id, t.assigned_to
            FROM tickets t
            INNER JOIN users u ON u.id = t.assigned_to
            INNER JOIN (
                SELECT st.ticket_id, st.event_type
                FROM sla_tracking st
                INNER JOIN (
                    SELECT ticket_id, MAX(id) AS max_id
                    FROM sla_tracking
                    GROUP BY ticket_id
                ) latest ON latest.max_id = st.id
            ) le ON le.ticket_id = t.id
            WHERE t.assigned_to IS NOT NULL
              AND le.event_type IN ('assigned', 'resumed')
              AND u.shift_type IS NOT NULL
              AND u.shift_type <> ?
              AND t.status NOT IN ('resolved', 'closed')
        `, [currentShift]);

        for (const ticket of activeTickets) {
            await trackSLAEvent(
                ticket.ticket_id,
                'paused',
                ticket.assigned_to,
                'Auto-paused: technician is off shift'
            );
        }

        const [pausedTickets] = await db.query(`
            SELECT t.id AS ticket_id, t.assigned_to
            FROM tickets t
            INNER JOIN users u ON u.id = t.assigned_to
            INNER JOIN (
                SELECT st1.ticket_id, st1.event_type, st1.notes
                FROM sla_tracking st1
                INNER JOIN (
                    SELECT ticket_id, MAX(id) AS max_id
                    FROM sla_tracking
                    GROUP BY ticket_id
                ) latest ON latest.max_id = st1.id
            ) st ON st.ticket_id = t.id
            WHERE st.event_type = 'paused'
              AND st.notes = 'Auto-paused: technician is off shift'
              AND u.shift_type = ?
              AND t.status NOT IN ('resolved', 'closed')
        `, [currentShift]);

        for (const ticket of pausedTickets) {
            await trackSLAEvent(
                ticket.ticket_id,
                'resumed',
                ticket.assigned_to,
                'Auto-resumed: technician shift started'
            );
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
    isInShift
};
