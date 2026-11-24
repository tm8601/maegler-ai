import { NextResponse } from "next/server";
import {
  applyAutomaticDocumentRenaming,
  authenticateRequestAgent,
  getSellerCase,
  listUploadedFilesFromDisk,
  readUploadedFileFromDisk,
  upsertSellerCase,
} from "@/lib/case-store";
import {
  buildRenamedDocumentsZipBuffer,
  extractLocalPdfText,
  getAllStandardDocumentNames,
  learnDocumentRenameRule,
  loadRenamerMemory,
  sanitizeStandardBaseName,
  saveRenamerMemory,
  stripExtension,
} from "@/lib/document-renamer";

export async function GET(request: Request) {
  if (!authenticateRequestAgent(request)) {
    return NextResponse.json(
      { error: "Adgang nægtet: API kræver gyldig autentificering." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const caseId = searchParams.get("caseId") || "";
  const action = searchParams.get("action") || "status";

  if (action === "zip") {
    if (!caseId) {
      return NextResponse.json({ error: "Mangler caseId til ZIP-udtræk" }, { status: 400 });
    }
    const record = getSellerCase(caseId);
    const diskFiles = listUploadedFilesFromDisk(caseId);

    // Sørg for at omdøbningsplanen er 100 % opdateret
    const metas = applyAutomaticDocumentRenaming(record.uploadedDocMeta || []);
    const metaById = new Map(metas.map((m) => [m.id, m]));
    const metaByName = new Map(metas.map((m) => [m.name, m]));

    const zipEntries: Array<{ fileName: string; data: Buffer }> = [];

    for (const df of diskFiles) {
      const meta = metaById.get(df.fileId) || metaByName.get(df.fileName);
      const targetName = meta?.renamedFileName || df.fileName;
      zipEntries.push({
        fileName: targetName,
        data: df.buffer,
      });
    }

    if (zipEntries.length === 0) {
      return NextResponse.json(
        { error: "Ingen uploadede dokumenter fundet i dokumentrummet på denne sag." },
        { status: 404 }
      );
    }

    const zipBuffer = buildRenamedDocumentsZipBuffer(zipEntries);
    const cleanAddr = (record.address || caseId)
      .replace(/[^a-zA-Z0-9æøåÆØÅ ,.-]/g, "")
      .trim();
    const zipFileName = `Dokumenter - ${cleanAddr}.zip`;
    const encodedZipName = encodeURIComponent(zipFileName);

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFileName.replace(/[^a-zA-Z0-9 ,.-]/g, "_")}"; filename*=UTF-8''${encodedZipName}`,
        "Cache-Control": "no-store",
      },
    });
  }

  const record = caseId ? getSellerCase(caseId) : null;
  return NextResponse.json({
    standardNames: getAllStandardDocumentNames(),
    memory: loadRenamerMemory(),
    uploadedDocMeta: record?.uploadedDocMeta || [],
  });
}

