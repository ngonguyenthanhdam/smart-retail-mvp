"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AuthRequestError,
  fetchCurrentUser,
  login,
  logout,
  type CurrentUser,
  type LoginCredentials,
} from "@/lib/auth";

type AuthState =
  | { status: "loading" | "unauthenticated" | "error"; user: null }
  | { status: "authenticated"; user: CurrentUser };

type AuthContextValue = AuthState & {
  signIn: (credentials: LoginCredentials) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
  refresh: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });
  const requestVersion = useRef(0);

  const invalidateRequests = useCallback(() => { ++requestVersion.current; }, []);

  const loadCurrentUser = useCallback(() => {
    const version = ++requestVersion.current;

    void fetchCurrentUser().then((user) => {
      if (version === requestVersion.current) setState({ status: "authenticated", user });
    }).catch((error: unknown) => {
      if (version !== requestVersion.current) return;
      setState({
        status: error instanceof AuthRequestError && error.status === 401
          ? "unauthenticated"
          : "error",
        user: null,
      });
    });
  }, []);

  useEffect(() => {
    loadCurrentUser();

    const refresh = () => { loadCurrentUser(); };
    window.addEventListener("focus", refresh);

    return () => {
      invalidateRequests();
      window.removeEventListener("focus", refresh);
    };
  }, [loadCurrentUser, invalidateRequests]);

  const signIn = useCallback(async (credentials: LoginCredentials) => {
    ++requestVersion.current;
    const user = await login(credentials);
    ++requestVersion.current;
    setState({ status: "authenticated", user });
  }, []);

  const signOut = useCallback(async () => {
    ++requestVersion.current;
    await logout();
    ++requestVersion.current;
    setState({ status: "unauthenticated", user: null });
  }, []);

  const retry = useCallback(() => {
    setState({ status: "loading", user: null });
    loadCurrentUser();
  }, [loadCurrentUser]);

  const value = useMemo(() => ({ ...state, signIn, signOut, retry, refresh: loadCurrentUser }), [state, signIn, signOut, retry, loadCurrentUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth requires AuthProvider");
  return auth;
}
