import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Invalid email address").max(254));

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
