#!/usr/bin/env node
import dotenv from "dotenv";
import { sendEmail } from "../src/services/emailService.js";

dotenv.config();

async function main() {
  const toArg = process.argv[2] || process.env.TEST_EMAIL;
  if (!toArg) {
    console.error("Usage: node scripts/send-test-email.js <email-address> or set TEST_EMAIL env var");
    process.exit(1);
  }

  try {
    console.log(`Sending test email to ${toArg} via Resend API...`);
    const res = await sendEmail({
      to: toArg,
      subject: "Wheels Sabana - Correo de prueba",
      html: `<p>Hola, este es un correo de prueba enviado desde Wheels Sabana a ${toArg}</p>`
    });
    console.log("Send result:", res);
    process.exit(0);
  } catch (err) {
    console.error("Failed to send test email:", err && err.message ? err.message : err);
    process.exit(2);
  }
}

main();
