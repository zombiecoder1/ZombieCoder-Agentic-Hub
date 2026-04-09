import { NextRequest, NextResponse } from 'next/server';
import { providerGateway } from '@/services/providerGateway';
import { memoryService } from '@/services/memoryService';
import { validateInput } from '@/lib/ethics';
import { buildAgentSystemPrompt } from '@/services/promptEngine';
import { createLogger } from '@/lib/logger';
import { getIdentityHeader } from '@/lib/identity';
import type { ChatRequest, ChatResponse, ChatMessage } from '@/types';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('chat-api');
const headers = { 'X-Powered-By': getIdentityHeader() };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ChatRequest;

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'messages array is required and must not be empty', timestamp: new Date().toISOString() },
        { status: 400, headers }
      );
    }

    const lastUserMessage = [...body.messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      const ethicsResult = validateInput(lastUserMessage.content);
      if (!ethicsResult.safe) {
        return NextResponse.json(
          {
            success: false,
            error: 'Content blocked by ethical guidelines',
            ethicsResult: {
              category: ethicsResult.category,
              reason: ethicsResult.reason,
            },
            timestamp: new Date().toISOString(),
          },
          { status: 403, headers }
        );
      }
    }

    // Build system prompt
    let systemPrompt: string | undefined;
    if (body.agentId) {
      try {
        const { db } = await import('@/lib/db');
        const agent = await db.agent.findUnique({
          where: { id: body.agentId },
          include: { provider: true },
        });
        if (agent) {
          const agentConfig = {
            name: agent.name,
            type: agent.type as 'chatbot' | 'assistant' | 'coder' | 'researcher' | 'custom',
            status: agent.status as 'active' | 'inactive' | 'maintenance',
            personaName: agent.personaName || undefined,
            systemPrompt: agent.systemPrompt || undefined,
            description: agent.description || undefined,
            config: typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config,
            providerId: agent.providerId || undefined,
          };
          systemPrompt = buildAgentSystemPrompt(agentConfig);
        }
      } catch (err) {
        logger.warn('Failed to load agent config, using default system prompt', { error: err });
      }
    }

    // Send to provider gateway
    const messages: ChatMessage[] = body.messages;
    const response = await providerGateway.chat(messages, {
      providerId: body.providerId,
      systemPrompt,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    });

    const chatResponse: ChatResponse = {
      id: uuidv4(),
      content: response.content,
      model: response.model,
      provider: response.provider,
      tokenCount: response.tokenCount,
      latencyMs: response.latencyMs,
      finishReason: response.finishReason,
    };

    return NextResponse.json(
      { success: true, data: chatResponse, timestamp: new Date().toISOString() },
      { status: 200, headers }
    );
  } catch (error) {
    logger.error('Chat API error', error as Error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Chat request failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers }
    );
  }
}
