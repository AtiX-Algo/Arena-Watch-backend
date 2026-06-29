const mongoose = require('mongoose');

const competitorSchema = new mongoose.Schema({
  id: { type: String, required: true },
  abbreviation: { type: String },
  displayName: { type: String, required: true },
  logo: { type: String },
  score: { type: String, default: "0" },
  homeAway: { type: String, enum: ['home', 'away'] },
  winner: { type: Boolean, default: false },
  // ADD THIS LINE FOR GOALSCORERS:
  scorers: [{ name: String, goals: Number }] 
});

const matchSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // e.g., "760468"
  date: { type: Date, required: true },
  name: { type: String, required: true }, // e.g., "Germany at Ecuador"
  status: {
    state: { type: String, default: "pre" }, // "pre", "in", "post"
    detail: { type: String }, // e.g., "Thu, June 25th at 4:00 PM"
    displayClock: { type: String, default: "0'" }
  },
  venue: { type: String },
  groupNote: { type: String }, // e.g., "FIFA World Cup, Group E"
  competitors: [competitorSchema]
}, { timestamps: true });

module.exports = mongoose.model('Match', matchSchema);