export async function POST(request: Request) {
  if (!authenticateRequestAgent(request)) {
    return NextResponse.json(
      { error: "Adgang nægtet: API kræver gyldig autentificering." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const action = String(body.action || "rename_and_learn");
    const caseId = String(body.caseId || "").trim();

    if (action === "add_standard_name") {
      const rawName = String(body.newStandardName || "").trim();
      if (!rawName) {
        return NextResponse.json({ error: "Mangler nyt standardnavn" }, { status: 400 });
      }
      const isAssessmentWithYear = /^ejendomsvurdering\s+\d{4}$/i.test(rawName);
      const cleanName = sanitizeStandardBaseName(rawName, isAssessmentWithYear);
      const memory = loadRenamerMemory();
      if (!memory.customStandardNames.includes(cleanName)) {
        memory.customStandardNames.push(cleanName);
        saveRenamerMemory(memory);
      }
      return NextResponse.json({
        standardNames: getAllStandardDocumentNames(),
        memory,
        addedName: cleanName,
      });
    }

    if (!caseId) {
      return NextResponse.json({ error: "Mangler caseId" }, { status: 400 });
    }

    const record = getSellerCase(caseId);
    const metas = [...(record.uploadedDocMeta || [])];

    if (action === "swap_ejerskifte") {
      const ejMetas = metas.filter(
        (m) =>
          (m.renamedBaseName || "").toLowerCase().startsWith("ejerskifteforsikring") ||
          (m.detectedCategory || "").toLowerCase().startsWith("ejerskifteforsikring")
      );
      if (ejMetas.length >= 2) {
        // Byt rundt på rækkefølgen / swap-rank mellem tilbud og alternativt tilbud
        const firstIsMain = (ejMetas[0].renamedBaseName || "").toLowerCase() === "ejerskifteforsikring, tilbud";
        ejMetas[0].ejerskifteSwapRank = firstIsMain ? 2 : 1;
        ejMetas[0].isManualRename = false;
        ejMetas[1].ejerskifteSwapRank = firstIsMain ? 1 : 2;
        ejMetas[1].isManualRename = false;
      }

      const updatedCase = upsertSellerCase({
        id: record.id,
        agentEmail: record.agentEmail,
        agentName: record.agentName,
        address: record.address,
        uploadedDocMeta: metas,
      });

      return NextResponse.json({
        sellerCase: updatedCase,
        standardNames: getAllStandardDocumentNames(),
      });
    }

    if (action === "recompute") {
      const resetManual = Boolean(body.resetManualOverrides);
      const diskFiles = listUploadedFilesFromDisk(caseId);
      const diskById = new Map(diskFiles.map((d) => [d.fileId, d]));

      for (const m of metas) {
        if (resetManual) {
          m.isManualRename = false;
          m.ejerskifteSwapRank = null;
        }
        if (!m.extractedSummary || m.extractedSummary.length < 100) {
          const df = diskById.get(m.id);
          if (df) {
            m.extractedSummary = extractLocalPdfText(df.buffer).slice(0, 12000);
          }
        }
      }

      const updatedCase = upsertSellerCase({
        id: record.id,
        agentEmail: record.agentEmail,
        agentName: record.agentName,
        address: record.address,
        uploadedDocMeta: metas,
      });

      return NextResponse.json({
        sellerCase: updatedCase,
        standardNames: getAllStandardDocumentNames(),
      });
    }

    // Standard: action === "rename_and_learn"
    const docId = String(body.docId || "").trim();
    const rawTargetName = String(body.newTargetName || "").trim();
    const addToStandardList = body.addToStandardList !== false;

    if (!docId || !rawTargetName) {
      return NextResponse.json({ error: "Mangler docId eller newTargetName" }, { status: 400 });
    }

    const targetMeta = metas.find((m) => m.id === docId);
    if (!targetMeta) {
      return NextResponse.json({ error: "Dokument ikke fundet på sagen" }, { status: 404 });
    }

    const { ext } = stripExtension(targetMeta.name);
    const isAssessmentWithYear = /^ejendomsvurdering\s+\d{4}$/i.test(rawTargetName.replace(/\.[a-z0-9]{2,4}$/i, "").trim());
    const cleanBase = sanitizeStandardBaseName(rawTargetName, isAssessmentWithYear);

    // Hent fuld tekst fra disk eller extractedSummary til den selvlærende motor
    let fullText = targetMeta.extractedSummary || "";
    const diskFile = readUploadedFileFromDisk(caseId, docId);
    if (diskFile && (!fullText || fullText.length < 300)) {
      fullText = extractLocalPdfText(diskFile.buffer);
      targetMeta.extractedSummary = fullText.slice(0, 12000);
    }

    const { rule, memory } = learnDocumentRenameRule({
      originalName: targetMeta.name,
      extractedText: fullText,
      targetBaseName: cleanBase,
      addToStandardList,
    });

    targetMeta.isManualRename = true;
    targetMeta.renamedBaseName = cleanBase;
    targetMeta.renamedFileName = `${cleanBase}${ext}`;
    targetMeta.renameStatusBadge = "Manuelt navngivet (Gemt & tillært)";
    targetMeta.renameMethod = "manual_override";
    targetMeta.detectedCategory = cleanBase;

    const updatedCase = upsertSellerCase({
      id: record.id,
      agentEmail: record.agentEmail,
      agentName: record.agentName,
      address: record.address,
      uploadedDocMeta: metas,
    });

    return NextResponse.json({
      sellerCase: updatedCase,
      learnedRule: rule,
      standardNames: getAllStandardDocumentNames(),
      memory,
    });
  } catch (err: any) {
    console.error("doc-renamer POST fejl:", err);
    return NextResponse.json(
      { error: err.message || "Kunne ikke omdøbe dokument" },
      { status: 500 }
    );
  }
}
