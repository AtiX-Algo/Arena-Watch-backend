const mongoose = require('mongoose');

const galleryCardSchema = new mongoose.Schema({
  title: { type: String, required: true },
  style: { type: String, required: true },
  country: { type: String, required: true },
  imageUrl: { type: String, required: true },
  isFeatured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Notice the 'description' line is completely gone now
module.exports = mongoose.model('GalleryCard', galleryCardSchema);