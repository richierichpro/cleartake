// A simple password gate for a deployed copy (the app spends AssemblyAI / ElevenLabs credits).
// Off unless APP_PASSWORD is set, so local development needs nothing. The browser asks once (HTTP Basic
// auth, any user name) and sends it with every request after that, including uploads and media.

const REALM = 'Basic realm="Cleartake", charset="UTF-8"';

/** True if the request may go through: no password set, the right password, or the renderer's key. */
export async function authorized(request: Request) {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;
  const key = new URL(request.url).searchParams.get("key");
  if (key && key === (await renderKey())) return true;
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = atob(header.slice(6));
  return decoded.slice(decoded.indexOf(":") + 1) === password;
}

export const unauthorized = () =>
  new Response("Password required", { status: 401, headers: { "WWW-Authenticate": REALM } });

/**
 * The export renderer (a headless browser on the server) loads media over HTTP and can't type a
 * password, so its media links carry this key: derived from the password, so every server process agrees.
 */
export async function renderKey() {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`cleartake-render:${password}`));
  return Buffer.from(hash).toString("hex");
}
