# Planejamento dos manuais de uso

Manuais do Arandu Gestão com texto explicativo e mídia curta mostrando a ação: vídeos de poucos segundos e, quando servir melhor, GIFs ou imagens com destaque. Este arquivo define formato, ferramenta, conteúdo e ordem. A ordem geral do trabalho continua em [PLANEJAMENTO_ETAPAS.md](PLANEJAMENTO_ETAPAS.md).

## 1. Objetivo

- Quem nunca usou o sistema consegue fazer cada tarefa comum sozinho, lendo um passo a passo curto e vendo a ação acontecer.
- A ajuda fica dentro do sistema, perto da tela onde a dúvida surge.
- A mídia é gerada por roteiro automatizado: quando a tela muda, regrava-se em minutos em vez de refazer à mão.
- Os mesmos textos servem depois de base para o assistente de IA (etapa 10).

## 2. Onde o manual aparece

- **Central de ajuda em `/ajuda`:** índice por módulo, busca e um artigo por tarefa.
- **Ajuda da tela:** botão "?" no topo de cada tela, que abre o artigo daquela tela num painel lateral, sem fechar o que está aberto.
- **Busca rápida (Ctrl+K):** os títulos dos artigos entram como resultado do tipo "Ajuda", até 5, só os que o usuário tem permissão de usar. O build recusa artigo com permissão que não existe.
- **Fora do sistema:** o README aponta para a central na demonstração.

## 3. Formato de cada artigo

Um arquivo Markdown por tarefa, em `docs/manual/<módulo>/<tarefa>.md`, com cabeçalho:

```yaml
titulo: Criar e enviar um orçamento
modulo: vendas
tela: /orcamentos        # liga o artigo ao botão "?" da tela
permissoes: [quotes.create, quotes.send]
atualizado: 2026-11-08
```

Corpo, sempre na mesma ordem:

1. **Para que serve**, em uma ou duas frases.
2. **Antes de começar:** permissões e cadastros necessários.
3. **Passo a passo:** frases curtas no imperativo, com uma mídia por passo importante.
4. **Dicas e atalhos.**
5. **Problemas comuns:** a mensagem que aparece e o que fazer.
6. **Veja também:** links para artigos vizinhos.

Regras de texto: português simples, sem jargão técnico, nome dos botões igual ao da tela e em negrito, no máximo 20 palavras por frase.

## 4. Mídia: vídeo curto, GIF e imagem

| Tipo | Quando usar | Formato | Limite |
|---|---|---|---|
| Vídeo curto | Ação com várias etapas na tela (ex.: preencher e salvar) | WebM (VP9) e MP4 (H.264) de reserva, sem som, com legenda gravada, em loop | 3 a 30 s, até 400 KB |
| GIF | Ação de um gesto (ex.: abrir menu, atalho) e uso fora do sistema, como o README | GIF com paleta otimizada | até 2 s e 300 KB |
| Imagem | Tela parada com destaque numa área | WebP com moldura e seta | até 120 KB |

- **Vídeo é o padrão.** Um WebM fica de 5 a 10 vezes menor que o GIF equivalente e tem melhor nitidez. O GIF fica só para gestos curtos e lugares que não tocam vídeo.
- No sistema, o vídeo toca sozinho, sem som e em loop, com botão de pausa. Clicar no vídeo (ou em **Ampliar**) abre o vídeo em quase toda a tela, com os controles do navegador e botão de tela cheia. Respeita "reduzir movimento" do sistema: nesse caso aparece parado, com botão para tocar.
- Cada mídia tem texto alternativo descrevendo a ação, para leitores de tela.

## 5. Como a mídia é gerada

Roteiros em Playwright, que o projeto já usa nos testes de ponta a ponta:

