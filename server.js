const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();
require('./scheduler/refreshTokens');

// IMPORT YOUR NEW POLLER
const { startPolling, getCachedMatches } = require('./services/espnPoller');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS allowed for our Vite frontend
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Your Vite dev server
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// ==========================================
// 🛣️ ROUTES SETUP
// ==========================================
const matchesRouter = require('./routes/matches');
const channelRoutes = require('./routes/channels');
const galleryRoutes = require('./routes/gallery');
const authRoutes = require('./routes/auth');
const fanCardRoutes = require('./routes/fancards');
const dreamxiRoutes = require('./routes/dreamxi');
const predictionRoutes = require('./routes/predictions');

// Mount Endpoints
app.use('/api/matches', matchesRouter);
app.use('/api/channels', channelRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/fancards', fanCardRoutes);
app.use('/api/dreamxi', dreamxiRoutes);
app.use('/api/predictions', predictionRoutes);
// ==========================================

// Basic Health Route
app.get('/api/health', (req, res) => {
  res.json({ status: 'API is running optimally.' });
});

// MongoDB Atlas Connection (WITH DNS/IPV4 FIX)
mongoose.connect(process.env.MONGODB_URI, {
  family: 4, // 🔥 THIS FIXES THE DNS SRV ERROR BY FORCING IPv4
  serverSelectionTimeoutMS: 15000 
})
  .then(() => {
    console.log('✅ MongoDB Atlas Connected Successfully');
    // START THE POLLER ONCE DATABASE CONNECTS
    startPolling(io); 
  })
  .catch((err) => console.error('❌ MongoDB Connection Error:', err.message));

// Socket.io Logic
io.on('connection', (socket) => {
  console.log(`🔌 Dashboard connected: ${socket.id}`);
  
  // INSTANT PUSH: Give the user the latest scores the millisecond they connect
  const currentMatches = getCachedMatches();
  if (currentMatches.length > 0) {
    socket.emit('matchUpdates', currentMatches);
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});