// Lazily initialize Resend client to avoid throwing at import time when the
// RESEND_API_KEY environment variable is not configured (e.g. in some deploys).
let _resendClient = null;

async function getResendClient() {
  if (_resendClient) return _resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // No API key: provide a no-op client to avoid crashing the process on import.
    console.warn("RESEND_API_KEY not set. Email sending will be disabled.");
    _resendClient = {
      emails: {
        send: async (opts) => {
          console.warn("Skipping email send (RESEND_API_KEY missing)", opts?.to || opts);
          return { ok: false, skipped: true };
        }
      }
    };
    return _resendClient;
  }

  try {
    const { Resend } = await import("resend");
    _resendClient = new Resend(key);
    return _resendClient;
  } catch (err) {
    console.error("Failed to initialize Resend client:", err);
    // Fall back to a no-op client to avoid startup failures.
    _resendClient = {
      emails: {
        send: async (opts) => {
          console.warn("Resend unavailable, skipping email send", opts?.to || opts);
          return { ok: false, skipped: true, error: String(err) };
        }
      }
    };
    return _resendClient;
  }
}

export async function sendEmail({ to, subject, html, from }) {
  const client = await getResendClient();
  const fromAddr = from || process.env.MAIL_FROM || process.env.EMAIL_FROM || "no-reply@wheels.local";
  try {
    const result = await client.emails.send({ from: fromAddr, to, subject, html });
    console.log("Email send result:", result?.id || result);
    return result;
  } catch (error) {
    console.error("Email error:", error);
    throw error;
  }
}
