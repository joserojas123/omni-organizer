/**
 * Sanitizes the rich-text task name: the only markup this app ever produces
 * is `<a href="...">text</a>` (see useTaskDesigner's link dialog), so anything
 * else is stripped rather than allowed through. Runs on every write path
 * (client commit + the API's zod validation) so no other tag/attribute can
 * reach `dangerouslySetInnerHTML` on render.
 */
const ANCHOR_RE = /<a\b[^>]*\bhref\s*=\s*"([^"]*)"[^>]*>([^<]*)<\/a>/gi;
const SAFE_URL_RE = /^https?:\/\//i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeNameHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  let result = "";
  let lastIndex = 0;
  let hasAnchor = false;
  for (const match of html.matchAll(ANCHOR_RE)) {
    const [full, href, text] = match;
    const index = match.index ?? 0;
    result += escapeHtml(html.slice(lastIndex, index));
    if (SAFE_URL_RE.test(href)) {
      hasAnchor = true;
      result += `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(text)}</a>`;
    } else {
      result += escapeHtml(text);
    }
    lastIndex = index + full.length;
  }
  result += escapeHtml(html.slice(lastIndex));
  return hasAnchor ? result : null;
}
