import QRCode from "qrcode";
import jsPDF from "jspdf";

/**
 * Generate QR code as PNG data URL
 * @param data - The data to encode in the QR code
 * @returns Promise<string> - Data URL string for PNG image
 */
export async function generateQRDataUrl(data: string): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(data);
    return dataUrl;
  } catch (error) {
    console.error("Error generating QR code data URL:", error);
    throw new Error("Failed to generate QR code");
  }
}

/**
 * Generate QR code as PDF file
 * @param data - The data to encode in the QR code
 * @param filename - Filename for the PDF (without extension)
 * @returns Promise<Buffer> - PDF file as Buffer
 */
export async function generateQRPdf(
  data: string,
  filename: string
): Promise<Buffer> {
  try {
    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(data);

    // Create PDF document
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    // Add title
    pdf.setFontSize(16);
    pdf.text("QR Code", 105, 20, { align: "center" });

    // Add QR code image (centered, 100mm x 100mm)
    const pageWidth = pdf.internal.pageSize.getWidth();
    const qrSize = 100;
    const qrX = (pageWidth - qrSize) / 2;
    const qrY = 40;

    pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

    // Add filename below QR code
    pdf.setFontSize(10);
    pdf.text(`${filename}`, 105, qrY + qrSize + 15, { align: "center" });

    // Return PDF as buffer
    return Buffer.from(pdf.output("arraybuffer"));
  } catch (error) {
    console.error("Error generating QR code PDF:", error);
    throw new Error("Failed to generate QR code PDF");
  }
}
