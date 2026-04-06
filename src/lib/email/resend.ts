const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendResendEmail(input: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const from = input.from ?? process.env.RESEND_FROM_EMAIL ?? "DukaanHQ <hello@unmatchedlines.com>";

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed: ${body}`);
  }

  return response.json();
}