- Pasta `manual/roteiros/`, um arquivo por artigo, com os passos e o nome da mídia de cada trecho.
- Sempre com os **dados da demonstração** (conveniência de bebidas fictícia). Nunca dados reais nem telas de outros sistemas.
- Gravação com `recordVideo` do Playwright em 1280×720 e, para celular, em 390×844.
- **Cursor e clique visíveis:** um script injetado desenha o ponteiro, um círculo no clique e a tecla apertada (ex.: "Ctrl+K"), porque a gravação sem tela não mostra o mouse.
- Corte e conversão com `ffmpeg` (já instalado no notebook): marca de início e fim por passo, legenda gravada com o texto de cada passo, WebM e MP4 e, quando pedido, GIF com paleta gerada.
- Comando único: `npm run manual:midia` regrava tudo; `npm run manual:midia -- vendas/orcamento` regrava um artigo.
- O CI roda os roteiros sem gravar, como teste: se a tela mudar e o roteiro quebrar, o manual desatualizado aparece no PR.

## 6. Onde guardar a mídia

Estimativa: cerca de 60 artigos e 150 mídias, de 10 a 25 MB no total.

| Opção | Prós | Contras |
|---|---|---|
| A. No repositório, em `frontend/public/manual/` | Simples, versiona junto com a tela, funciona offline e na Vercel | O Git cresce a cada regravação |
| B. Git LFS | Repositório leve | Mais uma ferramenta nas duas máquinas e na Vercel |
| C. Supabase Storage | Repositório leve, troca a mídia sem novo deploy | Depende de rede e de mais uma configuração |

**Recomendação: A**, com limite por arquivo e regravação só do que mudou. Rever se o total passar de 50 MB.

## 7. Conteúdo, por prioridade

1. **Primeiros passos:** cadastro da empresa, limite anual do MEI, convite de usuários, visão geral, busca e atalhos.
2. **Vendas:** cliente, orçamento (criar, enviar, espelho, aprovar e converter), pedido, cadastro rápido, recebimento.
3. **Financeiro:** contas a receber, contas a pagar, contas bancárias, movimentações.
4. **Cadastros e estoque:** produtos e serviços, ajuste e extrato de estoque, fornecedores, transportadoras.
5. **Gestão:** CRM, agenda, relatórios e CSV, indicadores.
6. **Administração:** grupos de acesso e permissões, configurações e listas da empresa, histórico e auditoria.

## 8. Fases

| Fase | Entrega |
|---|---|
| M1 (feita em 09/11/2026) | Rota `/ajuda`, leitura dos arquivos Markdown, componente de mídia, botão "?" e o roteiro com cursor visível. Artigo piloto: criar e enviar um orçamento |
| M2 (feita em 09/11/2026) | Primeiros passos e Vendas |
| M3 (feita em 09/11/2026) | Financeiro, Cadastros e estoque, e vídeo ampliado ao clicar (quase tela cheia, com botão de tela cheia) |
| M4 (feita em 09/11/2026) | Gestão e Administração, artigos na busca rápida (tipo "Ajuda", só os que o usuário pode usar) |
| M5 (pulada em 09/11/2026) | Revisão com alguém que nunca usou o sistema e ajuste dos textos. Roteiro pronto para quando quiser fazer: https://claude.ai/artifact/AjV3tCmSc3wY3jBPGxkVyd |

Cada fase segue o fluxo de sempre: branch, PR, CI verde e merge.

**Como regravar a mídia:** `npm run manual:midia` (todos) ou `npm run manual:midia -- vendas/criar-e-enviar-orcamento` (um artigo). Precisa do `ffmpeg` no PATH ou na variável `FFMPEG`. Os roteiros ficam em `manual/roteiros/` e rodam no CI como teste, no projeto `manual` do Playwright.

## 9. Decisões (08/11/2026)

1. **Quando entra:** depois da etapa 7 (documentos), com as telas de documento já estáveis.
2. **Onde guardar a mídia:** no repositório, em `frontend/public/manual/` (opção A da seção 6).
3. **Leitura do Markdown:** convertido para HTML no build, sem biblioteca nova no navegador.
4. **Ritmo (09/11/2026):** ações e cliques pela metade da velocidade, com pausa para ler cada passo. Por isso o vídeo vai até 30 s.
5. **Legenda:** o vídeo continua sem som e leva legenda gravada na imagem, com o texto do passo. A legenda sai do próprio roteiro e é aplicada pelo `ffmpeg` na conversão.
