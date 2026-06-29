const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: { type: String },
  photoUrl: { type: String },
  role: { type: String, enum: ['user', 'admin'], default: 'user' } // Defaults to user
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);