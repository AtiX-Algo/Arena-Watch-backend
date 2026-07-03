const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const INTERACTION_PROFILES = {
  DIRECT_PLAYER: 'direct_player',
  OVERLAY_DISMISS: 'overlay_dismiss',
  STANDARD_LOAD: 'standard_load'
};

const SITE_CONFIGS = {
  'bokulsports.com': {
    profile: INTERACTION_PROFILES.OVERLAY_DISMISS,
    selector: 'video, #player, .jw-video, iframe',
    adBlockTerms: ['googleads', 'doubleclick', 'popunder', 'histats', 'onclick'],
    targetExtensions: ['.m3u8', '.mpd'],
    clickDelay: 2000,
    waitAfterClick: 8000,
  },
  'kickbd': { 
    profile: INTERACTION_PROFILES.OVERLAY_DISMISS,
    selector: 'video, .play-button, .vjs-big-play-button, #player',
    adBlockTerms: ['googleads', 'analytics', 'popunder', 'onclickads', 'tracking'],
    targetExtensions: ['.m3u8', '.mpd'],
    clickDelay: 1500,
    waitAfterClick: 7000,
  },
  'streamed.pk': {
    profile: INTERACTION_PROFILES.DIRECT_PLAYER,
    selector: 'iframe[src*="player"], #player iframe, video',
    adBlockTerms: ['googleads', 'doubleclick', 'mgid'],
    targetExtensions: ['.m3u8', '.mpd'],
    clickDelay: 3000,
    waitAfterClick: 8000,
  }
};

const DEFAULT_CONFIG = {
  profile: INTERACTION_PROFILES.STANDARD_LOAD,
  selector: null,
  adBlockTerms: ['googleads', 'analytics', 'doubleclick', 'popunder', 'juicyads', 'exoclick'],
  targetExtensions: ['.m3u8', '.mpd'],
  clickDelay: 2000,
  waitAfterClick: 5000,
};

function getSiteConfig(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    for (const [domain, config] of Object.entries(SITE_CONFIGS)) {
      if (hostname.includes(domain)) return config;
    }
  } catch (e) { }
  return DEFAULT_CONFIG;
}

function createInterceptor(adBlockTerms, targetExtensions, onCapture) {
  return (req) => {
    if (req.isInterceptResolutionHandled && req.isInterceptResolutionHandled()) return;
    try {
      const url = req.url().toLowerCase();
      if (adBlockTerms.some(term => url.includes(term))) {
        return req.abort().catch(() => { });
      }

      const isTarget = targetExtensions.some(ext => url.includes(ext));
      if (isTarget && !url.includes('/ad') && !url.includes('blank') && !url.includes('pre-roll')) {
        onCapture(req.url());
      }

      if (!req.isInterceptResolutionHandled || !req.isInterceptResolutionHandled()) {
        req.continue().catch(() => { });
      }
    } catch (error) {
      try { if (!req.isInterceptResolutionHandled()) req.continue().catch(() => { }); } catch (_) { }
    }
  };
}

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        '--mute-audio'
      ]
    });

    browserInstance.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        setTimeout(async () => {
          try {
            const newPage = await target.page();
            if (newPage) {
              const url = newPage.url();
              if (url !== 'about:blank') {
                await newPage.close().catch(() => { });
              }
            }
          } catch (e) { }
        }, 500);
      }
    });
  }
  return browserInstance;
}

// 🔥 NEW: Resilient Evaluation Wrapper
// This catches detached frames and execution context destruction, waiting for the page to settle before retrying.
async function safeEvaluate(page, fn, ...args) {
  for (let i = 0; i < 3; i++) {
    try {
      return await page.evaluate(fn, ...args);
    } catch (e) {
      if (e.message.includes('detached') || e.message.includes('Execution context') || e.message.includes('Target closed')) {
        console.log(`[Scraper] Frame mutation detected. Waiting for dust to settle (Retry ${i + 1}/3)...`);
        await new Promise(r => setTimeout(r, 2500)); 
      } else {
        throw e;
      }
    }
  }
  throw new Error('Frame remained detached after maximum retries.');
}

async function aggressiveClickLoop(page, maxClicks = 3, delay = 2000) {
  try {
    const viewport = page.viewport();
    if (!viewport) return;
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    for (let i = 0; i < maxClicks; i++) {
      await page.mouse.click(centerX, centerY).catch(() => {});
      await new Promise(r => setTimeout(r, delay));
    }
  } catch (e) {
    // Suppress interaction context errors
  }
}

