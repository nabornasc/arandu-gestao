# Planejamento: assistente de IA (etapa 10)

Assistente dentro do sistema e no Telegram, com consumo controlado por empresa. Este arquivo substitui a seção 10 do [PLANEJAMENTO_V2.md](PLANEJAMENTO_V2.md). A ordem geral continua em [PLANEJAMENTO_ETAPAS.md](PLANEJAMENTO_ETAPAS.md).

## 1. Decisões (09/11/2026)

| Tema | Decisão |
|---|---|
| Provedor | API da Anthropic direto, pelo SDK oficial `@anthropic-ai/sdk`, atrás de uma interface `AiProvider` no backend. OpenRouter fica de fora; pode entrar depois como outra implementação da interface. |
| Modelo | `claude-haiku-5-5` (US$ 0,10 por milhão de tokens de entrada e US$ 0,50 de saída). Trocar de modelo é mudar uma variável de ambiente. |
| Unidade da cota | Reais. O custo de cada chamada é calculado em dólar pelos tokens da resposta e convertido pela cotação em `AI_USD_BRL`. |
| Cota inicial | R$ 200 por empresa por mês, ajustável por empresa. Há também um teto mensal da plataforma inteira (`AI_PLATFORM_MONTHLY_BRL`), que protege a conta da Anthropic. |
| Base de conhecimento | O manual inteiro (`docs/manual`, 27 artigos, cerca de 11 mil tokens) vai nas instruções, com cache de prompt. Sem RAG nesta etapa. |
| Dados do negócio | Por ferramentas (tool use) com consultas fixas do backend, sempre com o `ctx` do usuário. A IA nunca recebe SQL nem o id da empresa. |
| Canais | Chat dentro do sistema e Telegram. WhatsApp e Instagram ficam fora. |

## 2. Arquitetura

```
canal (chat web | Telegram) → núcleo do assistente → AiProvider (Anthropic)
                                   │
                                   ├─ cota da empresa (antes de chamar)
                                   ├─ ferramentas de consulta (ctx do usuário)
                                   └─ ai_usage (depois de cada resposta)
```

- **Núcleo** (`backend/src/services/assistant/`): monta o pedido, roda o laço de ferramentas e devolve texto e ações pendentes. Não sabe de qual canal veio a mensagem.
- **Adaptadores de canal:** rota `POST /assistant/messages` para o chat web; webhook do Telegram com grammY. Cada adaptador só traduz entrada e saída.
- **Laço manual de ferramentas** (`while stop_reason === "tool_use"`), para a confirmação humana poder chegar em outra mensagem, inclusive no Telegram.

## 3. Pedido ao modelo

- **Instruções (fixas, em cache):** papel do assistente, regras (responder só com base no manual e nas ferramentas, dizer quando não sabe, português simples) e o manual inteiro. Ficam antes de tudo e nunca mudam entre pedidos, para o cache valer.
- **Contexto da empresa (depois do cache):** nome, ramo, módulos que o usuário pode ver e listas da empresa. Só o necessário, sem dado pessoal de clientes.
- **Histórico:** as últimas 10 mensagens da conversa.
- **Parâmetros:** `max_tokens` de 1.024 no chat, `output_config.effort: "low"` e conferência de `stop_reason` (`refusal`, `max_tokens`) antes de usar a resposta.
- **Conferência do cache:** `usage.cache_read_input_tokens` deve vir acima de zero a partir do segundo pedido. Se vier zero, algo nas instruções está mudando.

## 4. Controle de consumo

**Tabela `ai_usage`:** empresa, usuário, canal, modelo, tokens de entrada, de saída, gravados no cache e lidos do cache, custo em dólar, custo em reais e data. Uma linha por chamada ao modelo.

**Tabela `ai_quotas`** (ou colunas na empresa): cota mensal em reais, padrão R$ 200.

**Regras:**

1. Antes de chamar o modelo: soma do mês da empresa. Se passou da cota, responde "Limite mensal do assistente atingido" sem chamar a IA.
2. Ao passar de 80%, avisa uma vez no chat e na visão geral de quem gerencia a empresa.
3. Teto da plataforma: se a soma de todas as empresas passar de `AI_PLATFORM_MONTHLY_BRL`, o assistente fica em pausa para todos.
4. Limite de 20 mensagens por minuto por usuário, contra abuso e laço acidental.
5. Tela em Configurações: consumo do mês, cota e gráfico por dia. Permissão nova `assistant.use` para conversar e `settings.update` para mudar a cota.
6. Conferência mensal da soma da `ai_usage` com o relatório de custo da Anthropic.

**Ordem de grandeza** (pergunta com 14 mil tokens de entrada, 11 mil deles em cache, e 300 de saída, no Haiku 5.5): menos de US$ 0,001 por pergunta. R$ 200 cobrem dezenas de milhares de perguntas; a cota serve mais de trava contra abuso do que de limite de uso normal.

