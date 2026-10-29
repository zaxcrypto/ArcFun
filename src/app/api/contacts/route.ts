import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/lib/supabase-admin';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

/** Verify arc_session cookie and return the wallet address, or null */
async function getAuthenticatedAddress(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('arc_session')?.value;
    if (!token) return null;
    const decoded: any = jwt.verify(token, JWT_SECRET);
    return (decoded.sub as string)?.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** GET /api/contacts — fetch all contacts for the authenticated user */
export async function GET() {
  const ownerAddress = await getAuthenticatedAddress();
  if (!ownerAddress) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('contact_address, contact_name, color_index')
    .eq('owner_address', ownerAddress);

  if (error) {
    console.error('[GET /api/contacts] DB error:', error.message);
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 });
  }

  return NextResponse.json({ contacts: data });
}

/** POST /api/contacts — upsert a contact for the authenticated user */
export async function POST(req: Request) {
  const ownerAddress = await getAuthenticatedAddress();
  if (!ownerAddress) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { contactAddress, contactName, colorIndex } = body;

  // Validate contactAddress is a valid EVM address
  if (!contactAddress || typeof contactAddress !== 'string') {
    return NextResponse.json({ error: 'contactAddress is required' }, { status: 400 });
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(contactAddress.trim())) {
    return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 });
  }

  // Cap contactName length
  if (contactName !== null && contactName !== undefined) {
    if (typeof contactName !== 'string') {
      return NextResponse.json({ error: 'contactName must be a string' }, { status: 400 });
    }
    if (contactName.length > 100) {
      return NextResponse.json({ error: 'contactName must be 100 characters or fewer' }, { status: 400 });
    }
  }

  const { error } = await supabaseAdmin
    .from('contacts')
    .upsert({
      owner_address: ownerAddress,
      contact_address: contactAddress.toLowerCase(),
      contact_name: contactName || null,
      color_index: colorIndex ?? null,
    }, { onConflict: 'owner_address,contact_address' });

  if (error) {
    console.error('[POST /api/contacts] DB error:', error.message);
    return NextResponse.json({ error: 'Failed to save contact' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** DELETE /api/contacts — delete a contact for the authenticated user */
export async function DELETE(req: Request) {
  const ownerAddress = await getAuthenticatedAddress();
  if (!ownerAddress) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { contactAddress } = body;
  if (!contactAddress || typeof contactAddress !== 'string') {
    return NextResponse.json({ error: 'contactAddress is required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('contacts')
    .delete()
    .eq('owner_address', ownerAddress)
    .eq('contact_address', contactAddress.toLowerCase());

  if (error) {
    console.error('[DELETE /api/contacts] DB error:', error.message);
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
