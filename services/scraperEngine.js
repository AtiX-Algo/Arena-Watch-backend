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
  },
  'bdiptv.net': { // <-- NEW CONFIG FOR BDIPTV
    profile: INTERACTION_PROFILES.OVERLAY_DISMISS,
    selector: 'video, #player, iframe',
    adBlockTerms: ['googleads', 'popunder', 'tracking', 'analytics'],
    targetExtensions: ['.m3u8', '.mpd'],
    clickDelay: 2000,
    waitAfterClick: 6000,
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
  } catch(e) {}
  return DEFAULT_CONFIG;
}

function createInterceptor(adBlockTerms, targetExtensions, onCapture) {
  return (req) => {
    try {
      const url = req.url().toLowerCase();
      if (adBlockTerms.some(term => url.includes(term))) return req.abort();
      
      const isTarget = targetExtensions.some(ext => url.includes(ext));
      if (isTarget && !url.includes('/ad') && !url.includes('blank') && !url.includes('pre-roll')) {
        onCapture(req.url());
      }
      return req.continue();
    } catch (error) {
      try { req.continue(); } catch (_) {}
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
                await newPage.close().catch(() => {});
              }
            }
          } catch (e) {}
        }, 500);
      }
    });
  }
  return browserInstance;
}

async function aggressiveClickLoop(page, maxClicks = 3, delay = 2000) {
  const viewport = page.viewport();
  if (!viewport) return;
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  for (let i = 0; i < maxClicks; i++) {
    try {
      await page.mouse.click(centerX, centerY);
      await new Promise(r => setTimeout(r, delay));
    } catch (e) {
      break;
    }
  }
}

// -------------------------------------------------------------
// ARMORED MULTI-SERVER CAPTURE (ISOLATED CLICK WINDOWS)
// -------------------------------------------------------------
async function executeSecureCapture(targetUrl, retries = 2) {
  const config = getSiteConfig(targetUrl);
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    
    let finalizedServers = [];
    let windowCapturedUrls = [];

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 720 });
      await page.setRequestInterception(true);
      
      page.on('request', (req) => {
        try {
          const url = req.url().toLowerCase();
          if (config.adBlockTerms.some(term => url.includes(term))) return req.abort();
          
          const isTarget = config.targetExtensions.some(ext => url.includes(ext));
          if (isTarget && !url.includes('/ad') && !url.includes('blank') && !url.includes('pre-roll')) {
            windowCapturedUrls.push(req.url());
          }
          return req.continue();
        } catch (_) {
          try { req.continue(); } catch (__) {}
        }
      });

      console.log(`[Scraper] Launching isolated capture matrix for: ${targetUrl} (Attempt ${attempt}/${retries})`);
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 35000 });
      await new Promise(r => setTimeout(r, 4000));

      const serverButtonTexts = await page.evaluate(() => {
        const structuralElements = Array.from(document.querySelectorAll('button, a, span, div, li'));
        const matches = structuralElements.filter(el => {
          const txt = (el.innerText || '').trim();
          // ADDED "LIVE" TO THE REGEX SO IT CATCHES "LIVE 1" AND "LIVE 2" BUTTONS
          return /Server|Stream|Link|Player|HD|SD|Toffee|Fox|Caze|Extreme|Sports|LIVE/i.test(txt) && txt.length > 0 && txt.length < 25;
        });
        return [...new Set(matches.map(el => (el.innerText || '').trim()))];
      });

      if (serverButtonTexts.length > 0) {
        console.log(`[Scraper] Identified ${serverButtonTexts.length} interactive network nodes. Commencing window isolation loop...`);
        
        for (const label of serverButtonTexts.slice(0, 8)) { 
          console.log(`[Scraper] Triggering node channel window: [${label}]`);
          
          windowCapturedUrls = [];
          
          const clickedSuccessfully = await page.evaluate((targetText) => {
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
            await new Promise(r => setTimeout(r, 4000)); 

            if (windowCapturedUrls.length > 0) {
              const targetManifestUrl = [...new Set(windowCapturedUrls)][0];
              const isDuplicateUrl = finalizedServers.some(srv => srv.url === targetManifestUrl);
              
              if (!isDuplicateUrl) {
                finalizedServers.push({
                  name: `${label} (Live HD)`,
                  url: targetManifestUrl
                });
                console.log(`  -> Locked server [${label}] to manifest vector.`);
              }
            } else {
              const activeIframeSrc = await page.evaluate(() => {
                const primaryIframe = document.querySelector('iframe');
                return primaryIframe ? primaryIframe.src : null;
              });
              
              if (activeIframeSrc && activeIframeSrc !== 'about:blank' && !finalizedServers.some(srv => srv.url === activeIframeSrc)) {
                finalizedServers.push({
                  name: `${label} (Embedded Relay)`,
                  url: activeIframeSrc
                });
                console.log(`  -> Locked server [${label}] via secondary iframe framework.`);
              }
            }
          }
        }
      } 
      
      if (finalizedServers.length === 0) {
        console.log(`[Scraper] Button windows blank. Attempting legacy standalone extraction...`);
        const standardIframeSrc = await page.evaluate(() => {
          const iframes = Array.from(document.querySelectorAll('iframe'));
          return iframes.length > 0 ? iframes[0].src : null;
        });

        if (standardIframeSrc && standardIframeSrc !== 'about:blank') {
          finalizedServers.push({
            name: "Default Direct Relay Node",
            url: standardIframeSrc
          });
        }
      }

      if (finalizedServers.length > 0) {
        console.log(`[Scraper] SUCCESS! Successfully registered ${finalizedServers.length} distinct live tracks.`);
        return finalizedServers;
      } else {
        throw new Error('No functional manifest vectors isolated across streaming channel run operations.');
      }

    } catch (error) {
      lastError = error;
      console.warn(`[Scraper] Attempt ${attempt} failed: ${error.message}`);
      if (attempt < retries) await new Promise(r => setTimeout(r, 2000));
    } finally {
      await page.close().catch(() => {});
    }
  }
  throw lastError || new Error('Scraping engine loops fully exhausted.');
}

