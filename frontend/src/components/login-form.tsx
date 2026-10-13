"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import { vi } from "@/i18n/vi";
import { AuthRequestError } from "@/lib/auth";

export function LoginForm() {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const validation = {
      identifier: identifier.trim() ? undefined : vi.auth.identifierRequired,
      password: password ? undefined : vi.auth.passwordRequired,
    };
    setErrors(validation);
    setError("");
    if (validation.identifier || validation.password) return;

    setSubmitting(true);
    try {
      await signIn({ identifier: identifier.trim(), password });
      setPassword("");
    } catch (requestError) {
      setError(requestError instanceof AuthRequestError && (requestError.status === 401 || requestError.status === 400)
        ? vi.auth.invalidCredentials
        : vi.auth.signInFailed);
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

        <section className="login-card" aria-labelledby="login-title">
          <p className="eyebrow">{vi.auth.eyebrow}</p>
          <h1 id="login-title">{vi.auth.title}</h1>
          <p className="login-description">{vi.auth.description}</p>

          <form noValidate onSubmit={handleSubmit} className="login-form" aria-busy={submitting}>
            <div className="form-field">
              <label htmlFor="identifier">{vi.auth.identifier} <span aria-hidden="true">*</span></label>
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={255}
                required
                disabled={submitting}
                value={identifier}
                aria-invalid={Boolean(errors.identifier)}
                aria-describedby={errors.identifier ? "identifier-error" : undefined}
                onChange={(event) => setIdentifier(event.target.value)}
              />
              {errors.identifier && <p id="identifier-error" className="field-error">{errors.identifier}</p>}
            </div>

            <div className="form-field">
              <label htmlFor="password">{vi.auth.password} <span aria-hidden="true">*</span></label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={submitting}
                value={password}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "password-error" : undefined}
                onChange={(event) => setPassword(event.target.value)}
              />
              {errors.password && <p id="password-error" className="field-error">{errors.password}</p>}
              <Link href="/forgot-password" className="auth-link forgot-link">{vi.auth.forgotPassword}</Link>
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button type="submit" className="primary-button sign-in-button" disabled={submitting}>
              {submitting ? vi.auth.signingIn : vi.auth.signIn}
              {submitting
                ? <LoaderCircle className="loading-icon" size={17} aria-hidden="true" />
                : <ArrowRight size={17} aria-hidden="true" />}
            </button>
          </form>
        </section>

        <p className="login-footer">{vi.auth.footer}</p>
      </div>
    </main>
  );
}
