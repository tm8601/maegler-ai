import { NextResponse } from "next/server";
import { authenticateRequestAgent, getSellerCase, readUploadedFileFromDisk } from "@/lib/case-store";

export async function GET(request: Request) {
  if (!authenticateRequestAgent(request)) {
    return NextResponse.json(
      { error: "Adgang nægtet: API kræver gyldig autentificering." },
      { status: 401 }
    );
  }
  const { searchParams } = new URL(request.url);
  const caseId = searchParams.get("caseId") || "";
  const fileId = searchParams.get("fileId") || "";
  const download = searchParams.get("download") === "1";

  if (!caseId || !fileId) {
    return NextResponse.json({ error: "Mangler caseId eller fileId" }, { status: 400 });
  }

  const found = readUploadedFileFromDisk(caseId, fileId);
  if (!found) {
    return NextResponse.json({ error: "Fil ikke fundet på serveren" }, { status: 404 });
  }

  const sellerCase = getSellerCase(caseId);
  const meta = (sellerCase.uploadedDocMeta || []).find((m) => m.id === fileId);
  const outName = meta?.renamedFileName || found.fileName;
  const safeFilename = encodeURIComponent(outName);
  const dispositionType = download ? "attachment" : "inline";

  return new NextResponse(new Uint8Array(found.buffer), {
    status: 200,
    headers: {
      "Content-Type": found.mimeType,
      "Content-Disposition": `${dispositionType}; filename*=UTF-8''${safeFilename}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
