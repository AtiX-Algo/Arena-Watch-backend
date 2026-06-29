const express = require('express');
const router = express.Router();
const FanCard = require('../models/FanCard');

// 1. GET all fan cards
router.get('/', async (req, res) => {
  try {
    const cards = await FanCard.find().sort({ createdAt: -1 });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST a new fan card (Includes optional aiPrompt seamlessly)
router.post('/', async (req, res) => {
  try {
    const newCard = new FanCard(req.body);
    const savedCard = await newCard.save();
    res.status(201).json(savedCard);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. PATCH update title or AI Prompt (Edit Feature)
router.patch('/:id', async (req, res) => {
  try {
    const { title, aiPrompt } = req.body;
    
    const updatedCard = await FanCard.findByIdAndUpdate(
      req.params.id,
      { $set: { title, aiPrompt } },
      { new: true, runValidators: true } // Returns the newly modified document
    );

    if (!updatedCard) {
      return res.status(404).json({ message: 'Fan card not found' });
    }

    res.json(updatedCard);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. DELETE a fan card completely (Delete Feature)
router.delete('/:id', async (req, res) => {
  try {
    const deletedCard = await FanCard.findByIdAndDelete(req.params.id);
    
    if (!deletedCard) {
      return res.status(404).json({ message: 'Fan card not found' });
    }

    res.json({ message: 'Fan card successfully deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. PATCH toggle a like/love
router.patch('/:id/like', async (req, res) => {
  try {
    const { userId } = req.body;
    const card = await FanCard.findById(req.params.id);
    
    if (!card) return res.status(404).json({ message: 'Card not found' });

    // Check if user already liked it
    const hasLiked = card.likes.includes(userId);
    
    if (hasLiked) {
      // Remove like
      card.likes = card.likes.filter(id => id !== userId);
    } else {
      // Add like
      card.likes.push(userId);
    }

    const updatedCard = await card.save();
    res.json(updatedCard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;