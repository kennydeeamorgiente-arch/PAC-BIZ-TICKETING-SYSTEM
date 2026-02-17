const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!token) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
        req.user = payload;
        return next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
}

module.exports = { requireAuth };
