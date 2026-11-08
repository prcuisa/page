"use client";
import { useState } from "react";
import Link from "next/link";
import { browserClient } from "@/lib/supabase/browser";
export default function PasswordForm({
  mode,
  available,
}: {
  mode: "request" | "update";
  available: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const db = browserClient();
      if (mode === "request") {
        const { error } = await db.auth.resetPasswordForEmail(
          String(f.get("email")),
          {
            redirectTo: `${location.origin}/auth/callback?next=/update-password`,
          },
        );
        if (error) throw error;
      } else {
        const password = String(f.get("password"));
        if (password !== f.get("confirm")) throw new Error("MISMATCH");
        const {
          data: { user },
          error: authError,
        } = await db.auth.getUser();
        if (authError || !user) throw new Error("EXPIRED");
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        await db.auth.signOut();
      }
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error && e.message === "MISMATCH"
          ? "Kedua kata sandi belum sama."
          : e instanceof Error && e.message === "EXPIRED"
            ? "Tautan sudah tidak berlaku. Minta tautan baru untuk melanjutkan."
            : "Belum berhasil. Coba lagi sebentar lagi.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="password-page">
      <Link href="/" className="brand">
        prcuisa<span>hub</span>
      </Link>
      <section className="auth-box">
        <h1>
          {mode === "request" ? "Lupa kata sandi?" : "Buat kata sandi baru"}
        </h1>
        <p className="muted">
          {mode === "request"
            ? "Masukkan email PRCUISA ID kamu."
            : "Gunakan minimal 10 karakter."}
        </p>
        {!available ? (
          <div className="notice">
            <p>Pemulihan akun belum tersedia di preview ini.</p>
            <Link href="/preview">Kembali ke preview</Link>
          </div>
        ) : done ? (
          <div className="notice" role="status">
            <p>
              {mode === "request"
                ? "Jika email terdaftar, tautan pemulihan akan dikirim. Periksa kotak masuk dan folder spam."
                : "Kata sandi berhasil diperbarui. Silakan masuk kembali."}
            </p>
            <Link href="/login">Kembali masuk</Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            {mode === "request" ? (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
            ) : (
              <>
                <label>
                  Kata sandi baru
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    required
                  />
                </label>
                <label>
                  Ulangi kata sandi baru
                  <input
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    required
                  />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Mohon tunggu…"
                : mode === "request"
                  ? "Kirim tautan pemulihan"
                  : "Simpan kata sandi"}
            </button>
          </form>
        )}
        <Link className="quiet-link" href="/login">
          Kembali ke halaman masuk
        </Link>
      </section>
    </main>
  );
}
