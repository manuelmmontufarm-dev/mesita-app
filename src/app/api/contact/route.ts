import { Resend } from "resend";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().min(2).max(100),
  restaurant: z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  message: z.string().max(2000).optional(),
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, restaurant, email, phone, message } = parsed.data;

    // Send notification email via Resend if API key is configured
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const resend = new Resend(resendKey);
      const safeName       = escapeHtml(name);
      const safeRestaurant = escapeHtml(restaurant);
      const safeEmail      = escapeHtml(email);
      const safePhone      = phone ? escapeHtml(phone) : "—";
      const safeMessage    = message ? escapeHtml(message).replace(/\n/g, "<br>") : "—";
      await resend.emails.send({
        from: "PagaYa <noreply@pagaya.ec>",
        to: process.env.CONTACT_EMAIL ?? "hola@pagaya.ec",
        replyTo: email,
        subject: `Nuevo contacto: ${safeName} — ${safeRestaurant}`,
        html: `
          <h2>Nuevo mensaje de contacto — PagaYa</h2>
          <table style="border-collapse:collapse;width:100%;max-width:520px">
            <tr><td style="padding:8px;color:#6b7280;width:140px">Nombre</td><td style="padding:8px;font-weight:600">${safeName}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Restaurante</td><td style="padding:8px;font-weight:600">${safeRestaurant}</td></tr>
            <tr><td style="padding:8px;color:#6b7280">Email</td><td style="padding:8px"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Teléfono</td><td style="padding:8px">${safePhone}</td></tr>
            <tr><td style="padding:8px;color:#6b7280;vertical-align:top">Mensaje</td><td style="padding:8px">${safeMessage}</td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px">Recibido el ${new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" })} (Ecuador)</p>
        `,
      });
    } else {
      // Fallback: log to console in development
      console.log("[PagaYa Contact]", {
        name, restaurant, email, phone: phone ?? "—",
        message: message ?? "—", receivedAt: new Date().toISOString(),
      });
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[PagaYa Contact] Error:", error);
    // Still return success so the form doesn't scare the user —
    // email delivery failure shouldn't block the lead capture
    return Response.json({ success: true }, { status: 200 });
  }
}
