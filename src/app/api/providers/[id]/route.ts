import { NextRequest, NextResponse } from 'next/server';
import { providerGateway } from '@/services/providerGateway';
import { getIdentityHeader } from '@/lib/identity';

const headers = { 'X-Powered-By': getIdentityHeader() };

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const provider = await providerGateway.getActiveProvider(id);
    const health = provider.getHealth();

    return NextResponse.json(
      {
        success: true,
        data: {
          id,
          name: provider.name,
          type: provider.type,
          model: provider.getModel(),
          health,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider not found';
    return NextResponse.json(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: error instanceof Error && message.includes('not found') ? 404 : 500, headers }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const deleted = await providerGateway.deleteProvider(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Provider not found', timestamp: new Date().toISOString() },
        { status: 404, headers }
      );
    }

    return NextResponse.json(
      { success: true, data: { deleted: true }, timestamp: new Date().toISOString() },
      { status: 200, headers }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete provider',
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers }
    );
  }
}