// -------------------------------------------------------------
// MULTI-SERVER CAPTURE
// -------------------------------------------------------------
async function executeSecureCapture(targetUrl, retries = 2) {
  const config = getSiteConfig(targetUrl);
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    let uniqueServerMap = new Map();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 720 });
      await page.setRequestInterception(true);

      let currentLabel = "Primary Stream";

      page.on('request', createInterceptor(config.adBlockTerms, config.targetExtensions, (detectedUrl) => {
        if (!uniqueServerMap.has(detectedUrl)) {
          uniqueServerMap.set(detectedUrl, currentLabel);
        }
      }));

      console.log(`[Scraper] Initializing capture for: ${targetUrl} (Attempt ${attempt}/${retries})`);
      
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(e => {
        if (!e.message.includes('detached') && !e.message.includes('Target closed')) throw e;
      });
      
      await new Promise(r => setTimeout(r, 6000));

      // Uses the new safeEvaluate wrapper
      const serverButtonTexts = await safeEvaluate(page, () => {
        const structuralElements = Array.from(document.querySelectorAll('button, a, span, div, li'));
        const matches = structuralElements.filter(el => {
          const txt = (el.innerText || '').trim();
          return /Server|Stream|Link|Player|HD|SD|Toffee|Fox|Caze|Extreme|Sports/i.test(txt) && txt.length > 0 && txt.length < 25;
        });
        return [...new Set(matches.map(el => (el.innerText || '').trim()))];
      });

      if (serverButtonTexts && serverButtonTexts.length > 0) {
        console.log(`[Scraper] Detected ${serverButtonTexts.length} potential routing links. Interrogating...`);

        for (const label of serverButtonTexts.slice(0, 6)) {
          if (uniqueServerMap.size > 0) break; 
          currentLabel = label;

          try {
            const clickedSuccessfully = await safeEvaluate(page, (targetText) => {
              const items = Array.from(document.querySelectorAll('button, a, span, div, li'));
              const element = items.find(el => (el.innerText || '').trim() === targetText);
              if (element) {
                element.scrollIntoView({ block: 'center' });
                element.click();
                return true;
              }
              return false;
            }, label);

            if (clickedSuccessfully) {
              await new Promise(r => setTimeout(r, 2000));
              await aggressiveClickLoop(page, 1, 1000);
              await new Promise(r => setTimeout(r, 3000));
            }
          } catch (loopErr) {
            console.log(`[Scraper] Could not interrogate '${label}'. Skipping to next...`);
          }
        }
      } else {
        console.log(`[Scraper] Flat elements. Checking embedded iframe nodes...`);
        const iframeSrc = await safeEvaluate(page, () => {
          const iframes = Array.from(document.querySelectorAll('iframe'));
          return iframes.length > 0 ? iframes[0].src : null;
        });

        if (iframeSrc && iframeSrc !== 'about:blank') {
          currentLabel = "Iframe Embed Gateway";
          await page.goto(iframeSrc, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
          await new Promise(r => setTimeout(r, 4000));
          await aggressiveClickLoop(page, 3, config.clickDelay);
          await new Promise(r => setTimeout(r, config.waitAfterClick));
        }
      }

      if (uniqueServerMap.size > 0) {
        const serverObjects = Array.from(uniqueServerMap.entries()).map(([url, label], index) => ({
          name: `${label} (Node ${index + 1})`,
          url: url
        }));

        console.log(`[Scraper] SUCCESS! Captured ${serverObjects.length} unique servers.`);
        return serverObjects;
      } else {
        throw new Error('No valid manifest streaming link captured.');
      }

    } catch (error) {
      lastError = error;
      console.warn(`[Scraper] Attempt ${attempt} failed: ${error.message}`);
      if (attempt < retries) await new Promise(r => setTimeout(r, 2000));
    } finally {
      await page.close().catch(() => { });
    }
  }
  throw lastError || new Error('Scraping completely failed.');
}

