import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { randomUUID } from 'crypto';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('category', 'Launchpad_Token')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch tokens error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tokens: data || [],
    });
  } catch (err: any) {
    console.error('Tokens route error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Failed to fetch tokens' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      symbol,
      description,
      contractAddress,
      ownerWallet,
      logoUrl,
      twitterUrl,
      telegramUrl,
      websiteUrl,
      aboutProject, // Store JSON payload of paired stock metadata & supply
    } = body;

    if (!name || !symbol || !contractAddress || !ownerWallet) {
      return NextResponse.json({ success: false, error: 'Missing required token fields' }, { status: 400 });
    }

    const id = randomUUID();
    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({
        id,
        name: `${symbol.toUpperCase()} - ${name}`,
        description: description || 'Meme token paired with Dinari tokenized stock.',
        category: 'Launchpad_Token',
        logo_url: logoUrl || null,
        contract_address: contractAddress.toLowerCase(),
        owner_wallet: ownerWallet.toLowerCase(),
        twitter_url: twitterUrl || null,
        telegram_url: telegramUrl || null,
        website_url: websiteUrl || null,
        about_project: aboutProject || JSON.stringify({ symbol, name, supply: '1,000,000,000' }),
        status: 'approved',
        is_verified: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Insert token error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      token: data,
    });
  } catch (err: any) {
    console.error('Save token error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Failed to save token' }, { status: 500 });
  }
}
