/**
 * The app's User-Agent. The server names each signed-in session from this header (Profile ›
 * Devices), and a stock React Native client sends "okhttp/…" or "CFNetwork/…", which it cannot
 * place — every phone would read "Unknown browser on Unknown OS". This is an honest app UA in
 * the conventional shape, so the server's parser finds the OS and the form factor, and the app
 * can name its own sessions after the phone.
 */
export function buildUserAgent({
  appName,
  version,
  platform,
  osVersion,
  model,
}: {
  appName: string;
  version: string;
  platform: string;
  osVersion: string | null;
  model: string | null;
}): string {
  // Parentheses and semicolons delimit the comment section; a model name must not break it.
  const clean = (text: string | null) =>
    (text ?? '').replace(/[();]/g, ' ').replace(/\s+/g, ' ').trim();
  const device = clean(model);
  const os = clean(osVersion);
  const product = `${appName.replace(/\s+/g, '')}/${version}`;
  if (platform === 'ios') {
    const family = /ipad/i.test(device) ? 'iPad' : 'iPhone';
    return `${product} (${device || family}; ${family === 'iPad' ? 'iPadOS' : 'iPhone OS'} ${os || '?'}) Mobile`;
  }
  if (platform === 'android') {
    return `${product} (Linux; Android ${os || '?'}${device ? `; ${device}` : ''}) Mobile`;
  }
  return `${product} (${platform})`;
}
