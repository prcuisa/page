"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { browserClient } from "@/lib/supabase/browser";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
export default function AuthForm({
  mode,
  available,
  embedded = false,
  onModeChange,
}: {
  mode: "login" | "signup";
  available: boolean;
  embedded?: boolean;
  onModeChange?: (mode: "login" | "signup") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [reset, setReset] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("notice") === "expired")
      setError(
        "Tautan sudah tidak berlaku. Silakan masuk atau minta tautan pemulihan baru.",
      );
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const db = browserClient();
      const email = String(f.get("email"));
      if (reset) {
        const { error } = await db.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback?next=/update-password`,
        });
        if (error) throw error;
        setSent(true);
        return;
      }
      const password = String(f.get("password"));
      const result =
        mode === "signup"
          ? await db.auth.signUp({
              email,
              password,
              options: {
                data: { full_name: String(f.get("name")) },
                emailRedirectTo: `${location.origin}/auth/callback`,
              },
            })
          : await db.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) setSent(true);
      else location.assign("/dashboard");
    } catch {
      setError(
        reset ? "Tautan pemulihan belum dapat dikirim. Coba lagi nanti." : mode === "login"
          ? "Email atau kata sandi belum sesuai, atau koneksi terganggu. Silakan coba lagi."
          : "Akun belum berhasil dibuat. Periksa email, gunakan kata sandi minimal 10 karakter, lalu coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function continueWithGoogle() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        const { signInWithFirebaseGoogle } =
          await import("@/lib/firebase/google");
        await signInWithFirebaseGoogle();
        location.assign("/dashboard");
        return;
      }
      const next = "/dashboard";
      const { error: oauthError } = await browserClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (oauthError) throw oauthError;
    } catch (error) {
      const code = (error as { code?: string }).code;
      setError(
        code === "auth/popup-closed-by-user"
          ? "Login dibatalkan. Kamu bisa mencoba lagi."
          : code === "auth/popup-blocked"
            ? "Izinkan jendela pop-up untuk masuk dengan Google, lalu coba lagi."
            : "Google sign-in belum berhasil. Coba lagi atau gunakan email.",
      );
      setBusy(false);
    }
  }
  const Container = embedded ? "div" : "main";
  return (
    <Container className={embedded ? "auth-page auth-embedded" : "auth-page"}>
      <section className="auth-story">
        <Link href="/" className="brand">
          prcuisa<span>hub</span>
        </Link>
        <div>
          <span className="eyebrow">ONE ID · MANY TOOLS</span>
          <h1>
            Satu PRCUISA ID.
            <br />
            <em>Banyak tools berguna.</em>
          </h1>
          <p>
            Temukan tools yang bisnis kamu butuhkan.
            <br />
            Semuanya terhubung lewat satu akun.
          </p>
        </div>
        <small>One account. Smarter tools. Better business.</small>
      </section>
      <section className="auth-panel">
        <div className="auth-box">
          <LockKeyhole className="teal" size={28} />
          <h2>
            {reset
              ? "Pulihkan akun."
              : mode === "login"
                ? "Selamat datang kembali."
                : "Mulai dengan PRCUISA ID."}
          </h2>
          <p className="muted">
            {mode === "login"
              ? "Masuk ke bisnis kamu."
              : "Satu akun untuk seluruh tools PRCUISA yang tersedia."}
          </p>
          {!available ? (
            <div className="notice">
              <strong>Akun belum terhubung.</strong>
              <p>
                Kamu tetap bisa mencoba dashboard dan tools tanpa membuat akun.
              </p>
              <Link className="button primary" href="/preview">
                Coba preview
              </Link>
            </div>
          ) : sent ? (
            <div className="notice" role="status">
              <h3>Cek email kamu.</h3>
              <p>
                {reset
                  ? "Jika email terdaftar, tautan pemulihan akan dikirim. Buka tautan tersebut untuk mengatur kata sandi baru."
                  : "Buka tautan konfirmasi untuk mengaktifkan PRCUISA ID, lalu masuk ke bisnis kamu."}
              </p>
            </div>
          ) : (
            <>
              {!reset && (
                <button
                  type="button"
                  className="secondary auth-google"
                  onClick={() => void continueWithGoogle()}
                  disabled={busy}
                >
                  <GoogleMark />
                  {busy ? "Menghubungkan akun…" : "Lanjutkan dengan Google"}
                </button>
              )}
              {!reset && (
                <div className="auth-divider">
                  <span>atau gunakan email</span>
                </div>
              )}
              <form onSubmit={submit}>
                {mode === "signup" && (
                  <label>
                    Nama
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={80}
                    />
                  </label>
                )}
                <label>
                  Email
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                  />
                </label>
                {!reset && (
                  <label>
                    Kata sandi
                    <input
                      type="password"
                      name="password"
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      minLength={mode === "signup" ? 10 : 1}
                      required
                    />
                  </label>
                )}
                {mode === "signup" && (
                  <small className="muted">Gunakan minimal 10 karakter.</small>
                )}
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <button className="primary" disabled={busy}>
                  {busy
                    ? "Mohon tunggu…"
                    : reset
                      ? "Kirim tautan pemulihan"
                      : mode === "login"
                        ? "Masuk"
                        : "Buat PRCUISA ID"}
                </button>
              </form>
            </>
          )}
          {mode === "login" && (
            <Link
              className="quiet-link"
              href="/reset-password"
              onClick={(e) => {
                if (embedded) {
                  e.preventDefault();
                  setReset(!reset);
                  setSent(false);
                  setError("");
                }
              }}
            >
              {reset ? "Kembali masuk" : "Lupa kata sandi?"}
            </Link>
          )}
          <p className="auth-switch">
            {mode === "login" ? "Belum punya akun?" : "Sudah punya akun?"}{" "}
            <Link
              href={mode === "login" ? "/signup" : "/login"}
              onClick={(e) => {
                if (onModeChange) {
                  e.preventDefault();
                  onModeChange(mode === "login" ? "signup" : "login");
                }
              }}
            >
              {mode === "login" ? "Daftar" : "Masuk"}
            </Link>
          </p>
          <Link href="/preview" className="quiet-link">
            Jelajahi Hub dan tools tanpa akun <ArrowUpRight size={16} />
          </Link>
        </div>
        <small className="muted">
          PRCUISA · Build smarter systems that keep working.
        </small>
      </section>
    </Container>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18">
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"
      />
      <path
        fill="#FBBC05"
        d="M12.6 27.7a12 12 0 0 1 0-7.4V15H5.8a20 20 0 0 0 0 18l6.8-5.3Z"
      />
      <path
        fill="#EA4335"
        d="M24 11.9c3 0 5.7 1 7.8 3l5.9-5.9C34.1 5.7 29.5 4 24 4A20 20 0 0 0 5.8 15l6.8 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z"
      />
    </svg>
  );
}
