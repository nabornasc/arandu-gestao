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
  // Ferramentas de consulta que este usuário pode usar. O provedor chama runTool e devolve o resultado ao
  // modelo, até MAX_STEPS rodadas.
  tools?: AiTool[];
  runTool?: (name: string, input: unknown) => Promise<string>;
}

export interface AiTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// Rodadas de ferramenta por pergunta: limita custo e laço.
export const MAX_STEPS = 4;

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
  // Soma de todas as rodadas da pergunta.
  usage: AiUsage;
  // Ferramentas chamadas, na ordem.
  toolCalls: string[];
}

const addUsage = (a: AiUsage, b: AiUsage): AiUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
});
const ZERO: AiUsage = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };

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
    const client = this.client;
    if (!client) throw new Error('ANTHROPIC_API_KEY não configurada.');
    const tools: Anthropic.Tool[] | undefined = request.tools?.length
      ? request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
        }))
      : undefined;
    const messages: Anthropic.MessageParam[] = [...request.messages];
    let usage = ZERO;
    const toolCalls: string[] = [];

    for (let step = 0; ; step++) {
      const response = await client.messages.create({
        model: config.AI_MODEL,
        max_tokens: request.maxTokens,
        // Perguntas de ajuda e consultas simples: pouco raciocínio, resposta curta.
        output_config: { effort: 'low' },
        system: [
          { type: 'text', text: request.stable, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: request.context },
        ],
        // Na última rodada permitida, o modelo não pode chamar ferramenta: responde com o que já tem.
        ...(tools && { tools, ...(step >= MAX_STEPS && { tool_choice: { type: 'none' as const } }) }),
        messages,
      });
      usage = addUsage(usage, {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      });
      const calls = response.content.filter((block) => block.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || !calls.length || !request.runTool) {
        const text = response.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim();
        return { text, stopReason: response.stop_reason, model: response.model, usage, toolCalls };
      }
      const runTool = request.runTool;
      messages.push({ role: 'assistant', content: response.content as Anthropic.ContentBlockParam[] });
      const results = await Promise.all(
        calls.map(async (call): Promise<Anthropic.ToolResultBlockParam> => {
          toolCalls.push(call.name);
          return { type: 'tool_result', tool_use_id: call.id, content: await runTool(call.name, call.input) };
        }),
      );
      messages.push({ role: 'user', content: results });
    }
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
    // "[ferramenta:nome {json}]" simula o modelo pedindo a ferramenta; o resultado entra na resposta.
    const toolCalls: string[] = [];
    let results = '';
    for (const match of question.matchAll(/\[ferramenta:([a-z_]+)( \{.*?\})?\]/g)) {
      const name = match[1] ?? '';
      toolCalls.push(name);
      const output = request.runTool ? await request.runTool(name, JSON.parse(match[2] ?? '{}')) : '';
      results += `\nresultado: ${output}`;
    }
    return {
      text: `Resposta de teste para: ${question.slice(0, 80)}${results}`,
      stopReason: question.includes('[recusar]') ? 'refusal' : 'end_turn',
      model: config.AI_MODEL,
      usage: { inputTokens: 1200, outputTokens: 150, cacheWriteTokens: 0, cacheReadTokens: 11000 },
      toolCalls,
    };
  }
}

let provider: AiProvider | null = null;

export function aiProvider(): AiProvider {
  provider ??=
    config.AI_PROVIDER === 'fake' ? new FakeProvider() : new AnthropicProvider(config.ANTHROPIC_API_KEY);
  return provider;
}
