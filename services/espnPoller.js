const axios = require('axios');
const Match = require('../models/Match');

const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

let cachedMatches = []; // Store data in server memory for instant pushes

const pollESPN = async (io) => {
  try {
    const { data } = await axios.get(ESPN_URL);
    if (!data.events || data.events.length === 0) return;

    cachedMatches = data.events.map(event => {
      return {
        id: event.id,
        date: event.date,
        name: event.name,
        groupNote: event.competitions[0]?.altGameNote || data.leagues[0]?.name,
        venue: event.competitions[0].venue?.fullName,
        status: {
          state: event.status.type.state,
          displayClock: event.status.displayClock,
          detail: event.status.type.shortDetail
        },
        competitors: event.competitions[0].competitors.map(comp => {
          // EXTRACT GOALSCORERS FROM ESPN PAYLOAD
          let scorers = [];
          const goalLeader = comp.leaders?.find(l => l.name === 'goals' || l.name === 'goalsLeaders');
          if (goalLeader && goalLeader.leaders) {
             scorers = goalLeader.leaders.map(l => ({
                name: l.athlete.shortName,
                goals: l.value
             }));
          }

          return {
            id: comp.id,
            displayName: comp.team.displayName,
            abbreviation: comp.team.abbreviation,
            logo: comp.team.logo,
            score: comp.score,
            homeAway: comp.homeAway,
            winner: comp.winner,
            scorers: scorers
          };
        })
      };
    });

    for (const match of cachedMatches) {
      await Match.findOneAndUpdate({ id: match.id }, match, { upsert: true, returnDocument: 'after' });
    }

    io.emit('matchUpdates', cachedMatches);

  } catch (error) {
    console.error('❌ ESPN Poller Error:', error.message);
  }
};

// Expose the cache so new users get data instantly
const getCachedMatches = () => cachedMatches;

const startPolling = (io) => {
  pollESPN(io); 
  // INCREASED SPEED: Poll every 10 seconds instead of 30!
  setInterval(() => pollESPN(io), 10000); 
};

module.exports = { startPolling, getCachedMatches };