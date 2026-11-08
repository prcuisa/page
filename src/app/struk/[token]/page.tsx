import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import ReceiptView, { PrintReceipt } from "@/features/kasir/receipt";
import { receiptSchema } from "@/features/kasir/domain";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Struk digital · PRCUISA",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let receipt = null;
  let unavailable = false;
  if (/^[a-f0-9]{64}$/.test(token)) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      try {
        const db = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await db.rpc("kasir_receipt", {
          token_hash: createHash("sha256").update(token).digest("hex"),
        });
        if (error) unavailable = true;
        const parsed = receiptSchema.safeParse(data);
        if (parsed.success) receipt = parsed.data;
      } catch {
        unavailable = true;
      }
    } else unavailable = true;
  }
  return (
    <main className="kasir-public">
      <h1>Struk digital</h1>
      {receipt ? (
        <>
          <ReceiptView receipt={receipt} />
          <PrintReceipt />
        </>
      ) : (
        <p>
          {unavailable
            ? "Struk belum dapat dimuat. Coba lagi nanti atau minta struk kepada kasir."
            : "Tautan struk tidak tersedia, sudah kedaluwarsa, atau dicabut. Minta tautan baru kepada kasir."}
        </p>
      )}
    </main>
  );
}
