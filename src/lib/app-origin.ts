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

function chooseBestOrigin(origins: Array<string | null>) {
  const validOrigins = origins.filter((origin): origin is string => Boolean(origin));
  const nonLocalOrigin = validOrigins.find((origin) => !isLocalOrigin(origin));
  return nonLocalOrigin ?? validOrigins[0] ?? null;
}

export function getRequestOrigin(headers: HeaderReader) {
  const originHeader = firstHeaderValue(headers.get("origin"));
  const refererHeader = firstHeaderValue(headers.get("referer"));
  const explicitOrigin = normalizeOrigin(originHeader) ?? normalizeOrigin(refererHeader);

  if (explicitOrigin) {
    return explicitOrigin;
  }

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

  if (configuredOrigin && !isLocalOrigin(configuredOrigin)) {
    return configuredOrigin;
  }

  return chooseBestOrigin([requestOrigin, configuredOrigin]);
}

export function getAppOriginFromRequest(request: Request) {
  const requestUrlOrigin = normalizeOrigin(new URL(request.url).origin);
  const requestOrigin = getRequestOrigin(request.headers);
  const configuredOrigin = getConfiguredAppOrigin();

  return chooseBestOrigin([requestOrigin, requestUrlOrigin, configuredOrigin]);
}
