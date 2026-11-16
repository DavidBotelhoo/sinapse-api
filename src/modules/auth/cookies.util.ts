import type { CookieOptions, Response } from 'express';

export const ACCESS_COOKIE = 'sn_access';
export const REFRESH_COOKIE = 'sn_refresh';

export const ACCESS_PATH = '/';
export const REFRESH_PATH = '/v1/auth';

export interface CookieConfig {
  nodeEnv: string;
  cookieDomain: string;
}

function baseOptions({ nodeEnv, cookieDomain }: CookieConfig): CookieOptions {
  const opts: CookieOptions = {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax',
  };
  // Em dev/teste, deixar o cookie ancorado no host da request (localhost/127.0.0.1).
  if (cookieDomain && cookieDomain !== 'localhost') {
    opts.domain = cookieDomain;
  }
  return opts;
}

export function setAccessCookie(
  res: Response,
  token: string,
  cfg: CookieConfig,
  expiresInMs: number,
): void {
  res.cookie(ACCESS_COOKIE, token, {
    ...baseOptions(cfg),
    path: ACCESS_PATH,
    maxAge: expiresInMs,
  });
}

export function setRefreshCookie(
  res: Response,
  token: string,
  cfg: CookieConfig,
  expiresAt: Date,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions(cfg),
    path: REFRESH_PATH,
    expires: expiresAt,
  });
}

export function clearAuthCookies(res: Response, cfg: CookieConfig): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(cfg), path: ACCESS_PATH });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(cfg), path: REFRESH_PATH });
}
