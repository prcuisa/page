import AuthForm from "@/components/auth-form";
import { configured } from "@/lib/supabase/server";
export const metadata = {
  title: "Masuk",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AuthForm mode="login" available={configured()} />;
}