// -------------------------------------------------------------
// LIVE FILTER DISCOVERY
// -------------------------------------------------------------
async function discoverKickBDMatches(baseUrl = 'https://kickbd.org') {
  console.log(`[Discovery] Scanning ${baseUrl} for active LIVE links...`);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.isInterceptResolutionHandled && req.isInterceptResolutionHandled()) return;
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort().catch(() => { });
      } else {
        req.continue().catch(() => { });
      }
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // Uses the safeEvaluate wrapper
    const matchLinks = await safeEvaluate(page, () => {
      const links = Array.from(document.querySelectorAll('a[href*="/matches/"]'));
      const activeUrls = [];

      links.forEach(link => {
        const text = link.innerText ? link.innerText.toUpperCase() : '';
        const href = link.href.toLowerCase();

        const isMatchTarget = href.includes('world-cup') || href.includes('fifa') || href.includes('round-of');
        const isLive = text.includes('LIVE') || text.includes('WATCH') || text.includes('MIN');

        if (isMatchTarget || isLive) {
          activeUrls.push(link.href);
        }
      });
      return [...new Set(activeUrls)].slice(0, 5);
    });

    console.log(`[Discovery] Successfully locked onto ${matchLinks.length} dynamic match paths.`);
    return matchLinks;
  } catch (error) {
    console.error('[Discovery] Failed to extract links:', error.message);
    return [];
  } finally {
    await page.close().catch(() => { });
  }
}

// -------------------------------------------------------------
// BDIPTV TARGETED CAPTURE
// -------------------------------------------------------------
async function scrapeBDIPTVChannel(channelText = 'LIVE 1', retries = 2) {
  const vanillaPuppeteer = require('puppeteer');
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const browser = await vanillaPuppeteer.launch({
      headless: true, 
      ignoreHTTPSErrors: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--allow-running-insecure-content',
        '--disable-extensions',
        '--disable-features=BlockInsecurePrivateNetworkRequests,IsolateOrigins,site-per-process,HttpsUpgrades,OptimizationHints,HttpsFirstBalancedModeAutoEnable',
        '--disable-client-side-phishing-detection',
        '--safebrowsing-disable-download-protection',
        '--safebrowsing-disable-auto-update',
        '--ignore-certificate-errors',
        '--async-dns',
        '--force-fieldtrials=BuiltInDns/Enable/'
      ]
    });

    const page = await browser.newPage();
    let capturedUrl = null;

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 720 });

      page.on('response', (response) => {
        const url = response.url().toLowerCase();
        if ((url.includes('.m3u8') || url.includes('.mpd')) && !url.includes('blank')) {
          capturedUrl = response.url();
        }
      });

      console.log(`[BDIPTV] Loading portal for channel: '${channelText}' (Attempt ${attempt}/${retries})`);
      await page.goto('http://tv.bdiptv.net/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 6000));

      const clicked = await page.evaluate((text) => {
        const elements = Array.from(document.querySelectorAll('div, a, span, button, h3, p, li'));
        const target = elements.find(el => {
          const elText = (el.innerText || '').trim().toUpperCase();
          return elText.includes(text.toUpperCase()) && elText.length < 30;
        });

        if (target) {
          target.scrollIntoView({ block: 'center' });
          target.click();
          return true;
        }
        return false;
      }, channelText);

      if (clicked) {
        console.log(`[BDIPTV] Clicked '${channelText}'. Waiting for player to fetch manifest...`);
        for (let i = 0; i < 2; i++) {
          await page.mouse.click(640, 360).catch(() => {});
          await new Promise(r => setTimeout(r, 1000));
        }
        await new Promise(r => setTimeout(r, 8000));
      } else {
        // 🔥 DEBUGGER: Dump the available text if 'LIVE 1' fails
        console.warn(`[BDIPTV] Could not find '${channelText}'. Dumping visible text blocks for debugging...`);
        const visibleTexts = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('a, button, li, h1, h2, h3, span'));
            return [...new Set(elements.map(el => (el.innerText || '').trim()).filter(txt => txt.length > 2 && txt.length < 25))];
        });
        console.log(`[BDIPTV] Visible text detected:`, visibleTexts.slice(0, 15));
        throw new Error(`UI Element for '${channelText}' not found.`);
      }

      if (capturedUrl) {
        console.log(`[BDIPTV] SUCCESS! Captured stream for ${channelText}.`);
        await browser.close();
        return [{ name: `BDIPTV ${channelText} (Auto)`, url: capturedUrl }];
      } else {
        throw new Error(`Clicked '${channelText}' but no .m3u8 link was captured.`);
      }

    } catch (error) {
      lastError = error;
      console.warn(`[BDIPTV] Attempt ${attempt} failed: ${error.message}`);
      await browser.close().catch(() => { });
      if (attempt < retries) await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw lastError || new Error(`Completely failed to scrape BDIPTV channel: ${channelText}`);
}

module.exports = {
  executeSecureCapture,
  discoverKickBDMatches,
  scrapeBDIPTVChannel
};