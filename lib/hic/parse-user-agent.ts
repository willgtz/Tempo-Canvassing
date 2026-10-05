// Minimal hand-rolled browser/OS parse for the certificate of
// completion — no UA-parsing library needed for "Safari on iOS" /
// "Chrome on Windows" style summaries, not a full device-detection
// feature.
export function parseUserAgent(userAgent: string): string {
  if (!userAgent || userAgent === "unknown") return "Unknown device";

  let os = "Unknown OS";
  if (/iPhone|iPad|iPod/.test(userAgent)) os = "iOS";
  else if (/Android/.test(userAgent)) os = "Android";
  else if (/Mac OS X/.test(userAgent)) os = "macOS";
  else if (/Windows/.test(userAgent)) os = "Windows";
  else if (/Linux/.test(userAgent)) os = "Linux";

  let browser = "Unknown browser";
  if (/Edg\//.test(userAgent)) browser = "Edge";
  else if (/Chrome\//.test(userAgent) && !/Chromium/.test(userAgent)) browser = "Chrome";
  else if (/CriOS\//.test(userAgent)) browser = "Chrome";
  else if (/Firefox\//.test(userAgent)) browser = "Firefox";
  else if (/Safari\//.test(userAgent) && /Version\//.test(userAgent)) browser = "Safari";

  return `${browser} on ${os}`;
}
