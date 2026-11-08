import PasswordForm from "@/components/password-form";
import { configured } from "@/lib/supabase/server";
export const metadata = {
  title: "Reset kata sandi",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <PasswordForm mode="request" available={configured()} />;
}
