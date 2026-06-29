const express = require('express');
const router = express.Router();
const axios = require('axios');
const DreamTeam = require('../models/DreamTeam');

// Expanded list of popular National Team IDs to save initial search API calls
// The code will automatically add new countries to this object as users request them!
const NATIONAL_TEAM_IDS = {
  'Argentina': 26,
  'Brazil': 6,
  'France': 67,
  'England': 10,
  'Portugal': 27,
  'Spain': 9,
  'Germany': 25,
  'Italy': 768,
  'Netherlands': 1118,
  'Belgium': 1,
  'USA': 2244,
  'Croatia': 9
};

// In-memory cache to prevent hitting the API-Sports rate limit
const squadCache = {};
const CACHE_TTL = 1000 * 60 * 60 * 24; // Cache lasts for 24 hours

// Helper to map API-Sports positions to your frontend's compact format
const mapPosition = (apiPosition) => {
  const map = { 'Attacker': 'FW', 'Midfielder': 'MF', 'Defender': 'DF', 'Goalkeeper': 'GK' };
  return map[apiPosition] || 'MF';
};

// Helper to generate a consistent "Overall Rating" based on player ID
const generateRating = (playerId) => {
  return 80 + (playerId % 16); 
};

// GET Community Stats (Popular Formations)
router.get('/stats', async (req, res) => {
  try {
    const stats = await DreamTeam.aggregate([
      { $group: { _id: "$formation", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST Save User's Dream Team
router.post('/save', async (req, res) => {
  try {
    const { userId, userName, formation, players } = req.body;
    const team = await DreamTeam.findOneAndUpdate(
      { userId },
      { userName, formation, players },
      { new: true, upsert: true }
    );
    res.status(201).json(team);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET Players by Country (API-Sports Integration)
router.get('/players/:country', async (req, res) => {
  const { country } = req.params;
  
  // If "All", we just combine a few cached teams for the overview
  if (country === 'All') {
    let allPlayers = [];
    Object.values(squadCache).forEach(cacheObj => {
      allPlayers = [...allPlayers, ...cacheObj.data];
    });
    return res.json(allPlayers.slice(0, 100)); // Limit to 100 to prevent massive payloads
  }

  // 1. Check the Squad Cache first!
  const now = Date.now();
  if (squadCache[country] && (now - squadCache[country].timestamp < CACHE_TTL)) {
    console.log(`[Cache Hit] Serving squad for ${country}`);
    return res.json(squadCache[country].data);
  }

  try {
    let teamId = NATIONAL_TEAM_IDS[country];

    // 2. DYNAMIC ID LOOKUP: If the country isn't in our list, ask the API for it
    if (!teamId) {
      console.log(`[API Request] Searching for national team ID for ${country}...`);
      const searchRes = await axios.get(`https://v3.football.api-sports.io/teams?search=${country}`, {
        headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY }
      });

      // Filter the search results to ensure we get the "National" team, not a local club with a similar name
      const teamData = searchRes.data.response.find(r => r.team.national === true);
      
      if (!teamData) {
        return res.status(404).json({ message: `Could not find a national team matching "${country}".` });
      }
      
      teamId = teamData.team.id;
      
      // Save it to our memory mapping so we never have to search for this specific country again
      NATIONAL_TEAM_IDS[country] = teamId;
      console.log(`[Success] Found ID ${teamId} for ${country}`);
    }

    // 3. Fetch Squad from API-Sports using the resolved teamId
    console.log(`[API Request] Fetching squad for ${country} from API-Sports...`);
    const response = await axios.get(`https://v3.football.api-sports.io/players/squads?team=${teamId}`, {
      headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY }
    });

    const apiData = response.data.response[0];
    if (!apiData || !apiData.players) {
      return res.json([]);
    }

    // 4. Map the raw API data to your Dream XI frontend format
    const formattedPlayers = apiData.players.map(p => ({
      id: p.id.toString(),
      name: p.name,
      rating: generateRating(p.id),
      position: mapPosition(p.position),
      country: country,
      imageUrl: p.photo 
    }));

    // 5. Save to Cache
    squadCache[country] = {
      timestamp: now,
      data: formattedPlayers
    };

    res.json(formattedPlayers);
    
  } catch (err) {
    console.error("API-Sports Error:", err.message);
    res.status(500).json({ error: "Failed to fetch players from API." });
  }
});

module.exports = router;