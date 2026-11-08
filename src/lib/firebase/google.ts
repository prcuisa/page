"use client";
import { getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { browserClient } from "@/lib/supabase/browser";
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const firebaseConfigured = () => Object.values(config).every(Boolean);
export async function signInWithFirebaseGoogle() {
  if (!firebaseConfigured())
    throw new Error("Google belum tersedia. Silakan masuk dengan email.");
  const app =
    getApps().find((app) => app.name === "prcuisa-login") ||
    initializeApp(config, "prcuisa-login");
  const auth = getAuth(app);
  await setPersistence(auth, inMemoryPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    const result = await signInWithPopup(auth, provider);
    // Exchange the provider's GOOGLE token, never the Firebase user ID token.
    // Supabase verifies the token and remains the PRCUISA ID/session authority.
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.idToken)
      throw new Error("Google belum memberikan akses. Silakan coba lagi.");
    const { error } = await browserClient().auth.signInWithIdToken({
      provider: "google",
      token: credential.idToken,
    });
    if (error)
      throw new Error(
        "Akun Google belum dapat dihubungkan. Silakan gunakan email atau hubungi PRCUISA.",
      );
  } finally {
    await signOut(auth).catch(() => undefined);
  }
}
