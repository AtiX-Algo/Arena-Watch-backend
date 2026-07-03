const cron = require('node-cron');
const axios = require('axios');

cron.schedule('*/5 * * * *', async () => {
  console.log('[Scheduler] Starting automated routine tasks...');
  
  // Dynamically resolve the correct internal port running on Render
  const PORT = process.env.PORT || 5000;
  // Use 127.0.0.1 to route internally without hitting public internet firewalls
  const INTERNAL_BASE_URL = `http://127.0.0.1:${PORT}`;
  
  // Task A: Premium Channels Refresh
  try {
    const response = await axios.post(`${INTERNAL_BASE_URL}/api/channels/refresh-premium`);
    console.log('[Scheduler] Channel refresh completed:', response.data);
  } catch (error) {
    console.error('[Scheduler] Channel refresh failed:', error.response?.data?.message || error.message);
  }

  // Task B: Automated Prediction Scoring
  try {
    console.log('[Scheduler] Checking for recently finished matches to grade...');
    const response = await axios.post(`${INTERNAL_BASE_URL}/api/predictions/auto-evaluate`);
    console.log('[Scheduler] Prediction evaluation completed:', response.data.message);
  } catch (error) {
    console.error('[Scheduler] Prediction evaluation failed:', error.response?.data?.message || error.message);
  }
});

console.log('[Scheduler] started (every 5 minutes).');