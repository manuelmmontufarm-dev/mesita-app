import { requireAuth, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { generateQRDataUrl, generateQRPdf } from "@/lib/qr-utils";

export async function GET(
  request: Request,
  context: { params: Promise<{ tableId: string }> }
): Promise<Response> {
  const { tableId } = await context.params;
  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId } = authResult;

    // Get the format from query params (default: png)
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "png";

    if (!["png", "pdf"].includes(format)) {
      return errorResponse("Invalid format. Use 'png' or 'pdf'", 400);
    }

    // Get table by ID
    const table = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      return errorResponse("Table not found", 404);
    }

    // Verify table belongs to user's restaurant
    if (table.restaurantId !== restaurantId) {
      return errorResponse("Forbidden", 403);
    }

    // Build QR URL: /pay/[token]
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const qrUrl = `${appUrl}/pay/${table.token}`;

    // Generate QR code based on format
    if (format === "png") {
      // Generate PNG data URL
      const dataUrl = await generateQRDataUrl(qrUrl);

      // Return PNG as data URL
      return new Response(JSON.stringify({ success: true, dataUrl }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } else if (format === "pdf") {
      // Generate PDF
      const pdfBuffer = await generateQRPdf(qrUrl, table.name);

      // Return PDF file
      return new Response(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="qr-${table.name}.pdf"`,
        },
      });
    }

    return errorResponse("Invalid format", 400);
  } catch (error) {
    console.error("Error generating QR code:", error);
    return errorResponse("Internal server error", 500);
  }
}
