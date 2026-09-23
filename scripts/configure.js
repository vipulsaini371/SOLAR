// Reads app.config.json and writes capacitor.config.json + www/error.html. Run automatically by the build.
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('app.config.json', 'utf8'));
let u;
try { u = new URL(cfg.url); } catch (e) { fail('url in app.config.json is not a valid address'); }
if (u.protocol !== 'https:') fail('url must start with https:// (Android blocks plain http). Install an SSL certificate on your domain first.');
if (/YOUR-DOMAIN/i.test(cfg.url)) fail('Edit app.config.json first: put your real website address in "url".');
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(cfg.appId)) fail('appId must look like com.yourname.store (lowercase letters, digits, dots).');
if (!cfg.appName || cfg.appName.length > 30) fail('appName is required (max 30 characters).');
function fail(m) { console.error('\nCONFIG ERROR: ' + m + '\n'); process.exit(1); }

// Payment gateways open their own pages (card / netbanking / UPI). Keep them inside the app instead of the phone browser.
const gateways = ['*.razorpay.com', '*.payu.in', '*.payu.com', '*.paytm.com', '*.paytm.in', '*.phonepe.com', '*.cashfree.com', '*.billdesk.com', '*.hdfcbank.com', '*.icicibank.com', '*.sbi.co.in', '*.axisbank.com'];
const out = {
  appId: cfg.appId,
  appName: cfg.appName,
  webDir: 'www',
  server: { url: cfg.url, cleartext: false, errorPath: 'error.html', allowNavigation: [u.hostname, '*.' + u.hostname.replace(/^www\./, ''), ...gateways] },
  android: { allowMixedContent: false },
  plugins: { StatusBar: { style: 'DARK', backgroundColor: cfg.themeColor || '#84f04c', overlaysWebView: false } },
};
fs.writeFileSync('capacitor.config.json', JSON.stringify(out, null, 2));
fs.mkdirSync('www', { recursive: true });
fs.writeFileSync('www/error.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f4f7f4;color:#14231a;text-align:center;padding:24px}
h1{font-size:20px;margin:0 0 8px}p{color:#5d6b62;margin:0 0 20px}a{display:inline-block;background:${cfg.themeColor || '#84f04c'};color:#0d1a10;font-weight:700;padding:14px 26px;border-radius:12px;text-decoration:none}</style></head>
<body><div><h1>No internet connection</h1><p>Please check your connection and try again.</p><a href="${cfg.url}">Try again</a></div></body></html>`);
fs.writeFileSync('www/index.html', '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=' + cfg.url + '">');
console.log('Configured: ' + cfg.appName + ' (' + cfg.appId + ') -> ' + cfg.url);
