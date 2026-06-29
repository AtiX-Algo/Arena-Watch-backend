const express = require('express');
const router = express.Router();
const axios = require('axios');

// ESPN Scoreboard API for World Cup matches
const ESPN_SOCCER_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260610-20260720';

// Caching layer (15 seconds cache to keep it highly real-time but prevent spamming)
const CACHE_TTL_MS = 15000;
let cache = { scheduleData: null, fetchedAt: 0 };

// 1. GET / (This becomes /api/matches because of server.js)
router.get('/', async (req, res) => {
  try {
    const now = Date.now();
    
    // Serve from cache if fresh
    if (cache.scheduleData && now - cache.fetchedAt < CACHE_TTL_MS) {
      return res.json(cache.scheduleData);
    }

    // Fetch from ESPN
    const response = await axios.get(ESPN_SOCCER_URL);
    const events = response.data.events || [];

    // Transform into the exact object format your React Frontend expects
    const scheduleArray = events.map(event => {
      const competition = event.competitions?.[0] || {};
      const competitorsRaw = competition.competitors || [];
      
      const competitors = competitorsRaw.map(c => ({
        homeAway: c.homeAway, // Matches 'home' or 'away'
        displayName: c.team?.displayName || 'TBD',
        score: parseInt(c.score, 10) || 0,
        logo: c.team?.logo || 'https://upload.wikimedia.org/wikipedia/commons/e/e0/FIFA_World_Cup_2026_logo.svg'
      }));

      // Get match metadata (e.g., "Group A" or "Quarter-final")
      const groupNote = competition.notes?.[0]?.text || 'FIFA World Cup';

      return {
        id: event.id?.toString(),
        date: event.date, // ISO Date String
        status: {
          state: event.status?.type?.state || 'pre', // Maps perfectly to 'pre', 'in', or 'post'
          displayClock: event.status?.displayClock || '' // e.g., "45'", "FT"
        },
        competitors: competitors,
        venue: competition.venue?.fullName || 'FIFA World Cup Stadium',
        groupNote: groupNote
      };
    });

    // Update cache
    cache.scheduleData = scheduleArray;
    cache.fetchedAt = now;

    res.json(cache.scheduleData);
  } catch (err) {
    console.error('❌ ESPN API Error:', err.message);
    // Fallback to stale cache if API goes offline temporarily
    if (cache.scheduleData) return res.json(cache.scheduleData);
    res.status(502).json({ error: 'Failed to fetch matches from ESPN hub.' });
  }
});

// 2. GET /live (This becomes /api/matches/live)
router.get('/live', async (req, res) => {
  try {
    // FIX: Send the actual schedule data instead of an empty object
    // so the Bracket component actually has data to render!
    res.json(cache.scheduleData || []);
  } catch (err) {
    res.json([]);
  }
});

module.exports = router;