export function parseCookies(cookieHeader: string | null) {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) {
    return cookies;
  }

  // Split the cookie string by semicolons and spaces
  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest.length > 0) {
      // Decode the name and value, and join value parts in case it contains '='
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

const SERVER_MANAGED_API_KEY_ALIASES = new Set(['Google', 'GOOGLE_GENERATIVE_AI_API_KEY', 'google']);

export function stripServerManagedApiKeys(apiKeys: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(apiKeys).filter(([key]) => !SERVER_MANAGED_API_KEY_ALIASES.has(key)));
}

export function getApiKeysFromCookie(cookieHeader: string | null): Record<string, string> {
  const cookies = parseCookies(cookieHeader);
  const parsedKeys = cookies.apiKeys ? JSON.parse(cookies.apiKeys) : {};
  return stripServerManagedApiKeys(parsedKeys);
}

export function getProviderSettingsFromCookie(cookieHeader: string | null): Record<string, any> {
  const cookies = parseCookies(cookieHeader);
  return cookies.providers ? JSON.parse(cookies.providers) : {};
}
