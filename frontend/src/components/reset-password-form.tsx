"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import { vi } from "@/i18n/vi";
import { AuthRequestError, resetPassword } from "@/lib/auth";

function createResetTokenStore() {
  let token: string | null = null;

  return {
    getSnapshot: () => token,
    subscribe: (callback: () => void) => {
      const consumeHash = () => {
        if (window.location.hash) {
          token = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
          window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
        } else if (token === null) {
          token = "";
        }
        callback();
      };

      window.addEventListener("hashchange", consumeHash);
      consumeHash();
      return () => window.removeEventListener("hashchange", consumeHash);
    },
  };
}

export function ResetPasswordForm() {
  const [tokenStore] = useState(createResetTokenStore);
  const token = useSyncExternalStore(tokenStore.subscribe, tokenStore.getSnapshot, () => null);
  const { retry } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const [rejectedToken, setRejectedToken] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});
  const hasValidToken = token !== null && /^[a-f0-9]{64}$/.test(token) && token !== rejectedToken;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !hasValidToken || token === null) return;
    const validation = {
      password: [...password].length < 8
        ? vi.auth.passwordTooShort
        : new TextEncoder().encode(password).length > 72 ? vi.auth.passwordTooLong : undefined,
      confirmation: password !== confirmation ? vi.auth.passwordsDoNotMatch : undefined,
    };
    setErrors(validation);
    setError("");
    if (validation.password || validation.confirmation) return;

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setPassword("");
      setConfirmation("");
      setCompleted(true);
      retry();
    } catch (requestError) {
      if (requestError instanceof AuthRequestError && requestError.status === 400) {
        setRejectedToken(token);
      } else {
        setError(vi.auth.resetFailed);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="login-container">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span className="brand-name">{vi.brand}</span>
        </div>
        <section className="login-card" aria-labelledby="reset-title">
          <p className="eyebrow">{vi.auth.eyebrow}</p>
          <h1 id="reset-title">{vi.auth.resetTitle}</h1>
          <p className="login-description">{vi.auth.resetDescription}</p>

          {token === null ? (
            <p className="field-hint" role="status">{vi.auth.resetLoading}</p>
          ) : completed ? (
            <p className="form-success" role="status">{vi.auth.resetSuccess}</p>
          ) : !hasValidToken ? (
            <div className="login-form">
              <p className="form-error" role="alert">{vi.auth.resetInvalid}</p>
              <Link href="/forgot-password" className="auth-link">{vi.auth.requestNewLink}</Link>
            </div>
          ) : (
            <form noValidate onSubmit={handleSubmit} className="login-form" aria-busy={submitting}>
              <div className="form-field">
                <label htmlFor="new-password">{vi.auth.newPassword} <span aria-hidden="true">*</span></label>
                <input
                  id="new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  disabled={submitting}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "new-password-hint new-password-error" : "new-password-hint"}
                />
                <p id="new-password-hint" className="field-hint">{vi.auth.passwordHint}</p>
                {errors.password && <p id="new-password-error" className="field-error">{errors.password}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="confirm-password">{vi.auth.confirmPassword} <span aria-hidden="true">*</span></label>
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  disabled={submitting}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  aria-invalid={Boolean(errors.confirmation)}
                  aria-describedby={errors.confirmation ? "confirm-password-error" : undefined}
                />
                {errors.confirmation && <p id="confirm-password-error" className="field-error">{errors.confirmation}</p>}
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" className="primary-button sign-in-button" disabled={submitting}>
                {submitting ? vi.auth.resettingPassword : vi.auth.resetPassword}
                {submitting
                  ? <LoaderCircle className="loading-icon" size={17} aria-hidden="true" />
                  : <KeyRound size={17} aria-hidden="true" />}
              </button>
            </form>
          )}
          <Link href="/login" className="auth-link auth-back-link">{vi.auth.backToSignIn}</Link>
        </section>
        <p className="login-footer">{vi.auth.footer}</p>
      </div>
    </main>
  );
}
