// Centralized WebAuthn Environment Resolver
// Ensures consistent RP ID and Origin logic across all registration and authentication endpoints.

export function getWebAuthnConfig(requestOrigin?: string) {
  const isProd = process.env.NODE_ENV === 'production';
  const rpName = 'ArcFun';

  let rpID = isProd ? (process.env.NEXT_PUBLIC_RP_ID || 'thearcfun.xyz') : 'localhost';
  if (requestOrigin) {
    try {
      const parsed = new URL(requestOrigin);
      const host = parsed.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        rpID = 'localhost';
      } else if (host.endsWith('thearcfun.xyz')) {
        rpID = 'thearcfun.xyz';
      } else {
        rpID = host;
      }
    } catch {
      if (!requestOrigin.includes('://')) {
        rpID = requestOrigin.endsWith('thearcfun.xyz') ? 'thearcfun.xyz' : requestOrigin;
      }
    }
  }

  // Provide an array of allowed origins to support both root and www domains
  const expectedOrigins: string[] = [];
  if (requestOrigin) {
    const formatted = requestOrigin.startsWith('http') ? requestOrigin : `https://${requestOrigin}`;
    expectedOrigins.push(formatted);
    if (formatted.includes('www.thearcfun.xyz')) {
      expectedOrigins.push(formatted.replace('www.', ''));
    } else if (formatted.includes('https://thearcfun.xyz')) {
      expectedOrigins.push('https://www.thearcfun.xyz');
    }
  } else if (isProd) {
    expectedOrigins.push(
      process.env.NEXT_PUBLIC_APP_URL || `https://${rpID}`,
      `https://www.${rpID}`,
      'https://thearcfun.xyz',
      'https://www.thearcfun.xyz'
    );
  } else {
    expectedOrigins.push(`http://${rpID}:3000`, 'http://localhost:3000');
  }

  return {
    isProd,
    rpName,
    rpID,
    origin: expectedOrigins
  };
}

export function validateProductionWebAuthnConfig(config: ReturnType<typeof getWebAuthnConfig>) {
  if (config.isProd) {
    if (!config.rpID || config.rpID === 'localhost') {
      throw new Error('Production configuration error: NEXT_PUBLIC_RP_ID is missing or set to localhost');
    }
    const primaryOrigin = config.origin[0];
    if (!primaryOrigin || primaryOrigin.includes('localhost') || !primaryOrigin.startsWith('https://')) {
      throw new Error('Production configuration error: NEXT_PUBLIC_APP_URL is missing, invalid, or insecure');
    }
  }
}
