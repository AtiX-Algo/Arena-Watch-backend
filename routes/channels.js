const express = require('express');
const router = express.Router();
const Channel = require('../models/Channel');
const { executeSecureCapture, discoverKickBDMatches } = require('../services/scraperEngine');

router.get('/', async (req, res) => {
  try {
    const channels = await Channel.find().sort({ name: 1 });
    res.json(channels);
  } catch (err) {
    res.status(500).json({ message: "Server Error fetching channels" });
  }
});

router.post('/seed-payload', async (req, res) => {
  try {
    const collectedStreams = [
      {
        id: "premium_pro_1", name: "Premium Pro 1 (Bokul Automation)", category: "Premium Streams", type: "hls",
        servers: [{ serverId: "p1", name: "Auto Engine 1", url: "PENDING", quality: "Dynamic", isActive: true }]
      },
      {
        id: "premium_pro_2", name: "Premium Pro 2 (KickBD Automation)", category: "Premium Streams", type: "hls",
        servers: [{ serverId: "p2", name: "Auto Engine 2", url: "PENDING", quality: "Dynamic", isActive: true }]
      },
      {
        id: "premium_pro_3", name: "Premium Pro 3 (StreamedPK Auto)", category: "Premium Streams", type: "hls",
        servers: [{ serverId: "p3", name: "Auto Engine 3", url: "PENDING", quality: "Dynamic", isActive: true }]
      },
      {
        id: "premium_bdiptv_1", 
        name: "BDIPTV Premium 1 (Live 1)", 
        category: "Premium Streams", 
        logo: "https://placehold.co/400x400/png?text=BDIPTV", 
        type: "hls",
        servers: [{ serverId: "bd1", name: "Ready for Scraper Sync...", url: "PENDING", quality: "HD", isActive: true }]
      },
      {
        id: "premium_bdiptv_2", 
        name: "BDIPTV Premium 2 (Live 2)", 
        category: "Premium Streams", 
        logo: "https://placehold.co/400x400/png?text=BDIPTV", 
        type: "hls",
        servers: [{ serverId: "bd2", name: "Ready for Scraper Sync...", url: "PENDING", quality: "HD", isActive: true }]
      }
      // Add the rest of your historical static channels here exactly as they were...
    ];

    await Channel.bulkWrite(
      collectedStreams.map(stream => ({
        updateOne: {
          filter: { id: stream.id },
          update: { $set: stream },
          upsert: true
        }
      }))
    );

    res.status(201).json({ success: true, message: `All ${collectedStreams.length} channels safely synced into Atlas.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/scrape-pro', async (req, res) => {
  const { channelId, serverId, targetUrl } = req.body;
  if (!channelId || !serverId || !targetUrl) {
    return res.status(400).json({ success: false, message: "Missing tracking parameters." });
  }

  try {
    const extractedUrl = await executeSecureCapture(targetUrl); 
    
    if (!extractedUrl) {
      return res.status(404).json({ success: false, message: "Handshake completed but no target token stream found." });
    }

    const updatedChannel = await Channel.findOneAndUpdate(
      { id: channelId, "servers.serverId": serverId },
      { $set: { "servers.$.url": extractedUrl } },
      { returnDocument: 'after' }
    );
    res.json({ success: true, stream: extractedUrl, channel: updatedChannel });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Automation Endpoint for Cron
router.post('/refresh-premium', async (req, res) => {
  try {
    console.log('[Scheduler] Fetching strictly LIVE matches from KickBD...');
    const liveMatches = await discoverKickBDMatches('https://kickbd.org');
    const results = [];

    const targetMap = {
      'premium_pro_1': liveMatches[0],
      'premium_pro_2': liveMatches[1] || liveMatches[0], 
      'premium_pro_3': liveMatches[2] || liveMatches[0]
    };

    const premiumChannels = await Channel.find({ 
      id: { $in: [
        'premium_pro_1', 'premium_pro_2', 'premium_pro_3',
        'premium_bdiptv_1', 'premium_bdiptv_2'
      ]} 
    });

    for (const channel of premiumChannels) {
      try {
        let serversData = [];

        if (channel.id.includes('bdiptv')) {
          console.log(`[Scheduler] Routing ${channel.id} to BDIPTV Scraper...`);
          // Use the master engine on the base URL
          const bdiptvNodes = await executeSecureCapture('http://tv.bdiptv.net/');
          
          // Filter the results to assign the correct server array to the correct channel
          const targetLabel = channel.id === 'premium_bdiptv_1' ? 'LIVE 1' : 'LIVE 2';
          const matchedNode = bdiptvNodes.find(node => node.name.includes(targetLabel));
          
          // If we found the specific node, array it. Otherwise fallback to whatever it caught.
          serversData = matchedNode ? [matchedNode] : bdiptvNodes;

        } else {
          console.log(`[Scheduler] Routing ${channel.id} to KickBD Scraper...`);
          const targetUrl = targetMap[channel.id];
          if (!targetUrl) {
            results.push({ channelId: channel.id, success: false, reason: "No KickBD match available" });
            continue;
          }
          serversData = await executeSecureCapture(targetUrl); 
        }
        
        if (serversData && serversData.length > 0) {
          const newServersArray = serversData.map((srv, index) => ({
            serverId: `auto_srv_${index + 1}_${Date.now()}`,
            name: srv.name, 
            url: srv.url,
            quality: "Dynamic HD",
            isActive: true
          }));

          await Channel.findOneAndUpdate(
            { id: channel.id },
            { $set: { servers: newServersArray } },
            { returnDocument: 'after' } 
          );
          
          results.push({ channelId: channel.id, success: true, serverCount: newServersArray.length });
        } else {
           results.push({ channelId: channel.id, success: false, reason: "No links captured" });
        }
      } catch (err) {
        results.push({ channelId: channel.id, success: false, error: err.message });
      }
    }
    res.json({ success: true, targets: targetMap, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;