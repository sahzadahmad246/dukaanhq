type HeaderReader = {
  get(name: string): string | null;
};

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;

  const withProtocol = value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;

  try {
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string | null) {
  if (!origin) return false;

  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function getConfiguredAppOrigin() {
  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(process.env.VERCEL_URL)
  );
}

export function getRequestOrigin(headers: HeaderReader) {
  const forwardedHost = firstHeaderValue(headers.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderValue(headers.get("host"));

  if (!host) return null;

  const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto"));
  const proto = forwardedProto ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return normalizeOrigin(`${proto}://${host}`);
}

export function getAppOrigin(headers: HeaderReader) {
  const requestOrigin = getRequestOrigin(headers);
  const configuredOrigin = getConfiguredAppOrigin();

  if (requestOrigin && (!isLocalOrigin(requestOrigin) || !configuredOrigin || isLocalOrigin(configuredOrigin))) {
    return requestOrigin;
  }

  return configuredOrigin ?? requestOrigin;
}