## 5. Ferramentas

Só leitura na primeira entrega. Cada uma chama um serviço que já existe e passa pela mesma permissão da tela equivalente.

| Ferramenta | Serviço | Permissão |
|---|---|---|
| `faturamento_do_periodo` | indicadores da visão geral | `analytics.read` |
| `contas_a_receber_vencidas` | contas a receber | `receivables.read` |
| `contas_a_pagar_da_semana` | contas a pagar | `payables.read` |
| `estoque_baixo` | produtos | `products.read` |
| `buscar_cliente` | busca rápida | `customers.read` |

Ferramentas sem a permissão do usuário nem são enviadas ao modelo.

**Ações que gravam (entrega final):** `cadastrar_cliente` e `criar_rascunho_orcamento`. A ferramenta não grava: devolve um resumo e cria uma ação pendente, válida por 10 minutos. Só o clique em **Confirmar** (no chat ou nos botões do Telegram) executa o serviço, sem passar pela IA, e registra a auditoria com o canal.

## 6. Telegram

- **Biblioteca:** grammY. Em desenvolvimento, *long polling*; em produção, webhook na Vercel que só aceita o cabeçalho `X-Telegram-Bot-Api-Secret-Token` correto.
- **Vincular a conta:** na janela "Meu perfil" (clique no nome, no alto da tela), o usuário gera um código de 6 dígitos válido por 10 minutos. O botão **Abrir o Telegram e vincular** abre `t.me/<bot>?start=<código>` e vincula com um toque; também vale mandar `/vincular 123456`. Isso grava `users.telegram_chat_id`; o código fica só como hash. Chat não vinculado recebe só a instrução de vínculo. Depois de 5 códigos errados, a conversa espera 10 minutos.
- **Conversa:** só em chat privado. As últimas 10 mensagens das 2 horas anteriores ficam em `telegram_messages`, para o assistente lembrar do contexto; o resto é apagado. Limite de 20 perguntas por minuto por usuário.
- **Desvincular:** em "Meu perfil" ou com `/sair` no bot.
- **Segredos:** `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` só na Vercel e no `backend/.env`, nunca no repositório.
- **Testes:** o webhook recebe *updates* simulados nos testes; nenhum teste fala com o Telegram de verdade.
- **Comandos:** `npm run telegram -w backend -- polling` (desenvolvimento), `-- webhook https://<endereço>` (cadastra o webhook com o segredo e os comandos do bot) e `-- info` (webhook atual e último erro).

## 7. Segurança e LGPD

- O `ctx` do assistente é o do usuário: o vendedor só consulta o que já vê no sistema.
- Texto do usuário é dado, nunca instrução privilegiada. Toda gravação exige o clique de confirmação.
- Aviso no chat e no `/start` do bot de que as mensagens são processadas por IA.
- Ao modelo vão só os campos necessários; CPF, CNPJ, e-mail e telefone de clientes ficam de fora das respostas das ferramentas, a não ser que a pergunta peça.
- A `ANTHROPIC_API_KEY` só no backend.

## 8. Fases

| Fase | Entrega |
|---|---|
| 10a (feita em 09/11/2026) | Núcleo, `AiProvider` com Haiku 5.5, `ai_usage`, cota em reais e chat de ajuda dentro do sistema, com o manual em cache |
| 10b (feita em 09/11/2026) | Ferramentas de consulta (seção 5), com até 4 rodadas de ferramenta por pergunta |
| 10c (feita em 09/11/2026) | Tela de consumo e cota em Configurações: por dia e por usuário; a empresa escolhe o limite até `AI_COMPANY_MAX_QUOTA_BRL` |
| 10d (feita em 09/11/2026) | Bot do Telegram com vínculo de conta, usando o mesmo núcleo |
| 10e | Ações que gravam, com confirmação no chat e no Telegram |

Cada fase segue o fluxo de sempre: branch, PR, CI verde e merge.

## 9. O que depende do dono do projeto

- Criar a chave da API na Anthropic e cadastrar `ANTHROPIC_API_KEY` na Vercel e no `backend/.env` (fase 10a).
- Definir `AI_USD_BRL` e `AI_PLATFORM_MONTHLY_BRL` na Vercel (fase 10a).
- Criar o bot no @BotFather e cadastrar `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` na Vercel e no `backend/.env`; depois, rodar o comando `webhook` uma vez com o endereço de produção (fase 10d).

## 10. Fora desta etapa

- **WhatsApp e Instagram:** decididos fora em 09/11/2026. A arquitetura por adaptadores permite incluir depois.
- **RAG:** só quando houver texto demais para as instruções (centenas de milhares de tokens) ou documentos próprios de cada empresa. Primeiro a busca textual do Postgres, depois `pgvector`.
- **Memória por empresa** (fatos que o cliente pede para guardar): avaliar depois da 10e.
