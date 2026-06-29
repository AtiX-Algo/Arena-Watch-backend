const mongoose = require('mongoose');

const fanCardSchema = new mongoose.Schema({
  title: { type: String, required: true },
  aiPrompt: { type: String, default: '' }, // New optional field for AI parameters
  imageUrl: { type: String, required: true },
  uploaderId: { type: String, required: true }, // Firebase UID of the uploader
  uploaderName: { type: String, required: true },
  likes: [{ type: String }], // Array of Firebase UIDs who loved it
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FanCard', fanCardSchema);