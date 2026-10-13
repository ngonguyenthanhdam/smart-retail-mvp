import type { CookieOptions } from 'express';

export const AUTH_COOKIE = 'retailsense_access';

export function authCookieOptions(production: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: production, path: '/' };
}

export function readAuthCookie(header: string | undefined): string | undefined {
  const values = header?.split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${AUTH_COOKIE}=`));
  if (values?.length !== 1) return undefined;
  try {
    return decodeURIComponent(values[0]!.slice(AUTH_COOKIE.length + 1)) || undefined;
  } catch {
    return undefined;
  }
}
