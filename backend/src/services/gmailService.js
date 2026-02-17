const { google } = require('googleapis');
const db = require('../config/database');

// Gmail OAuth2 configuration
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Set refresh token (you'll need to obtain this through OAuth flow)
oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// Check for new emails and create tickets
async function checkNewEmails() {
    try {
        // Get unread messages
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread'
        });

        if (!response.data.messages) {
            console.log('No new emails found');
            return;
        }

        for (const message of response.data.messages) {
            const emailData = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'full'
            });

            const email = parseEmail(emailData.data);
            
            // Create ticket from email
            await createTicketFromEmail(email);
            
            // Mark email as read
            await gmail.users.messages.modify({
                userId: 'me',
                id: message.id,
                requestBody: {
                    removeLabelIds: ['UNREAD']
                }
            });

            console.log(`Processed email: ${email.subject}`);
        }
    } catch (error) {
        console.error('Error checking emails:', error);
    }
}

// Parse email data
function parseEmail(message) {
    const headers = message.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
    const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();
    
    // Extract email body
    let body = '';
    if (message.payload.parts) {
        const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain');
        if (textPart && textPart.body.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
        }
    } else if (message.payload.body.data) {
        body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }

    return {
        id: message.id,
        subject,
        from,
        date,
        body,
        snippet: message.snippet
    };
}

// Create ticket from email
async function createTicketFromEmail(email) {
    try {
        // Find or create user from email
        const userEmail = extractEmail(email.from);
        let [userResult] = await db.query(
            'SELECT id FROM users WHERE email = ?',
            [userEmail]
        );

        let userId;
        if (userResult.length === 0) {
            // Create new user if not found
            const [insertResult] = await db.query(
                'INSERT INTO users (username, email, full_name, role) VALUES (?, ?, ?, ?)',
                [userEmail, userEmail, userEmail.split('@')[0], 'user']
            );
            userId = insertResult.insertId;
        } else {
            userId = userResult[0].id;
        }

        // Generate ticket number
        const ticketNumber = `TKT-${String(Date.now()).slice(-4)}`;

        // Create ticket
        await db.query(`
            INSERT INTO tickets (ticket_number, title, description, category, created_by)
            VALUES (?, ?, ?, ?, ?)
        `, [
            ticketNumber,
            email.subject,
            `Email from ${email.from}:\n\n${email.body}`,
            'Email',
            userId
        ]);

        console.log(`Created ticket ${ticketNumber} from email`);
    } catch (error) {
        console.error('Error creating ticket from email:', error);
    }
}

// Extract email address from "Name <email@domain.com>" format
function extractEmail(fromString) {
    const match = fromString.match(/<(.+)>/);
    return match ? match[1] : fromString;
}

// Start email monitoring
function startEmailMonitoring() {
    console.log('Starting Gmail monitoring...');
    
    // Check emails immediately on start
    checkNewEmails();
    
    // Then check every 30 seconds
    setInterval(checkNewEmails, 30000);
}

module.exports = {
    checkNewEmails,
    startEmailMonitoring,
    parseEmail,
    createTicketFromEmail
};
