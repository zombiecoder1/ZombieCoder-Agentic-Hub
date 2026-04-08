// ─── Provider Gateway ───────────────────────────────────────────────────────
// Smart provider selection with database configuration, environment fallback,
// and automatic fallback chain. Settings cached with configurable TTL.

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { ProviderFactory } from '@/providers/ProviderFactory';
import type { ILLMProvider, ProviderResponse } from '@/providers/IProvider';
import type { ChatMessage, ProviderConfig, ProviderHealth, StreamChunk } from '@/types';

const logger = createLogger('provider-gateway');

interface CachedProvider {
  provider: ILLMProvider;
  createdAt: number;
}

interface CachedSettings {
  settings: {
    activeProviderId: string | null;
    activeProviderType: string | null;
  };
  createdAt: number;
}

export class ProviderGateway {
  private cache = new Map<string, CachedProvider>();
  private settingsCache: CachedSettings | null = null;
  private readonly settingsCacheTtl: number;
  private readonly providerCacheTtl: number;

  constructor() {
    this.settingsCacheTtl = Number(process.env.PROVIDER_SETTINGS_CACHE_TTL_MS) || 2000;
    this.providerCacheTtl = 300000; // 5 minutes
  }

  // ─── Provider Resolution ─────────────────────────────────────────────────

  /**
   * Get the active provider, resolving through:
   * 1. Specific providerId (if provided)
   * 2. Database active provider setting
   * 3. Environment variables
   * 4. System defaults (Ollama localhost:11434)
   */
  async getActiveProvider(providerId?: string): Promise<ILLMProvider> {
    // If specific provider requested
    if (providerId) {
      return this.getProviderById(providerId);
    }

    // Check database for active provider
    try {
      const dbProvider = await this.getActiveProviderFromDB();
      if (dbProvider) {
        return dbProvider;
      }
    } catch (error) {
      logger.warn('Database provider lookup failed, falling back to env', { error });
    }

    // Check environment variables
    const envProvider = this.getProviderFromEnv();
    if (envProvider) {
      return envProvider;
    }

    // System default: Ollama
    return this.getSystemDefaultProvider();
  }

  // ─── Chat Completions ────────────────────────────────────────────────────

  async chat(
    messages: ChatMessage[],
    options?: {
      providerId?: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<ProviderResponse> {
    const start = Date.now();
    const provider = await this.getActiveProvider(options?.providerId);

    try {
      const response = await provider.chat(messages, {
        systemPrompt: options?.systemPrompt,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });

      const latency = Date.now() - start;
      if (process.env.PROVIDER_LATENCY_DEBUG === 'true') {
        logger.info('Chat completion latency', {
          provider: provider.name,
          model: response.model,
          latencyMs: latency,
          tokenCount: response.tokenCount,
        });
      }

      return response;
    } catch (error) {
      logger.error('Chat completion failed', error as Error, {
        provider: provider.name,
        messageType: messages[messages.length - 1]?.role,
      });
      throw error;
    }
  }

  async chatStream(
    messages: ChatMessage[],
    options: {
      providerId?: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      onChunk: (chunk: StreamChunk) => void;
    }
  ): Promise<StreamChunk> {
    const provider = await this.getActiveProvider(options?.providerId);

    try {
      return await provider.chatStream(messages, {
        systemPrompt: options?.systemPrompt,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        onChunk: options.onChunk,
      });
    } catch (error) {
      logger.error('Chat stream failed', error as Error, {
        provider: provider.name,
      });
      throw error;
    }
  }

  // ─── Provider Management ─────────────────────────────────────────────────

  async listProviders(): Promise<Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    model: string | null;
    endpoint: string | null;
    isDefault: boolean;
    health: ProviderHealth | null;
  }>> {
    const providers = await db.aiProvider.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return providers.map((p) => {
      const cached = this.cache.get(p.id);
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        status: p.status,
        model: p.model,
        endpoint: p.endpoint,
        isDefault: p.isDefault,
        health: cached ? cached.provider.getHealth() : null,
      };
    });
  }

  async createProvider(config: ProviderConfig): Promise<ILLMProvider> {
    const providerConfig = JSON.stringify(config);
    const provider = await db.aiProvider.create({
      data: {
        name: config.name,
        type: config.type,
        endpoint: config.endpoint || null,
        model: config.model || null,
        apiKeyEnvVar: config.apiKeyEnvVar || null,
        config: providerConfig,
        status: 'inactive',
      },
    });

    logger.info('Provider created', { id: provider.id, name: provider.name, type: provider.type });
    return this.buildProviderInstance(provider);
  }

