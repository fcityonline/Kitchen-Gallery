// backend/src/modules/dashboard/dashboard.routes.js

const router = require('express').Router();
const { protect } = require('../../middlewares/auth.middleware');

// USER DASHBOARD
router.get('/user', protect(['USER']), (req, res) => {
  res.json({
    message: 'User Dashboard',
    user: req.user
  });
});

// ADMIN DASHBOARD
router.get('/admin', protect(['ADMIN']), (req, res) => {
  res.json({
    message: 'Admin Dashboard',
    user: req.user
  });
});

module.exports = router;