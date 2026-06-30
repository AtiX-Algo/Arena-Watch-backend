const express = require('express');
const router = express.Router();
const GalleryCard = require('../models/GalleryCard');

// GET all gallery cards
router.get('/', async (req, res) => {
  try {
    const cards = await GalleryCard.find().sort({ createdAt: -1 });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET only featured cards (Use this later for your Home page)
router.get('/featured', async (req, res) => {
  try {
    const featuredCards = await GalleryCard.find({ isFeatured: true }).sort({ createdAt: -1 });
    res.json(featuredCards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST a new gallery card
router.post('/', async (req, res) => {
  try {
    const newCard = new GalleryCard(req.body);
    const savedCard = await newCard.save();
    res.status(201).json(savedCard);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/feature', async (req, res) => {
  try {
    // 🛑 CHANGE THIS: Gallery.findById -> GalleryCard.findById
    const card = await GalleryCard.findById(req.params.id); 
    if (!card) return res.status(404).json({ message: 'Card not found' });

    card.isFeatured = !card.isFeatured;
    const updatedCard = await card.save();
    res.json(updatedCard);
  } catch (error) {
    console.error(error); // Optional: adding this will let you see errors in Render logs
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE a gallery card
router.delete('/:id', async (req, res) => {
  try {
    const card = await GalleryCard.findByIdAndDelete(req.params.id);
    if (!card) return res.status(404).json({ message: 'Card not found' });
    res.json({ message: 'Card deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;