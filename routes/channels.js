const express = require('express');
const router = express.Router();
const Channel = require('../models/Channel');
const { executeSecureCapture, discoverKickBDMatches } = require('../services/scraperEngine');

// GET all channels sorted by name
router.get('/', async (req, res) => {
  try {
    const channels = await Channel.find().sort({ name: 1 });
    res.json(channels);
  } catch (err) {
    res.status(500).json({ message: "Server Error fetching channels" });
  }
});

// POST - Comprehensive Stream Seeder (Upserting All 19 Channels)
router.post('/seed-payload', async (req, res) => {
  try {
    const collectedStreams = [
      // === AUTOMATED SCRAPER SLOTS (PREMIUM PRO CHANNELS) ===
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


      // === NEW BDIPTV CHANNELS ===
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
      },
      // === HISTORICAL CHANNELS POOL ===
      // === HISTORICAL CHANNELS POOL ===
      {
        id: "caze_tv", 
        name: "CazéTV (No VPN)", 
        category: "Global", 
        logo: "https://placehold.co/400x400/png?text=CazeTV", 
        type: "hls", // Change back to HLS!
        servers: [
          { 
            serverId: "caze_hls_1", 
            name: "Cloudfront CDN (Direct)", 
            url: "https://dfr80qz435crc.cloudfront.net/MNOP/Amagi/Caze/Caze_TV_BR/Caze_TV.m3u8", 
            quality: "1080p", 
            isActive: true 
          },
          { 
            serverId: "caze_hls_2", 
            name: "YouTube Proxy (Armelin)", 
            url: "https://ythls.armelin.one/channel/UCZiYbVptd3PVPf4f6eR6UaQ.m3u8", 
            quality: "1080p", 
            isActive: true 
          }
        ]
      },
      {
        id: "caze_tv_1", 
        name: "CazéTV (No VPN 1)", 
        category: "Global", 
        logo: "https://placehold.co/400x400/png?text=CazeTV", 
        type: "hls", // 🔥 Changed back to HLS!
        servers: [
          { 
            serverId: "caze_hls_1", 
            name: "Amagi CDN (Direct)", 
            url: "https://dfr80qz435crc.cloudfront.net/MNOP/Amagi/Caze/Caze_TV_BR/Caze_TV.m3u8", 
            quality: "1080p", 
            isActive: true 
          },
          { 
            serverId: "caze_hls_2", 
            name: "YTHLS Proxy Server", 
            url: "https://ythls.armelin.one/channel/UCZiYbVptd3PVPf4f6eR6UaQ.m3u8", 
            quality: "1080p", 
            isActive: true 
          }
        ]
      },
      {
        id: "sky_sports_pl", name: "Sky Sports Premier League", category: "Premier League", logo: "https://placeholder.com/sky", type: "hls",
        servers: [
          { serverId: "srv_hls_1", name: "Server 1 (HD)", url: "https://example.com/stream1.m3u8", quality: "HD", isActive: true },
          { serverId: "srv_hls_2", name: "Backup (SD)", url: "https://example.com/stream2.m3u8", quality: "SD", isActive: true }
        ]
      },
      {
        id: "fifa_world_cup_2026_toffee", name: "FIFA World Cup 2026 (Toffee Servers)", category: "Sports", logo: "https://i.ibb.co.com/vnbkF0r/fifa-world-cup-2026-logo-png-seeklogo-665644.png", type: "hls",
        servers: [
          { serverId: "tf_1", name: "Server 1 (HLS Adaptive)", url: "https://prod-cdn01-live.toffeelive.com/live/FIFA-2026/index.m3u8?edge-cache-token=Expires=1782504063~Starts=1782417663~URLPrefix=aHR0cHM6Ly9wcm9kLWNkbjAxLWxpdmUudG9mZmVlbGl2ZS5jb20~Signature=cLNmYE7EXqsvPz4sGwMdmDeqlxeT4CK4kFtT_3ef9RIQ43wVbnuiVsmGw4fqyFUtcTMnt2zx_t-W4DrJhPieBw", quality: "1080p", isActive: true },
          { serverId: "tf_2", name: "Server 2 (600p Optimized)", url: "https://prod-cdn01-live.toffeelive.com/live/FIFA-2026/4/master_600.m3u8?hdntl=Expires=1782504797~_GO=Generated~URLPrefix=aHR0cHM6Ly9wcm9kLWNkbjAxLWxpdmUudG9mZmVlbGl2ZS5jb20~Signature=AVXEwvfUow4v3vWYulYKKkZMPpmfvyZRnbyChwUW8Qm7g9aJK9_DluZkR6PshI7TIo9-FXXnrIXmQ5nUVFaFQlhTt80I", quality: "SD", isActive: true }
        ]
      },
      {
        id: "fifa_plus_eng", name: "FIFA Plus English", category: "Sports", logo: "https://i.ibb.co.com/vnbkF0r/fifa-world-cup-2026-logo-png-seeklogo-665644.png", type: "hls",
        servers: [{ serverId: "ff_1", name: "Server 1", url: "https://a62dad94.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0ZJRkFQbHVzRW5nbGlzaF9ITFM/playlist.m3u8", quality: "HD", isActive: true }]
      },
      {
        id: "fox_sports_2", name: "Fox Sports 2", category: "Sports", logo: "https://imglink.cc/cdn/o5BoWU_BEz.png", type: "hls",
        servers: [{ serverId: "fx_1", name: "Server 1", url: "https://tvsen7.aynaott.com/foxsports2/index.m3u8?e=1779283790&u=78be6644-0a65-48ec-81a4-089ac65a2619&token=cbb7f40b4af7be51a91e0629a5ac7238", quality: "HD", isActive: true }]
      },
      {
        id: "t_sports_hd", name: "T Sports HD", category: "Sports", logo: "https://i.ibb.co.com/mrvT7b6G/T-Sports-HD.png", type: "hls",
        servers: [
          { serverId: "ts_1", name: "Server 1", url: "http://27.124.71.27/T-Sports/index.m3u8", quality: "HD", isActive: true },
          { serverId: "ts_2", name: "Server 2", url: "https://tvsen7.aynaott.com/tsports-hd/index.m3u8?e=1779283784&u=78be6644-0a65-48ec-81a4-089ac65a2619&token=3b4c5a2cfa872fa7f91ffbfb4aa0f658", quality: "1080p", isActive: true }
        ]
      },
      {
        id: "bein_sports_1", name: "beIN Sports 1", category: "Sports", logo: "https://imglink.cc/cdn/kIiut6WBq0.jpg", type: "hls",
        servers: [
          { serverId: "be_1", name: "Server 1", url: "http://ua.online24.pm/play/1101/350B326FB34F4B8/video.m3u8", quality: "HD", isActive: true },
          { serverId: "be_2", name: "Server 2", url: "http://27.124.71.27/beIN_Sports_1/index.m3u8", quality: "SD", isActive: true },
          { serverId: "be_3", name: "Server 3", url: "https://andro.226503.xyz/checklist/androstreamlivebs1.m3u8", quality: "HD", isActive: true }
        ]
      },
      {
        id: "tnt_sports_1", name: "TNT Sports 1", category: "Sports", logo: "https://imglink.cc/cdn/VHUi569tAW.jpg", type: "hls",
        servers: [{ serverId: "tnt_1", name: "Server 1", url: "http://27.124.71.27/TNT_Sports_1/index.m3u8", quality: "HD", isActive: true }]
      },
      {
        id: "espn_sports", name: "ESPN Sports", category: "Sports", logo: "https://imglink.cc/cdn/aqlLWjDMNH.png", type: "hls",
        servers: [{ serverId: "espn_1", name: "Server 1", url: "https://tvsen5.aynaott.com/espn/index.m3u8", quality: "HD", isActive: true }]
      },
      {
        id: "ptv_sports", name: "PTV Sports", category: "Sports", logo: "https://imglink.cc/cdn/wHhztDDZrU.png", type: "hls",
        servers: [{ serverId: "ptv_1", name: "Server 1", url: "https://tvsen5.aynaott.com/PtvSports/index.m3u8", quality: "HD", isActive: true }]
      },
      {
        id: "toffee_fifa_pro_1", name: "Toffee FIFA 2026 Pro (Main)", category: "Sports", type: "hls",
        servers: [{ serverId: "tf_1", name: "Main Stream", url: "http://160.25.249.226:8099/LIVE/tracks-v1/index.fmp4.m3u8?token=d049a1e35b6c5083fab4c14a4b3a410290ddefed-283a25474db74f6b422205f4d65cbc5b-1782511836-1782501036", quality: "1080p", isActive: true }]
      },
      {
        id: "toffee_fifa_pro_2", name: "Toffee FIFA 2026 Pro (Sec)", category: "Sports", type: "hls",
        servers: [{ serverId: "tf_2", name: "Secondary Live", url: "http://160.25.249.226:8099/2LIVE/tracks-v1/index.fmp4.m3u8?token=cf20b5b881102e5008bd173f9a5d2b3ae02a4684-5c99731b1ea13cb68e83f2f09d1bda0a-1782511994-1782501194", quality: "1080p", isActive: true }]
      },
      {
        id: "bsports_mux", name: "BSports Mux", category: "Sports", type: "hls",
        servers: [{ serverId: "bs_1", name: "High Quality", url: "https://storage.googleapis.com/bluejaysx/bsports/mux_audio/index-1.m3u8", quality: "HD", isActive: true }]
      },
      {
        id: "toffee_fifa_1750", name: "Toffee FIFA 2026 (1750kbps)", category: "Sports", logo: "https://i.ibb.co.com/vnbkF0r/fifa-world-cup-2026-logo-png-seeklogo-665644.png", type: "hls",
        servers: [{ serverId: "tf_1750", name: "Server 1 (1750k)", url: "https://prod-cdn01-live.toffeelive.com/live/FIFA-2026/0/master_1750.m3u8?hdntl=Expires=1782586184~_GO=Generated~URLPrefix=aHR0cHM6Ly9wcm9kLWNkbjAxLWxpdmUudG9mZmVlbGl2ZS5jb20~Signature=AVXEwvd6GaERcs08H_978wGhj7_lQXFt3Hv4I0fZiSNLMF5sm18itOP0Vcu8ROf392zU0OWa_aW4v2T0zG9AJU_WItIM", quality: "720p", isActive: true }]
      },
      {
        id: "pldt_fifa_ppv", name: "PLDT Akamai FIFA PPV", category: "Sports", logo: "https://i.ibb.co.com/vnbkF0r/fifa-world-cup-2026-logo-png-seeklogo-665644.png", type: "dash",
        servers: [{ serverId: "pldt_1", name: "Main DASH Server", url: "https://qp-pldt-live-bpk-ucd-prod.akamaized.net/bpk-tv/fifa_ppv1/default/index.mpd", quality: "HD", isActive: true }]
      },
      {
        id: "sportsnet_bokul", name: "Sportsnet (Bokul)", category: "Sports", logo: "https://imglink.cc/cdn/o5BoWU_BEz.png", type: "hls",
        servers: [{ serverId: "bs_bokul_1", name: "Direct CDN Stream", url: "https://storage.googleapis.com/bluejaysx/sportnet/manifest.m3u8", quality: "HD", isActive: true }]
      }
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

// Dynamic Scraper Route (Manual Trigger)
router.post('/scrape-pro', async (req, res) => {
  const { channelId, serverId, targetUrl } = req.body;
  if (!channelId || !serverId || !targetUrl) {
    return res.status(400).json({ success: false, message: "Missing tracking parameters." });
  }

  try {
    const extractedUrl = await executeSecureCapture(targetUrl); // Engine handles config internally
    
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

    if (liveMatches.length === 0) {
      return res.status(404).json({ success: false, message: "No active live matches found right now." });
    }

    const targetMap = {
      'premium_pro_1': liveMatches[0],
      'premium_pro_2': liveMatches[1] || liveMatches[0], 
      'premium_pro_3': liveMatches[2] || liveMatches[0]  
    };

    const premiumChannels = await Channel.find({ id: { $in: ['premium_pro_1', 'premium_pro_2', 'premium_pro_3'] } });
    const results = [];

    for (const channel of premiumChannels) {
      const targetUrl = targetMap[channel.id];
      if (!targetUrl) continue;

      try {
        // Execute capture returns an ARRAY of servers now
        const serversData = await executeSecureCapture(targetUrl); 
        
        if (serversData && serversData.length > 0) {
          // Format the array to match your database schema
          const newServersArray = serversData.map((srv, index) => ({
            serverId: `auto_srv_${index + 1}`,
            name: srv.name, // e.g., "Detected Server 1"
            url: srv.url,
            quality: "Dynamic",
            isActive: true
          }));

          // Replace the ENTIRE servers array for this channel
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