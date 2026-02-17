const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, userController.getUsers);
router.post('/', requireAuth, userController.createUser);
router.patch('/:id', requireAuth, userController.updateUser);
router.delete('/:id', requireAuth, userController.deleteUser);

module.exports = router;
