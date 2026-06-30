import { checkAdminSecret, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { generateQRDataUrl, generateQRPdf, buildProductionPayUrl } from "@/lib/qr-utils";

export async function GET(
  request: Request,
  context: { params: Promise<{ tableId: string }> },
): Promise<Response> {
  const { tableId } = await context.params;
  try {
    if (!checkAdminSecret(request)) return errorResponse("Unauthorized", 401);

    const table = await prisma.table.findUnique({
      where: { id: tableId },
      select: { id: true, name: true, token: true, restaurant: { select: { name: true } } },
    });
    if (!table) return errorResponse("Table not found", 404);

    const format = new URL(request.url).searchParams.get("format") ?? "png";
    if (!new Set(["png", "pdf"]).has(format)) {
      return errorResponse("Invalid format. Use 'png' or 'pdf'", 400);
    }

    const payUrl = buildProductionPayUrl(table.token);
    if (format === "pdf") {
      const pdf = await generateQRPdf(payUrl, `${table.restaurant.name} - ${table.name}`);
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="qr-${table.name}.pdf"`,
        },
      });
    }

    return new Response(
      JSON.stringify({ success: true, data: { dataUrl: await generateQRDataUrl(payUrl), payUrl } }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Admin QR generation failed:", error);
    return errorResponse("Internal server error", 500);
  }
}
