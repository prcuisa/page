"use client";
import { useRef, useState } from "react";
import { X } from "lucide-react";
import AuthForm from "./auth-form";
export default function DashboardAuth() {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const available = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
  return (
    <>
      <button className="text-button" onClick={() => ref.current?.showModal()}>
        Masuk / Daftar
      </button>
      <dialog
        ref={ref}
        className="dashboard-auth-dialog"
        aria-label="Masuk atau daftar PRCUISA ID"
      >
        <button
          className="auth-close"
          aria-label="Tutup panel akun"
          onClick={() => ref.current?.close()}
        >
          <X size={20} />
        </button>
        <AuthForm
          key={mode}
          mode={mode}
          available={available}
          embedded
          onModeChange={setMode}
        />
      </dialog>
    </>
  );
}
