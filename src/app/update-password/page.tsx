import PasswordForm from "@/components/password-form";
import { configured, serverClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Kata sandi baru",
  robots: { index: false, follow: false },
};
export default async function Page() {
  if (configured()) {
    const db = await serverClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) redirect("/reset-password");
  }
  return <PasswordForm mode="update" available={configured()} />;
}
