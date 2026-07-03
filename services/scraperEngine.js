const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const SITE_CONFIGS = {
  'bokulsports.com': {
    adBlockTerms: ['googleads', 'doubleclick', 'popunder', 'histats', 'onclick'],
    targetExtensions: ['.m3u8', '.mpd'],
  },
  'kickbd': { 
    adBlockTerms: ['googleads', 'analytics', 'popunder', 'onclickads', 'tracking'],
    targetExtensions: ['.m3u8', '.mpd'],
  },
  'streamed.pk': {
    adBlockTerms: ['googleads', 'doubleclick', 'mgid'],
    targetExtensions: ['.m3u8', '.mpd'],
  },
  'bdiptv.net': { 
    adBlockTerms: ['googleads', 'popunder', 'tracking', 'analytics'],
    targetExtensions: ['.m3u8', '.mpd'],
  }
};

const DEFAULT_CONFIG = {
  adBlockTerms: ['googleads', 'analytics', 'doubleclick', 'popunder', 'juicyads', 'exoclick'],
  targetExtensions: ['.m3u8', '.mpd'],
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

async function createNewBrowser() {
  return await puppeteer.launch({
    headless: true, 
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process,HttpsUpgrades',
      '--disable-blink-features=AutomationControlled',
      '--mute-audio' 
    ]
  });
}

async function safeEvaluate(page, fn, ...args) {
  for (let i = 0; i < 4; i++) {
    try {
      return await page.evaluate(fn, ...args);
    } catch (e) {
      const msg = e.message.toLowerCase();
      if (msg.includes('detached') || msg.includes('context') || msg.includes('closed')) {
        console.log(`[Scraper] Mutation handled. Waiting for window to settle (Retry ${i + 1}/4)...`);
        await new Promise(r => setTimeout(r, 2000)); 
      } else {
        throw e;
      }
    }
  }
  return null; // Return null instead of crashing the process completely
}

