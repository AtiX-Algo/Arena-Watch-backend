const express = require('express');
const router = express.Router();
const Prediction = require('../models/Prediction');

// POST a new prediction or update an existing one
router.post('/', async (req, res) => {
  try {
    const { userId, userName, type, matchId, homeScore, awayScore, tournamentWinner } = req.body;
    
    if (!userId) return res.status(401).json({ message: "Unauthorized. Missing User ID." });

    // Build the query to find an existing prediction
    let query = { userId, type };
    if (type === 'match_score') {
      if (!matchId) return res.status(400).json({ message: "Match ID is required." });
      query.matchId = matchId;
    }

    // Use findOne instead of findOneAndUpdate to avoid the TypeError crash
    let existingPrediction = await Prediction.findOne(query);

    if (existingPrediction) {
      // Update the existing document
      existingPrediction.userName = userName;
      if (type === 'match_score') {
        existingPrediction.homeScore = homeScore;
        existingPrediction.awayScore = awayScore;
      }
      if (type === 'tournament') {
        existingPrediction.tournamentWinner = tournamentWinner;
      }
      
      await existingPrediction.save();
      return res.status(200).json(existingPrediction);
    } else {
      // Create a brand new document if it doesn't exist
      const newPrediction = new Prediction(req.body);
      await newPrediction.save();
      return res.status(201).json(newPrediction);
    }
  } catch (err) {
    console.error("Save Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET aggregated stats for charts
router.get('/stats', async (req, res) => {
  try {
    const tournamentStats = await Prediction.aggregate([
      { $match: { type: 'tournament', tournamentWinner: { $exists: true, $ne: "" } } },
      { $group: { _id: '$tournamentWinner', value: { $sum: 1 } } },
      { $project: { name: '$_id', value: 1, _id: 0 } },
      { $sort: { value: -1 } }
    ]);

    // Provide safe defaults if empty
    res.json({ 
      tournamentStats: tournamentStats || []
    });
  } catch (err) {
    console.error("Stats Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET Global Leaderboard (ACCURATE SCORING)
router.get('/leaderboard', async (req, res) => {
  try {
    const leaderboard = await Prediction.aggregate([
      { $match: { userName: { $exists: true, $ne: null } } },
      { $group: { 
          _id: '$userId', 
          userName: { $first: '$userName' },
          // Only count points actually awarded after the match finishes
          points: { $sum: '$points' },
          // FIXED: Changed from $gt: 0 to $eq: 10 to strictly count perfect scores
          correctScores: { 
            $sum: { 
              $cond: [
                { $and: [{ $eq: ['$type', 'match_score'] }, { $eq: ['$isEvaluated', true] }, { $eq: ['$points', 10] }] }, 
                1, 
                0
              ] 
            } 
          } 
        } 
      },
      { $project: { _id: 0, userName: 1, correctScores: 1, points: 1 } },
      { $sort: { points: -1, correctScores: -1 } }, // Tie-breaker: most perfect scores wins
      { $limit: 15 } 
    ]);

    // Attach ranks
    const rankedLeaderboard = leaderboard.map((user, index) => ({
      ...user,
      rank: index + 1
    }));

    res.json(rankedLeaderboard);
  } catch (err) {
    console.error("Leaderboard Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET a specific user's predictions
router.get('/user/:userId', async (req, res) => {
  try {
    const predictions = await Prediction.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(predictions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/predictions/evaluate (ADMIN ONLY - Call this when a match finishes)
router.post('/evaluate', async (req, res) => {
  try {
    const { matchId, actualHomeScore, actualAwayScore } = req.body;

    if (!matchId || actualHomeScore === undefined || actualAwayScore === undefined) {
      return res.status(400).json({ message: "Missing match data." });
    }

    // 1. Find all pending predictions for this specific match
    const predictions = await Prediction.find({ 
      matchId: matchId, 
      type: 'match_score',
      isEvaluated: false 
    });

    let updatedCount = 0;

    // 2. Loop through and grade them
    for (let pred of predictions) {
      let earnedPoints = 0;

      // Rule A: Exact score match (e.g., predicted 2-1, actual 2-1) -> 10 points
      if (pred.homeScore === actualHomeScore && pred.awayScore === actualAwayScore) {
        earnedPoints = 10;
      } 
      // Rule B: Correct outcome/winner (e.g., predicted 3-0 home win, actual 1-0 home win) -> 3 points
      else {
        const predictedDiff = pred.homeScore - pred.awayScore;
        const actualDiff = actualHomeScore - actualAwayScore;
        
        // If the sign of the difference matches, they guessed the correct winner (or correct draw)
        if ((predictedDiff > 0 && actualDiff > 0) || 
            (predictedDiff < 0 && actualDiff < 0) || 
            (predictedDiff === 0 && actualDiff === 0)) {
          earnedPoints = 3;
        }
      }

      // Save the points
      pred.points = earnedPoints;
      pred.isEvaluated = true;
      await pred.save();
      updatedCount++;
    }

    res.status(200).json({ message: `Successfully evaluated ${updatedCount} predictions for match ${matchId}.` });
  } catch (err) {
    console.error("Evaluation Error:", err);
    res.status(500).json({ error: err.message });
  }
});


// POST /api/predictions/auto-evaluate (AUTOMATED VIA CRON JOB)
router.post('/auto-evaluate', async (req, res) => {
  try {
    // Import your Match model to check real-time final scores
    const Match = require('../models/Match'); 

    // 1. Fetch all matches from your database that have officially concluded ('post')
    const finishedMatches = await Match.find({ 'status.state': 'post' });

    if (!finishedMatches || finishedMatches.length === 0) {
      return res.status(200).json({ message: "No newly finished matches found to evaluate." });
    }

    let totalGraded = 0;

    // 2. Loop through finished matches to evaluate user guesses
    for (const match of finishedMatches) {
      const matchId = match.id || match._id.toString();
      const actualHomeScore = match.competitors?.[0]?.score ?? 0;
      const actualAwayScore = match.competitors?.[1]?.score ?? 0;

      // Find un-evaluated user entries matching this specific game node
      const pendingPredictions = await Prediction.find({ 
        matchId: matchId, 
        type: 'match_score',
        isEvaluated: false 
      });

      for (let pred of pendingPredictions) {
        let earnedPoints = 0;

        // Condition A: Perfect Exact Score Combination -> 10 Points
        if (pred.homeScore === actualHomeScore && pred.awayScore === actualAwayScore) {
          earnedPoints = 10;
        } 
        // Condition B: Correct Outcome / Straight Winner Sign -> 3 Points
        else {
          const predictedDiff = pred.homeScore - pred.awayScore;
          const actualDiff = actualHomeScore - actualAwayScore;
          
          if ((predictedDiff > 0 && actualDiff > 0) || 
              (predictedDiff < 0 && actualDiff < 0) || 
              (predictedDiff === 0 && actualDiff === 0)) {
            earnedPoints = 3;
          }
        }

        // Apply scoring properties and seal document
        pred.points = earnedPoints;
        pred.isEvaluated = true;
        await pred.save();
        totalGraded++;
      }
    }

    res.status(200).json({ message: `Successfully automated evaluation for ${totalGraded} user predictions.` });
  } catch (err) {
    console.error("Auto-Evaluation Routine Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;