# Rotate a secret

Do this whenever a key may have been seen by someone else: pasted into a chat,
committed by mistake, shown in a screenshot, or a teammate left.

1. **Make a new key** at the service:
   - Neon: Project → Roles → `Reset password` (the connection strings change).
   - Razorpay (test mode): Account & Settings → API Keys → `Regenerate Test Key`.
   - Gemini: aistudio.google.com → API keys → delete the old key, create a new one.
   - Brevo: SMTP & API → API keys → create a new key, then delete the old one.
   - Cloudinary: Settings → API Keys → generate a new key pair.
2. **Put the new value in Render**: the service → Environment → edit the variable → Save.
   Render restarts the service with it (about a minute).
3. **Update your own `.env`** on your computer (never `.env.example`).
4. **Delete the old key** at the service, if step 1 did not already.
5. If the key was ever **committed to git**, rotating is the fix: removing it from
   history is not enough, because GitHub copies may already exist.
6. Check: open `https://<app>/api/v1/health/ready`; it should answer `ready`.
