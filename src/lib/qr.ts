import { z } from "zod";
export const qrSchema = z
  .string()
  .trim()
  .max(1200)
  .url()
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return false;
    }
  }, "Gunakan tautan lengkap https:// tanpa kata sandi.");
