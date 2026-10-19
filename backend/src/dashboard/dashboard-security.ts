import { timingSafeEqual } from 'node:crypto';

const cookieName = 'dashboard_session';
const maxRequests = 60;
const windowMs = 60_000;
const requestWindows = new Map<string, { count: number; startedAt: number }>();

export function dashboardCookieHeader(token: string, secure: boolean): string {
  return `${cookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function dashboardLogoutCookieHeader(secure: boolean): string {
  return `${cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function readDashboardCookie(header: string | undefined): string | null {
  const value = header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);

  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function isDashboardTokenValid(
  received: string | null,
  expected: string,
): boolean {
  if (!received) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function allowDashboardRequest(key: string): boolean {
  const now = Date.now();
  const window = requestWindows.get(key);

  if (!window || now - window.startedAt >= windowMs) {
    requestWindows.set(key, { count: 1, startedAt: now });
    return true;
  }

  if (window.count >= maxRequests) {
    return false;
  }

  window.count += 1;
  return true;
}

export function resetDashboardRequestLimits(): void {
  requestWindows.clear();
}

export const dashboardSessionCookieName = cookieName;
