import seed from "./app-registry.json";
export type Tool = (typeof seed)[number];
export const previewTools: Tool[] = seed;
export type ToolState = {
  app_id: string;
  favorite: boolean;
  last_opened_at: string | null;
};
export type PlatformEvent = {
  id: string;
  name: string;
  app_id: string | null;
  created_at: string;
};
export type ToolRequest = {
  id: string;
  problem: string;
  workflow: string;
  frequency: string;
  status: string;
  created_at: string;
};
export type Access = {
  capability: string;
  enabled: boolean;
  monthly_limit: number | null;
};
export type PlatformData = {
  is_admin?: boolean;
  workspace_role?: string;
  name: string;
  email: string;
  tools: Tool[];
  states: ToolState[];
  requests: ToolRequest[];
  events: PlatformEvent[];
  plan: string;
  access: Access[];
  usage: { app_id: string; quantity: number }[];
};
export const eventLabels: Record<string, string> = {
  kasir_product_saved: "Barang kasir diperbarui",
  kasir_receipt_share: "QR struk diaktifkan",
  kasir_receipt_revoke: "Tautan struk dicabut",
  hub_viewed: "Hub dibuka",
  tool_opened: "Tool dibuka",
  second_tool_opened: "Tool kedua dicoba",
  tool_value_completed: "Hasil tool dibuat",
  tool_favorited: "Favorit diperbarui",
  tool_request_submitted: "Permintaan tool dikirim",
  upgrade_viewed: "Paket dilihat",
  upgrade_clicked: "Minat paket dicatat",
  tool_searched: "Tool dicari",
};
export const statusLabels: Record<string, string> = {
  submitted: "Diterima",
  reviewing: "Sedang ditinjau",
  planned: "Direncanakan",
  building: "Sedang dibuat",
  beta: "Uji coba",
  released: "Tersedia",
  declined: "Belum dilanjutkan",
};
export function matchesTool(tool: Tool, query: string) {
  const words = query
    .toLocaleLowerCase("id")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const hay = [tool.name, tool.description, tool.keywords]
    .join(" ")
    .toLocaleLowerCase("id");
  return words.every((w) => hay.includes(w));
}
