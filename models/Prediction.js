const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String },
  type: { type: String, required: true }, // 'tournament' or 'match_score'
  matchId: { type: String },
  homeScore: { type: Number },
  awayScore: { type: Number },
  tournamentWinner: { type: String },
  // NEW FIELDS FOR SCORING
  points: { type: Number, default: 0 },
  isEvaluated: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Prediction', predictionSchema);