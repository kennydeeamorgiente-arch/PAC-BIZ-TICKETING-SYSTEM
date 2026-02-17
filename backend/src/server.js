require('dotenv').config();
const app = require('./app');
const { startEmailMonitoring } = require('./services/gmailService');
const { startShiftAwareSLAMonitor } = require('./services/slaService');

// Start the server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`
IT TICKETING SYSTEM
Server Status: Running
Port: ${PORT}
Environment: ${process.env.NODE_ENV || 'development'}
Database: ${process.env.DB_NAME || 'it_ticketing'}
`);

    startEmailMonitoring();
    startShiftAwareSLAMonitor();
});
