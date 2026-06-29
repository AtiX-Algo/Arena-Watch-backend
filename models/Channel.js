const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema({
  serverId: { type: String, required: true },
  name: { type: String, required: true }, // "Server 1", "Backup HD"
  url: { type: String, required: true },
  quality: { type: String, default: "HD" },
  isActive: { type: Boolean, default: true }
});

const channelSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, default: "Sports" },
  logo: { type: String },
  type: { type: String, enum: ['hls', 'youtube','iframe','dash'], default: 'hls' },
  servers: [serverSchema]
}, { timestamps: true });

module.exports = mongoose.model('Channel', channelSchema);