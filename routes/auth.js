const express = require('express');
const router = express.Router();
const User = require('../models/User');

// POST - Sync Firebase user with MongoDB
router.post('/sync', async (req, res) => {
  const { firebaseUid, email, name, photoUrl } = req.body;

  try {
    // Check if user exists
    let user = await User.findOne({ firebaseUid });

    // If not, create a new user (role defaults to 'user')
    if (!user) {
      user = new User({ firebaseUid, email, name, photoUrl });
      await user.save();
    }

    // Return the user data (including their role)
    res.json(user);
  } catch (err) {
    console.error("Auth Sync Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

module.exports = router;