import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json({ error: 'Missing query parameter "q"' }, { status: 400 });
  }

  // DAWA has officially shut down as of Oct 2026. 
  // Returning mock data matching the DAWA autocomplete format to keep the prototype UI working.
  const mockSuggestions = [
    {
      tekst: `${q}, 7100 Vejle`,
      adresse: { id: "mock-1", href: "" }
    },
    {
      tekst: `${q}, 2900 Hellerup`,
      adresse: { id: "mock-2", href: "" }
    },
    {
      tekst: `${q}, 8000 Aarhus C`,
      adresse: { id: "mock-3", href: "" }
    }
  ];

  return NextResponse.json(mockSuggestions);
}
