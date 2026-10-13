"use client";

import { LoaderCircle, Mail } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { vi } from "@/i18n/vi";
import { AuthRequestError, requestPasswordReset } from "@/lib/auth";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const normalizedEmail = email.trim();
    setEmailError("");
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 255) {
      setEmailError(vi.auth.emailInvalid);
      return;
    }

    setSubmitting(true);
    try {
      await requestPasswordReset(normalizedEmail);
      setSent(true);
    } catch (requestError) {
      if (requestError instanceof AuthRequestError && requestError.status === 400) {
        setEmailError(vi.auth.emailInvalid);
      } else {
        setError(vi.auth.forgotFailed);
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
        <section className="login-card" aria-labelledby="forgot-title">
          <p className="eyebrow">{vi.auth.eyebrow}</p>
          <h1 id="forgot-title">{vi.auth.forgotTitle}</h1>
          <p className="login-description">{vi.auth.forgotDescription}</p>

          {sent ? (
            <div className="login-form" role="status">
              <p className="form-success">{vi.auth.forgotSuccess}</p>
              <p className="field-hint">{vi.auth.forgotNext}</p>
            </div>
          ) : (
            <form noValidate onSubmit={handleSubmit} className="login-form" aria-busy={submitting}>
              <div className="form-field">
                <label htmlFor="email">{vi.auth.email} <span aria-hidden="true">*</span></label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={255}
                  required
                  disabled={submitting}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? "email-error" : undefined}
                />
                {emailError && <p id="email-error" className="field-error">{emailError}</p>}
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" className="primary-button sign-in-button" disabled={submitting}>
                {submitting ? vi.auth.sendingResetLink : vi.auth.sendResetLink}
                {submitting
                  ? <LoaderCircle className="loading-icon" size={17} aria-hidden="true" />
                  : <Mail size={17} aria-hidden="true" />}
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
