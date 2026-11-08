import { z } from "zod";
export const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
export const amount = z.number().int().min(0).max(1_000_000_000);
export const productSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().max(60).default(""),
  price: amount,
  active: z.boolean().default(true),
});
export type Product = z.infer<typeof productSchema> & { id: string };
export const checkoutSchema = z
  .object({
    key: z.uuid(),
    items: z
      .array(
        z.object({
          id: z.uuid(),
          quantity: z.number().int().min(1).max(9999),
          price: amount,
        }),
      )
      .min(1)
      .max(50),
    discount: amount,
    method: z.enum(["cash", "transfer", "qris"]),
    tendered: z.number().int().min(0).max(1_000_000_000_000),
  })
  .refine(
    (v) => new Set(v.items.map((i) => i.id)).size === v.items.length,
    "Barang duplikat",
  );
export type Checkout = z.infer<typeof checkoutSchema>;
export const receiptSchema = z.object({
  number: z.string().max(60),
  business: z.string().max(120),
  date: z.iso.datetime(),
  items: z
    .array(
      z.object({
        name: z.string().max(100),
        quantity: z.number().int().positive().max(9999),
        price: amount,
        total: z.number().int().nonnegative().max(1e12),
      }),
    )
    .min(1)
    .max(50),
  subtotal: z.number().int().nonnegative().max(1e12),
  discount: amount,
  total: z.number().int().nonnegative().max(1e12),
  method: z.enum(["cash", "transfer", "qris"]),
  tendered: z.number().int().nonnegative().max(1e12),
  change: z.number().int().nonnegative().max(1e12),
});
export type Receipt = z.infer<typeof receiptSchema>;
export type Sale = { id: string; receipt: Receipt; created_at: string };
export function totals(items: Checkout["items"], discount: number) {
  const subtotal = items.reduce((n, i) => n + i.price * i.quantity, 0);
  if (
    !Number.isSafeInteger(subtotal) ||
    subtotal > 1e12 ||
    !Number.isInteger(discount) ||
    discount < 0 ||
    discount > subtotal
  )
    throw Error("Periksa jumlah barang dan diskon.");
  return { subtotal, total: subtotal - discount };
}
