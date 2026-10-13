function validateUrl(value: unknown, name: string, protocols: string[]): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }

  try {
    const url = new URL(value);
    if (protocols.includes(url.protocol)) {
      return value;
    }
  } catch {
    // Report only the field name; connection strings can contain credentials.
  }

  throw new Error(`${name} must be a valid ${protocols.join(' or ')} URL`);
}

export function validateEnvironment(environment: Record<string, unknown>) {
  const port = Number(environment.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const secret = environment.JWT_SECRET;
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32 || secret.trim().length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes of secret material');
  }
  const expiresIn = environment.JWT_EXPIRES_IN ?? '8h';
  const duration = typeof expiresIn === 'string' && /^(\d+)(s|m|h)$/.exec(expiresIn);
  const units: Record<string, number> = { s: 1, m: 60, h: 3600 };
  const seconds = duration ? Number(duration[1]) * (units[duration[2]!] ?? 0) : 0;
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) {
    throw new Error('JWT_EXPIRES_IN must be a duration between 1s and 24h');
  }
  const frontendUrl = validateUrl(environment.FRONTEND_ORIGIN ?? 'http://localhost:3000', 'FRONTEND_ORIGIN', ['http:', 'https:']);
  const frontend = new URL(frontendUrl);
  if (frontend.username || frontend.password || frontend.pathname !== '/' || frontend.search || frontend.hash) {
    throw new Error('FRONTEND_ORIGIN must contain only an origin');
  }
  const nodeEnv = environment.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(String(nodeEnv))) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const smtpHost = String(environment.SMTP_HOST ?? '').trim();
  const smtpPort = Number(environment.SMTP_PORT ?? 587);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('SMTP_PORT must be a valid port');
  const smtpSecure = String(environment.SMTP_SECURE ?? 'false');
  if (!['true', 'false'].includes(smtpSecure)) throw new Error('SMTP_SECURE must be true or false');
  const smtpUser = String(environment.SMTP_USER ?? '');
  const smtpPassword = String(environment.SMTP_PASSWORD ?? '');
  if (Boolean(smtpUser) !== Boolean(smtpPassword)) throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together');
  const smtpFrom = String(environment.SMTP_FROM ?? 'no-reply@retailsense.local');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtpFrom)) throw new Error('SMTP_FROM must be a valid email address');

  return {
    ...environment,
    INVENTORY_EXPIRY_WARNING_DAYS: (() => {
      const days = Number(environment.INVENTORY_EXPIRY_WARNING_DAYS ?? 7);
      if (!Number.isInteger(days) || days < 0 || days > 365) throw new Error('INVENTORY_EXPIRY_WARNING_DAYS must be between 0 and 365');
      return days;
    })(),
    PORT: port,
    NODE_ENV: nodeEnv,
    JWT_SECRET: secret,
    JWT_EXPIRES_SECONDS: seconds,
    FRONTEND_ORIGIN: frontend.origin,
    SMTP_HOST: smtpHost,
    SMTP_PORT: smtpPort,
    SMTP_SECURE: smtpSecure === 'true',
    SMTP_USER: smtpUser,
    SMTP_PASSWORD: smtpPassword,
    SMTP_FROM: smtpFrom,
    DATABASE_URL: validateUrl(environment.DATABASE_URL, 'DATABASE_URL', [
      'postgres:',
      'postgresql:',
    ]),
    ML_SERVICE_URL: validateUrl(
      environment.ML_SERVICE_URL ?? 'http://localhost:8000',
      'ML_SERVICE_URL',
      ['http:', 'https:'],
    ),
  };
}
