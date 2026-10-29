// Sends transactional emails through Brevo (https://developers.brevo.com):
//  - SMTP relay when BREVO_SMTP_USER + BREVO_SMTP_KEY are set (key from the "SMTP" tab)
//  - otherwise the HTTP API with BREVO_API_KEY (key from the "API keys" tab)
const nodemailer = require("nodemailer");

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Reused between requests (and between invocations of a warm Vercel function)
let transporter = null;
function smtpTransporter() {
  if (!transporter) {
    const port = Number(process.env.BREVO_SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
      port,
      secure: port === 465, // 587 upgrades to TLS with STARTTLS
      auth: { user: process.env.BREVO_SMTP_USER, pass: process.env.BREVO_SMTP_KEY },
      // Fail fast instead of hanging the request (Vercel functions have a time limit)
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

async function sendEmail({ to, toName, subject, html, text }) {
  const senderEmail = process.env.OTP_SENDER_EMAIL;
  const senderName = process.env.OTP_SENDER_NAME || "Xtovia";
  const useSmtp = process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_KEY;
  const apiKey = process.env.BREVO_API_KEY;
  if (!senderEmail || (!useSmtp && !apiKey)) {
    throw new Error(
      "Email is not configured (set OTP_SENDER_EMAIL and either BREVO_SMTP_USER + BREVO_SMTP_KEY or BREVO_API_KEY)"
    );
  }

  if (useSmtp) {
    try {
      await smtpTransporter().sendMail({
        from: { name: senderName, address: senderEmail },
        to: toName ? { name: toName, address: to } : to,
        subject,
        text,
        html,
      });
    } catch (err) {
      throw new Error(`Brevo SMTP: ${err.response || err.message}`);
    }
    return;
  }

  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to, ...(toName && { name: toName }) }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function sendLoginCode({ to, name, code, minutes }) {
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  await sendEmail({
    to,
    toName: name,
    subject: `${code} is your Xtovia affiliate login code`,
    text: `${name ? `Hi ${name},` : "Hi,"}\n\nYour login code is ${code}. It expires in ${minutes} minutes.\n\nIf you didn't ask for this, you can ignore this email.\n\nXtovia`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#1a1a1a;max-width:440px">
  <p>${greeting}</p>
  <p>Your Xtovia affiliate login code is:</p>
  <p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
  <p>It expires in ${minutes} minutes.</p>
  <p style="color:#6b6b6b;font-size:13px">If you didn't ask for this, you can ignore this email.</p>
</div>`,
  });
}

module.exports = { sendEmail, sendLoginCode };
