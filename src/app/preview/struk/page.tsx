import DemoReceipt from "@/features/kasir/demo-receipt";
export const metadata = {
  title: "Preview struk · PRCUISA",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function Page() {
  return <DemoReceipt />;
}