// -------------------------------------------------------------
// ARMORED MULTI-SERVER CAPTURE
// -------------------------------------------------------------
async function executeSecureCapture(targetUrl, retries = 2) {
  const config = getSiteConfig(targetUrl);
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const browser = await createNewBrowser();
    let uniqueServerMap = new Map(); 
    let windowCapturedUrls = [];

    browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        try {
          const newPage = await target.page();
          if (newPage && newPage.url() !== 'about:blank') {
            await newPage.close().catch(() => {});
          }
        } catch (_) {}
      }
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1280, height: 720 });
      await page.setRequestInterception(true);
      
      page.on('request', (req) => {
        try {
          const url = req.url().toLowerCase();
          
          // 🎯 SAFE INTEGRITY FIX: Never block primary or iframe document paths
          if (req.isNavigationRequest() || url === targetUrl.toLowerCase()) {
            return req.continue();
          }
          
          if (config.adBlockTerms.some(term => url.includes(term))) {
            return req.abort();
          }
          
          const isTarget = config.targetExtensions.some(ext => url.includes(ext));
          if (isTarget && !url.includes('/ad') && !url.includes('blank') && !url.includes('pre-roll')) {
            windowCapturedUrls.push(req.url());
          }
          return req.continue();
        } catch (_) {
          try { req.continue(); } catch (__) {}
        }
      });

      console.log(`[Scraper] Isolated capture run for: ${targetUrl} (Attempt ${attempt}/${retries})`);
      
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 6000)); 

      const serverButtonTexts = await safeEvaluate(page, () => {
        const structuralElements = Array.from(document.querySelectorAll('button, a, span, div, li'));
        const matches = structuralElements.filter(el => {
          const txt = (el.innerText || '').trim();
          return /Server|Stream|Link|Player|HD|SD|Toffee|Fox|Caze|Extreme|Sports|LIVE/i.test(txt) && txt.length > 0 && txt.length < 25;
        });
        return [...new Set(matches.map(el => (el.innerText || '').trim()))];
      });

      if (serverButtonTexts && serverButtonTexts.length > 0) {
        console.log(`[Scraper] Discovered ${serverButtonTexts.length} interactive streaming channels.`);
        
        for (const label of serverButtonTexts.slice(0, 6)) { 
          windowCapturedUrls = [];
          
          await safeEvaluate(page, (targetText) => {
            const items = Array.from(document.querySelectorAll('button, a, span, div, li'));
            const element = items.find(el => (el.innerText || '').trim() === targetText);
            if (element) {
              element.scrollIntoView({ block: 'center' });
              element.click();
            }
          }, label);

          await new Promise(r => setTimeout(r, 4500)); 

          if (windowCapturedUrls.length > 0) {
            const targetManifestUrl = [...new Set(windowCapturedUrls)][0];
            if (!uniqueServerMap.has(targetManifestUrl)) {
              uniqueServerMap.set(targetManifestUrl, label);
              console.log(`  -> Matrix bound: [${label}]`);
            }
          }
        }
      } 

      // Fallback: Code-rip raw manifests straight out of document markup if interceptor was blind
      if (uniqueServerMap.size === 0) {
        const rawLinks = await safeEvaluate(page, () => {
          const matches = document.documentElement.innerHTML.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/gi);
          return matches ? [...new Set(matches)] : [];
        });

        if (rawLinks && rawLinks.length > 0) {
          rawLinks.forEach((src, idx) => uniqueServerMap.set(src, `Source Extracted Relay ${idx + 1}`));
        }
      }

      if (uniqueServerMap.size > 0) {
        const serverObjects = Array.from(uniqueServerMap.entries()).map(([url, label]) => ({
          name: `${label} (Live HD)`,
          url: url
        }));
        await browser.close().catch(() => {});
        return serverObjects;
      }
      throw new Error('No functional manifest vectors isolated across operation layouts.');

    } catch (error) {
      lastError = error;
      console.warn(`[Scraper] Run iteration unfulfilled: ${error.message}`);
    } finally {
      await browser.close().catch(() => {});
    }
    if (attempt < retries) await new Promise(r => setTimeout(r, 2000));
  }
  throw lastError || new Error('All target scraping loops exhausted.');
}

// -------------------------------------------------------------
// ARMORED LIVE MATCH DISCOVERY
// -------------------------------------------------------------
async function discoverKickBDMatches(baseUrl = 'https://kickbd.org') {
  const browser = await createNewBrowser();
  const targetUrls = [baseUrl, `${baseUrl.replace(/\/$/, '')}/matches/`];
  let matchLinks = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 720 });
    await page.setRequestInterception(true);
    
    page.on('request', (req) => {
      try {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
        else req.continue();
      } catch (_) { try { req.continue(); } catch (__) {} }
    });

    for (const url of targetUrls) {
      try {
        console.log(`[Discovery] Scanning target vector: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 4000));

        const extracted = await safeEvaluate(page, () => {
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
              return (hasTargetKeywords || isLiveIndicator) && !item.href.endsWith('/matches/') && !item.href.endsWith('/matches');
            })
            .map(item => item.originalHref);
        });

        if (extracted && extracted.length > 0) {
          matchLinks = [...new Set(extracted)];
          break;
        }
      } catch (e) {
        console.warn(`[Discovery] Lane execution bypassed: ${e.message}`);
      }
    }
    return matchLinks;
  } catch (err) {
    return [];
  } finally {
    await browser.close().catch(() => {});
  }
}

// -------------------------------------------------------------
// ARMORED TARGETED BDIPTV CAPTURE
// -------------------------------------------------------------
async function scrapeBDIPTVChannel(channelText = 'LIVE 1') {
  return await executeSecureCapture('http://tv.bdiptv.net/');
}

module.exports = { executeSecureCapture, discoverKickBDMatches, scrapeBDIPTVChannel };