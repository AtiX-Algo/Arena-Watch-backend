const cron = require('node-cron');
const axios = require('axios');

cron.schedule('*/5 * * * *', async () => {
  console.log('[Scheduler] Starting automated routine tasks...');
  
  // Task A: Premium Channels Refresh
  try {
    const response = await axios.post('http://localhost:5000/api/channels/refresh-premium');
    console.log('[Scheduler] Channel refresh completed:', response.data);
  } catch (error) {
    console.error('[Scheduler] Channel refresh failed:', error.message);
  }

  // Task B: Automated Prediction Scoring
  try {
    console.log('[Scheduler] Checking for recently finished matches to grade...');
    const response = await axios.post('http://localhost:5000/api/predictions/auto-evaluate');
    console.log('[Scheduler] Prediction evaluation completed:', response.data.message);
  } catch (error) {
    console.error('[Scheduler] Prediction evaluation failed:', error.response?.data?.message || error.message);
  }
});

console.log('[Scheduler] started (every 5 minutes).');