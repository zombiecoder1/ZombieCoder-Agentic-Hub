import { NextRequest, NextResponse } from 'next/server';
import { memoryService } from '@/services/memoryService';
import type { ApiResponse } from '@/types';

const POWERED_BY = 'ZombieCoder-by-SahonSrabon';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const limit = searchParams.get('limit');
    const topic = searchParams.get('topic') ?? undefined;

    if (!agentId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Missing required query parameter: agentId', timestamp: new Date().toISOString() },
        { status: 400, headers: { 'X-Powered-By': POWERED_BY } },
      );
    }

    const { memories, total } = await memoryService.getAgentMemories(agentId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      topic,
    });

    return NextResponse.json<ApiResponse>(
      { success: true, data: { memories, total }, timestamp: new Date().toISOString() },
      { status: 200, headers: { 'X-Powered-By': POWERED_BY } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse>(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500, headers: { 'X-Powered-By': POWERED_BY } },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, content, topic, priority, importance, metadata } = body;

    if (!agentId || !content) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Missing required fields: agentId, content', timestamp: new Date().toISOString() },
        { status: 400, headers: { 'X-Powered-By': POWERED_BY } },
      );
    }

    const memory = await memoryService.addAgentMemory(agentId, {
      content,
      topic,
      priority,
      importance,
      metadata,
    });

    return NextResponse.json<ApiResponse>(
      { success: true, data: memory, timestamp: new Date().toISOString() },
      { status: 201, headers: { 'X-Powered-By': POWERED_BY } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json<ApiResponse>(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500, headers: { 'X-Powered-By': POWERED_BY } },
    );
  }
}