  async testProvider(providerId: string): Promise<ProviderHealth> {
    const provider = await this.getProviderById(providerId);
    const health = await provider.testConnection();

    // Update database
    await db.aiProvider.update({
      where: { id: providerId },
      data: {
        status: health.status,
        latencyMs: health.latencyMs,
        lastHealthCheck: new Date(),
        errorCount: health.status === 'error' ? (await db.aiProvider.findUnique({ where: { id: providerId } }))!.errorCount + 1 : 0,
        lastError: health.lastError,
      },
    });

    return health;
  }

  async deleteProvider(providerId: string): Promise<boolean> {
    try {
      // Remove from cache
      const cached = this.cache.get(providerId);
      if (cached) {
        cached.provider.dispose();
        this.cache.delete(providerId);
      }

      await db.aiProvider.delete({ where: { id: providerId } });
      logger.info('Provider deleted', { providerId });
      return true;
    } catch {
      return false;
    }
  }

  async setActiveProvider(providerId: string): Promise<void> {
    // First, unset all defaults
    await db.aiProvider.updateMany({ where: { isDefault: true }, data: { isDefault: false } });

    // Set the new default
    await db.aiProvider.update({
      where: { id: providerId },
      data: { isDefault: true },
    });

    // Invalidate settings cache
    this.settingsCache = null;

    logger.info('Active provider changed', { providerId });
  }

  // ─── Internal Methods ────────────────────────────────────────────────────

  private async getActiveProviderFromDB(): Promise<ILLMProvider | null> {
    // Check cache
    if (this.settingsCache && Date.now() - this.settingsCache.createdAt < this.settingsCacheTtl) {
      if (this.settingsCache.settings.activeProviderId) {
        return this.getProviderById(this.settingsCache.settings.activeProviderId);
      }
      return null;
    }

    // Query database
    const activeProvider = await db.aiProvider.findFirst({
      where: { isDefault: true, status: 'active' },
    });

    // Update cache
    this.settingsCache = {
      settings: {
        activeProviderId: activeProvider?.id || null,
        activeProviderType: activeProvider?.type || null,
      },
      createdAt: Date.now(),
    };

    if (activeProvider) {
      return this.buildProviderInstance(activeProvider);
    }

    return null;
  }

  private async getProviderById(providerId: string): Promise<ILLMProvider> {
    // Check cache
    const cached = this.cache.get(providerId);
    if (cached && Date.now() - cached.createdAt < this.providerCacheTtl) {
      return cached.provider;
    }

    // Load from database
    const provider = await db.aiProvider.findUnique({ where: { id: providerId } });
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    return this.buildProviderInstance(provider);
  }

  private buildProviderInstance(dbProvider: {
    id: string;
    name: string;
    type: string;
    endpoint: string | null;
    model: string | null;
    apiKeyEnvVar: string | null;
    config: string;
  }): ILLMProvider {
    const config = JSON.parse(dbProvider.config) as Record<string, unknown>;
    const providerConfig: ProviderConfig = {
      name: dbProvider.name,
      type: dbProvider.type as ProviderConfig['type'],
      endpoint: dbProvider.endpoint || undefined,
      model: dbProvider.model || undefined,
      apiKeyEnvVar: dbProvider.apiKeyEnvVar || undefined,
      temperature: config.temperature as number | undefined,
      maxTokens: config.maxTokens as number | undefined,
      maxConnections: config.maxConnections as number | undefined,
      timeoutMs: config.timeoutMs as number | undefined,
    };

    const instance = ProviderFactory.create(dbProvider.type as 'ollama' | 'openai' | 'gemini' | 'llamacpp', providerConfig);

    // Cache it
    this.cache.set(dbProvider.id, {
      provider: instance,
      createdAt: Date.now(),
    });

    return instance;
  }

  private getProviderFromEnv(): ILLMProvider | null {
    // Check for Ollama
    const ollamaUrl = process.env.OLLAMA_BASE_URL;
    if (ollamaUrl) {
      logger.debug('Using Ollama from environment', { endpoint: ollamaUrl });
      return ProviderFactory.create('ollama', {
        name: 'Ollama (env)',
        type: 'ollama',
        endpoint: ollamaUrl,
        model: process.env.OLLAMA_DEFAULT_MODEL || 'llama3.1:latest',
      });
    }

    return null;
  }

  private getSystemDefaultProvider(): ILLMProvider {
    logger.info('Using system default provider (Ollama localhost)');
    return ProviderFactory.create('ollama', {
      name: 'Ollama (default)',
      type: 'ollama',
      endpoint: 'http://localhost:11434',
      model: 'llama3.1:latest',
    });
  }

  /** Dispose all cached providers */
  dispose(): void {
    for (const cached of this.cache.values()) {
      cached.provider.dispose();
    }
    this.cache.clear();
    this.settingsCache = null;
    logger.info('Provider gateway disposed');
  }
}

// Singleton
export const providerGateway = new ProviderGateway();
