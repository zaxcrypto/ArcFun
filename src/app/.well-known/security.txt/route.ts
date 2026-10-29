import { NextResponse } from 'next/server';

export async function GET() {
  const content = `Contact: mailto:supportarcfun@gmail.com
Expires: 2027-12-31T23:59:59.000Z
Preferred-Languages: en
Canonical: https://www.thearcfun.xyz/.well-known/security.txt
`;

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
