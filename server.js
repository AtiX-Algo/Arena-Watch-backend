const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios'); // 🔥 Added for routing proxy requests
require('dotenv').config();
require('./scheduler/refreshTokens');

// ==========================================
// 🛡️ GLOBAL CRASH PREVENTION
// Prevents Puppeteer/Stealth plugin errors from killing the Node process
// ==========================================
process.on('uncaughtException', (err) => {
  console.error('🚨 [Fatal] Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 [Fatal] Unhandled Rejection at:', promise, 'reason:', reason);
});
// ==========================================

// IMPORT YOUR NEW POLLER
const { startPolling, getCachedMatches } = require('./services/espnPoller');

const app = express();
const server = http.createServer(app);

// Define allowed origins for production and local development
const allowedOrigins = [
  "http://localhost:5173", 
  "https://arena-watch.web.app"
];

// Initialize Socket.io with CORS allowed for our Vite frontend & Prod App
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  }
});

// Middleware
// Apply CORS to Express routes with the same allowed origins
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true
}));

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
// 📺 LIVE STREAM SECURE PROXY MATRIX (PATCHED)
// ==========================================

// 1. HLS/DASH Playlists (.m3u8 / .mpd) Proxy
app.get('/api/proxy/stream.m3u8', async (req, res) => {
  // Extract the original URL with its query parameters preserved completely
  const fullUrlString = req.url.substring(req.url.indexOf('?url=') + 5);
  const decodedUrl = decodeURIComponent(fullUrlString);

  if (!decodedUrl || decodedUrl === 'PENDING') {
    return res.status(400).send('Invalid source payload node.');
  }

  try {
    const response = await axios.get(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://toffeelive.com/',
        'Origin': 'https://toffeelive.com'
      },
      timeout: 7000 // Cut hanging operations early
    });

    const manifest = response.data;
    const host = `${req.protocol}://${req.get('host')}`;

    const lines = manifest.split('\n');
    const updatedLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;

      let absoluteUrl;
      try {
        absoluteUrl = new URL(trimmed, decodedUrl).href;
      } catch (e) {
        return line;
      }

      if (absoluteUrl.includes('.m3u8') || absoluteUrl.includes('.mpd')) {
        return `${host}/api/proxy/stream.m3u8?url=${encodeURIComponent(absoluteUrl)}`;
      }
      return `${host}/api/proxy/chunk?url=${encodeURIComponent(absoluteUrl)}`;
    });

    res.setHeader('Content-Type', 'application/x-mpegURL');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(updatedLines.join('\n'));
  } catch (err) {
    console.error('🚨 Proxy Manifest Fault:', err.message);
    // Send back the actual status code thrown by Toffee CDN to trace geo-blocks (likely 403)
    const statusCode = err.response ? err.response.status : 500;
    return res.status(statusCode).send(`Upstream matrix returned status code: ${statusCode}`);
  }
});

// 2. Binary Media Data Segments (.ts / chunks) Pipeline Proxy
app.get('/api/proxy/chunk', async (req, res) => {
  const fullUrlString = req.url.substring(req.url.indexOf('?url=') + 5);
  const decodedUrl = decodeURIComponent(fullUrlString);

  if (!decodedUrl) return res.status(400).send('Missing segment link asset.');

  try {
    const response = await axios({
      method: 'get',
      url: decodedUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://toffeelive.com/',
        'Origin': 'https://toffeelive.com',
        'Accept': '*/*'
      },
      responseType: 'stream',
      timeout: 10000
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }

    return response.data.pipe(res);
  } catch (err) {
    const statusCode = err.response ? err.response.status : 500;
    return res.status(statusCode).send('Media chunk pipeline transmission failed.');
  }
});

// 2. Binary Media Data Segments (.ts / chunks) Pipeline Proxy
app.get('/api/proxy/chunk', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  try {
    const response = await axios({
      method: 'get',
      url: url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://toffeelive.com/',
        'Origin': 'https://toffeelive.com'
      },
      responseType: 'stream'
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }

    response.data.pipe(res);
  } catch (err) {
    res.status(500).send('Media chunk pipeline transmission failed.');
  }
});
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