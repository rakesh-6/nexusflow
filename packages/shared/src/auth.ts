import { z } from "zod";

// Validation rules for accounts (PRD §11.1, §17.7). The web forms and the API
// both use these schemas, so they always agree on what is allowed.

// A short list of very common passwords that are rejected outright. Attackers
// try these first. (PRD §11.1.1 asks for a larger list; this covers the worst.)
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "12345678910",
  "11111111",
  "00000000",
  "qwerty123",
  "qwertyuiop",
  "qwerty12",
  "1q2w3e4r",
  "1qaz2wsx",
  "zaq12wsx",
  "abc12345",
  "abcd1234",
  "iloveyou1",
  "welcome1",
  "welcome123",
  "admin123",
  "letmein1",
  "monkey123",
  "football1",
  "baseball1",
  "sunshine1",
  "princess1",
  "dragon123",
  "master123",
  "superman1",
  "trustno1",
  "starwars1",
  "computer1",
  "michael1",
  "shadow123",
  "123qwe123",
  "asdf1234",
  "asdfghjkl1",
  "changeme1",
  "nexusflow1",
  "nexusflow123",
]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use at most 128 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number")
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: "This password is too common. Choose a less predictable one.",
  });

export const personNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name")
  .max(80, "Use at most 80 characters")
  .regex(/^[^\p{Cc}]*$/u, "Name cannot contain control characters");

export const registerSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

// Login only checks the shape: the real password rules are not revealed here.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(128),
});

export const emailOnlySchema = z.object({ email: emailSchema });

export const tokenSchema = z.object({
  token: z.string().min(20, "This link is incomplete").max(200),
});

export const resetPasswordSchema = z.object({
  token: tokenSchema.shape.token,
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(128),
  newPassword: passwordSchema,
});

export const reauthenticateSchema = z.object({
  password: z.string().min(1, "Enter your password").max(128),
});

export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone");

/** The profile form: every field filled in. */
export const profileFormSchema = z.object({ name: personNameSchema, timezone: timezoneSchema });

/** PATCH /users/me: send only the fields that changed. */
export const updateProfileSchema = profileFormSchema.partial();

/** Deleting your account: confirm with your password and by typing DELETE. */
export const deleteAccountFormSchema = z.object({
  password: z.string().min(1, "Enter your password").max(128),
  confirmation: z.literal("DELETE", "Type DELETE in capital letters to confirm"),
});

// Profile photo upload (PRD §11.1.6): JPEG, PNG or WebP up to 5 MB.
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const avatarUploadSchema = z.object({
  mimeType: z.enum(AVATAR_TYPES, "Use a JPEG, PNG or WebP image"),
  sizeBytes: z.number().int().positive().max(AVATAR_MAX_BYTES, "Use an image of 5 MB or less"),
});

export const avatarConfirmSchema = z.object({ publicId: z.string().min(1).max(300) });

// Forms that ask for a new password twice. Only the browser uses the second
// copy; the API receives the password once.
const passwordsMatch = { message: "The two passwords do not match", path: ["confirmPassword"] };

export const resetPasswordFormSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, passwordsMatch);

export const changePasswordFormSchema = z
  .object({
    currentPassword: changePasswordSchema.shape.currentPassword,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, passwordsMatch);

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** The signed-in person as the API returns it from GET /users/me. */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  timezone: string;
  emailVerified: boolean;
  hasPassword: boolean;
  createdAt: string;
}
