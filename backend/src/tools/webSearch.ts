import type { SearchResult } from "../types.js";

const DEFAULT_LIMIT = 5;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_USER_AGENT = "ShoppingLensBot/0.1 (+https://shoppinglens.local)";

const searchTimeoutMs = Number.parseInt(process.env.SEARCH_TIMEOUT_MS ?? "", 10);
const timeoutMs = Number.isFinite(searchTimeoutMs) && searchTimeoutMs > 0 ? searchTimeoutMs : DEFAULT_TIMEOUT_MS;
const userAgent = process.env.SEARCH_USER_AGENT ?? DEFAULT_USER_AGENT;
const searxngBaseUrl = process.env.SEARXNG_URL?.trim();

const decodeHtml = (value: string): string => {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
};

const stripTags = (value: string): string => {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
};

const decodeDuckDuckGoUrl = (href: string): string => {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    if (url.hostname.endsWith("duckduckgo.com") && url.pathname === "/l/") {
      const encoded = url.searchParams.get("uddg");
      if (encoded) {
        return decodeURIComponent(encoded);
      }
    }
    return url.toString();
  } catch {
    return href;
  }
};

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const searchDuckDuckGo = async (query: string, limit: number): Promise<SearchResult[]> => {
  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);
  url.searchParams.set("kl", "us-en");

  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed with status ${response.status}`);
  }

  const html = await response.text();
  const anchorRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(anchorRegex)) {
    if (results.length >= limit) break;
    const rawUrl = match[1] ?? "";
    const title = stripTags(match[2] ?? "");
    const startIndex = match.index ?? 0;
    const context = html.slice(startIndex, Math.min(html.length, startIndex + 2400));
    const snippetMatch =
      context.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/) ??
      context.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/div>/);
    const snippet = snippetMatch ? stripTags(snippetMatch[1] ?? "") : undefined;
    const decodedUrl = decodeDuckDuckGoUrl(rawUrl);

    if (!title || !isHttpUrl(decodedUrl) || seen.has(decodedUrl)) {
      continue;
    }

    seen.add(decodedUrl);
    results.push({ title, url: decodedUrl, snippet });
  }

  return results;
};

const buildSearxngUrl = (base: string, query: string): URL => {
  const url = new URL(base);
  if (!url.pathname.endsWith("/search")) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/search`;
  }
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  return url;
};

const searchSearxng = async (query: string, limit: number): Promise<SearchResult[]> => {
  const url = buildSearxngUrl(searxngBaseUrl ?? "", query);
  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`SearxNG search failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  const results: SearchResult[] = [];

  for (const item of payload.results ?? []) {
    if (results.length >= limit) break;
    const title = item.title?.trim() ?? "";
    const urlValue = item.url?.trim() ?? "";
    if (!title || !isHttpUrl(urlValue)) continue;
    results.push({ title, url: urlValue, snippet: item.content?.trim() || undefined });
  }

  return results;
};

export const searchWeb = async (query: string, options?: { limit?: number }): Promise<SearchResult[]> => {
  const normalized = query.trim();
  if (!normalized) return [];
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 8) : DEFAULT_LIMIT;
  const attempts: Array<{ label: string; run: () => Promise<SearchResult[]> }> = [];
  if (searxngBaseUrl) {
    attempts.push({ label: "SearxNG", run: () => searchSearxng(normalized, limit) });
  }
  attempts.push({ label: "DuckDuckGo", run: () => searchDuckDuckGo(normalized, limit) });

  for (const attempt of attempts) {
    try {
      return await attempt.run();
    } catch (error) {
      console.warn(`${attempt.label} search failed:`, error);
    }
  }

  return [];
};
