#!/usr/bin/env node

const LIVE_FEED_URL = process.env.LIVE_FEED_URL || 'https://getpawsy.pet/google-feed.xml';
const DEBUG_URL = process.env.LIVE_FEED_DEBUG_URL || 'https://getpawsy.pet/api/feed-source-preview';
const REQUIRED_TOKENS = ['<rss', '<channel>', '<item'];

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GetPawsyFeedVerifier/1.0)',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      Accept: '*/*',
    },
  });

  const body = await res.text();
  return { res, body };
}

function firstLines(text, count = 20) {
  return text.split('\n').slice(0, count);
}

async function main() {
  const { res, body } = await fetchText(LIVE_FEED_URL);
  const liveLines = firstLines(body, 20);
  const checks = Object.fromEntries(REQUIRED_TOKENS.map((token) => [token, body.includes(token)]));

  const report = {
    live_url: LIVE_FEED_URL,
    status: res.status,
    content_type: res.headers.get('content-type'),
    cache_control: res.headers.get('cache-control'),
    cf_cache_status: res.headers.get('cf-cache-status'),
    first_20_lines_live_body: liveLines,
    contains_rss: checks['<rss'],
    contains_channel: checks['<channel>'],
    contains_item: checks['<item'],
  };

  console.log(JSON.stringify(report, null, 2));

  if (Object.values(checks).some((value) => !value)) {
    console.error('\n[verify-live-feed] Live feed validation failed.');
    process.exit(1);
  }

  try {
    const { body: debugBody } = await fetchText(DEBUG_URL);
    console.log('\n[verify-live-feed] Debug endpoint snapshot:');
    console.log(debugBody);
  } catch (error) {
    console.warn(`\n[verify-live-feed] Debug endpoint unavailable: ${error.message}`);
  }
}

main().catch((error) => {
  console.error('[verify-live-feed] Fatal error:', error);
  process.exit(1);
});