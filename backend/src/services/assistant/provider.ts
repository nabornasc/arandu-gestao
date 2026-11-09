import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.ts';

// Interface do modelo de IA: o resto do assistente não sabe qual provedor responde.
// Trocar de provedor (ou incluir outro, como um roteador) é escrever outra implementação desta.
export interface AiRequest {
  // Instruções fixas (manual incluído): vão em cache.
  stable: string;
  // Contexto que muda por empresa ou usuário: depois do cache.
  context: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export interface AiResponse {
  text: string;
  // 'refusal' e 'max_tokens' pedem tratamento; o resto é resposta completa.
  stopReason: string | null;
  model: string;
  usage: AiUsage;
}

export interface AiProvider {
  readonly available: boolean;
  complete(request: AiRequest): Promise<AiResponse>;
}

class AnthropicProvider implements AiProvider {
  private client: Anthropic | null;

  constructor(apiKey: string | undefined) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  get available() {
    return this.client !== null;
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    if (!this.client) throw new Error('ANTHROPIC_API_KEY não configurada.');
    const response = await this.client.messages.create({
      model: config.AI_MODEL,
      max_tokens: request.maxTokens,
      // Perguntas de ajuda e consultas simples: pouco raciocínio, resposta curta.
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: request.stable, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: request.context },
      ],
      messages: request.messages,
    });
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
    return {
      text,
      stopReason: response.stop_reason,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}

// Provedor dos testes: responde sem rede e guarda os pedidos para conferência.
export class FakeProvider implements AiProvider {
  readonly available = true;
  readonly requests: AiRequest[] = [];

  async complete(request: AiRequest): Promise<AiResponse> {
    this.requests.push(request);
    const question = request.messages.at(-1)?.content ?? '';
    if (question.includes('[falhar]')) throw new Error('Falha simulada do provedor.');
    return {
      text: `Resposta de teste para: ${question.slice(0, 80)}`,
      stopReason: question.includes('[recusar]') ? 'refusal' : 'end_turn',
      model: config.AI_MODEL,
      usage: { inputTokens: 1200, outputTokens: 150, cacheWriteTokens: 0, cacheReadTokens: 11000 },
    };
  }
}

let provider: AiProvider | null = null;

export function aiProvider(): AiProvider {
  provider ??=
    config.AI_PROVIDER === 'fake' ? new FakeProvider() : new AnthropicProvider(config.ANTHROPIC_API_KEY);
  return provider;
}
