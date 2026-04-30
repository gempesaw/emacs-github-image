const OFFSCREEN_URL = 'offscreen.html';

async function hasOffscreen() {
  try {
    if (!chrome.runtime.getContexts) return false;
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    return contexts.length > 0;
  } catch {
    return false;
  }
}

async function ensureOffscreen() {
  try {
    if (await hasOffscreen()) return;
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS'],
      justification: 'Maintain persistent WebSocket to local Emacs server',
    });
  } catch (err) {
    const msg = String(err && err.message || err);
    if (!msg.includes('Only a single offscreen')) {
      console.warn('[ghimg] ensureOffscreen:', msg);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => { ensureOffscreen(); });
chrome.runtime.onStartup.addListener(() => { ensureOffscreen(); });

try {
  chrome.alarms.create('ghimg-keepalive', { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'ghimg-keepalive') ensureOffscreen();
  });
} catch (err) {
  console.warn('[ghimg] alarm setup failed:', err);
}

ensureOffscreen().catch((err) => console.warn('[ghimg] initial ensureOffscreen:', err));