// -------------------------------------------------------------
// ARMORED LIVE FILTER DISCOVERY WITH AUTOMATIC AD BYPASS
// -------------------------------------------------------------
async function discoverKickBDMatches(baseUrl = 'https://kickbd.org') {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  const targetUrls = [
    baseUrl,
    `${baseUrl.replace(/\/$/, '')}/matches/`,
    `${baseUrl.replace(/\/$/, '')}/matches/fifa-world-cup-2026-round-of-32/`
  ];

  let matchLinks = [];

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 720 });
    await page.setRequestInterception(true);
    
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    for (const url of targetUrls) {
      try {
        console.log(`[Discovery] Scanning target vector: ${url}`);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await new Promise(r => setTimeout(r, 3000)); 

        await page.mouse.click(640, 360).catch(() => {});
        await new Promise(r => setTimeout(r, 1500));

        const extracted = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a[href*="/matches/"]'));
          const baseOrigin = window.location.origin;
          
          return anchors
            .map(a => {
              let href = a.getAttribute('href') || '';
              if (href.startsWith('/')) href = baseOrigin + href;
              return { href: href.toLowerCase(), originalHref: a.href, text: (a.innerText || '').toUpperCase() };
            })
            .filter(item => {
              const hasTargetKeywords = item.href.includes('world-cup') || item.href.includes('fifa') || item.href.includes('round-of');
              const isLiveIndicator = item.text.includes('LIVE') || item.text.includes('WATCH') || item.text.includes('MIN') || item.text.includes('VS');
              const isNotDirectoryRoot = !item.href.endsWith('/matches/') && !item.href.endsWith('/matches');
              
              return (hasTargetKeywords || isLiveIndicator) && isNotDirectoryRoot;
            })
            .map(item => item.originalHref);
        });

        if (extracted && extracted.length > 0) {
          matchLinks = [...new Set(extracted)];
          console.log(`[Discovery] Success! Harvested ${matchLinks.length} actionable paths from vector.`);
          break; 
        }
      } catch (navError) {
        console.warn(`[Discovery] Target lane ${url} bypassed: ${navError.message}`);
      }
    }

    console.log(`[Discovery] Run complete. Total verified links:`);
    matchLinks.forEach((link, i) => console.log(`  -> Vector ${i + 1}: ${link}`));
    return matchLinks;

  } catch (error) {
    console.error('[Discovery] System extraction error:', error.message);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { 
  executeSecureCapture,
  discoverKickBDMatches
};