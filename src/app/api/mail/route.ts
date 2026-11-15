import { NextResponse } from "next/server";
import { upsertSellerCase } from "@/lib/case-store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      to,
      sellerName,
      address,
      caseId,
      agentEmail,
      agentName,
      aiQuestions,
      generatedAfsnit11Clauses,
    } = body;

    if (!to) {
      return NextResponse.json({ error: "Indtast venligst sælgers e-mailadresse" }, { status: 400 });
    }

    const savedCase = upsertSellerCase({
      id: caseId,
      agentEmail,
      agentName,
      address: address || "H C Hansens Vej 29, 7100 Vejle",
      sellerName: sellerName || "Sælger",
      sellerEmail: to,
      status: "sendt",
      aiQuestions,
      generatedAfsnit11Clauses,
    });

    const sellerPortalUrl = `https://maegler.ai-beregner.dk/seller/${savedCase.id}`;
    const resendKey = process.env.RESEND_API_KEY || "";

    const htmlBody = `
      <div style="font-family: Inter, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 16px;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Velkommen til dit digitale sælgeroplysningsskema</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.6;">
          Kære ${savedCase.sellerName || "Sælger"},<br/><br/>
          I forbindelse med klargøringen af salget på <strong>${savedCase.address}</strong> har vi udarbejdet et skræddersyet spørgsskema baseret på ejendommens registreringer i BBR, Matriklen og Plandata.
        </p>
        <div style="margin: 28px 0;">
          <a href="${sellerPortalUrl}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: 600; display: inline-block;">
            Åbn Sælgeroplysningsskema →
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px;">
          Direkte link: <a href="${sellerPortalUrl}">${sellerPortalUrl}</a>
        </p>
      </div>
    `;

    if (resendKey && resendKey !== "re_dummy_key") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Vejle Mægleren AI <beregner@ai-beregner.dk>",
          to: [to],
          subject: `Sælgeroplysningsskema: ${savedCase.address}`,
          html: htmlBody,
        }),
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({
        success: true,
        sentViaResend: res.ok,
        messageId: data?.id || "resend-msg",
        sellerPortalUrl,
        caseId: savedCase.id,
        sellerCase: savedCase,
      });
    }

    return NextResponse.json({
      success: true,
      sentViaResend: false,
      simulated: true,
      sellerPortalUrl,
      caseId: savedCase.id,
      sellerCase: savedCase,
    });
  } catch (error: any) {
    console.error("Mail sending error:", error);
    return NextResponse.json({ error: error.message || "Kunne ikke afsende e-mail" }, { status: 500 });
  }
}
