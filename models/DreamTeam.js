const mongoose = require('mongoose');

const dreamTeamSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  formation: { type: String, required: true },
  players: [{
    position: String,
    playerId: String,
    name: String,
    rating: Number,
    country: String,
    imageUrl: String
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DreamTeam', dreamTeamSchema);