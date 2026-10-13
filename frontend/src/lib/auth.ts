export type UserRole = "ADMIN" | "STORE_MANAGER" | "STAFF";

export type CurrentUser = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  locationId: string | null;
  location: { id: string; code: string; name: string } | null;
};

export type LoginCredentials = { identifier: string; password: string };

export class AuthRequestError extends Error {
  constructor(readonly status: number) {
    super("Authentication request failed");
    this.name = "AuthRequestError";
  }
}

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

async function authRequest(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(`${apiUrl}/auth/${path}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new AuthRequestError(response.status);

  return response;
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await authRequest("me");
  return response.json();
}

export async function login(credentials: LoginCredentials): Promise<CurrentUser> {
  const response = await authRequest("login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  return response.json();
}

export async function logout(): Promise<void> {
  await authRequest("logout", { method: "POST" });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await authRequest("forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await authRequest("reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
}
