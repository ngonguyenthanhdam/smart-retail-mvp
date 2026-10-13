import { translateMessage } from './error-copy';

export class ApiRequestError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(translateMessage(message, status, code));
    this.name = "ApiRequestError";
  }
}

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export async function downloadCsv(path: string, filename: string) {
  const response = await fetch(`${apiUrl}${path}`, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiRequestError(response.status, typeof body.message === 'string' ? body.message : '');
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function apiRequest<T>(path: string, options?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
    signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = body !== null && typeof body === "object" && "message" in body
      ? body.message
      : null;
    const detail = typeof message === "string" ? message
      : Array.isArray(message) && message.every((item) => typeof item === "string")
        ? message.join(" ") : "";
    const code = body !== null && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : undefined;
    throw new ApiRequestError(response.status, detail, code);
  }

  return response.json() as Promise<T>;
}
