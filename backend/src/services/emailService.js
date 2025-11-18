import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({ to, subject, html }) {
  try {
    const result = await resend.emails.send({
      from: "onboarding@resend.dev",
      to,
      subject,
      html,
    });
    console.log("Email sent:", result);
    return result;
  } catch (error) {
    console.error("Email error:", error);
    throw error;
  }
}
