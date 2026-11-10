---
titulo: Perguntar ao assistente de IA
modulo: inicio
permissoes: [assistant.use]
atualizado: 2026-11-10
---

O assistente responde dúvidas sobre o uso do sistema, com base neste manual, consulta alguns números da empresa e prepara cadastros para você confirmar. Ele indica a tela certa e o artigo que explica o passo a passo.

## Antes de começar

- Você precisa da permissão **Usar** em Assistente de IA.

## Passo a passo

1. No topo da tela, clique no botão do assistente, ao lado da busca.
2. Escreva a pergunta, por exemplo "Como dou baixa numa conta a receber?".
3. Aperte **Enter** para enviar. **Shift+Enter** quebra a linha.
   Para falar em vez de digitar, clique no microfone, fale a pergunta e confira o texto antes de enviar. O microfone aparece no Chrome, no Edge e no Safari.
4. Clique no endereço de um artigo na resposta para abrir o passo a passo.

## O que ele consulta

As consultas só leem os dados. Cada consulta exige a mesma permissão da tela correspondente: quem não vê contas a pagar no sistema também não as vê pelo assistente.

| Pergunte, por exemplo | Precisa ver |
|---|---|
| "Quanto faturei este mês?" ou "Quanto vendi em outubro?" | Visão geral (indicadores) |
| "Quais contas a receber estão vencidas?" | Contas a receber |
| "O que tenho para pagar esta semana?" | Contas a pagar |
| "Quais produtos estão com estoque baixo?" | Produtos e serviços |
| "A cliente Maria tem conta em aberto?" | Clientes (e Contas a receber para os valores) |

Clique no endereço da tela na resposta para abri-la.

## O que ele prepara para você confirmar

O assistente nunca grava sozinho. Ele monta um resumo com os dados e mostra os botões **Confirmar** e **Cancelar**. Só o clique em **Confirmar** grava, e o registro entra na auditoria como feito pelo assistente (ou pelo Telegram). O resumo vale por 10 minutos.

| Peça, por exemplo | Precisa poder |
|---|---|
| "Cadastre a cliente Ana Souza, celular 65 99999-0000" | Criar clientes |
| "Cadastre o fornecedor Distribuidora Sol, CNPJ ..." | Criar fornecedores |
| "Cadastre o produto Bolo de pote, preço R$ 12,50" | Criar produtos |
| "Abra uma oportunidade no CRM: festa da Ana, origem Instagram" | Criar oportunidades |
| "Monte um orçamento para a Ana com 20 bolos de pote" | Criar orçamentos |

O orçamento é criado em rascunho: confira os itens e envie pela tela do orçamento.

## Enviar um documento ou foto

Você pode mandar a foto de um documento, cartão de visita, nota ou lista de produtos, e pedir o cadastro a partir dele.

1. No painel do assistente, clique no clipe, ao lado do campo da pergunta.
2. Escolha uma imagem ou um PDF de até 3 MB.
3. Escreva o que quer, por exemplo "Cadastre este cliente", e envie. Sem texto, o assistente lê o documento e diz o que encontrou.
4. Confira o resumo e clique em **Confirmar**.

O assistente usa só o que está escrito no arquivo. O arquivo não fica guardado no sistema.

## Usar pelo Telegram

O mesmo assistente responde pelo Telegram, com as mesmas permissões que você tem no sistema.

1. No topo da tela, clique no seu nome para abrir **Meu perfil**.
2. Em **Telegram**, clique em **Gerar código**. O código vale por 10 minutos.
3. Clique em **Abrir o Telegram e vincular** e toque em **Iniciar**. Se preferir, mande ao bot `/vincular` seguido do código.
4. Quando o bot confirmar o vínculo, escreva as perguntas direto na conversa.

Para desvincular, mande `/sair` ao bot ou clique em **Desvincular** em **Meu perfil**. O bot só responde em conversa privada, nunca em grupos. Ele entende texto, fotos e documentos (imagem ou PDF de até 3 MB), e os cadastros chegam com os botões **Confirmar** e **Cancelar**. Mensagens de áudio ainda não.

## Dicas e atalhos

- A conversa continua enquanto o painel está aberto. Ao fechar, ela recomeça do zero.
- As respostas são geradas por inteligência artificial. Confira antes de agir.
- O consumo do mês, por dia e por usuário, fica em **Configurações**, no quadro **Assistente de IA**. Quem pode alterar as configurações também muda ali o **Limite mensal (R$)**.
- Para números fora da lista acima, o assistente indica a tela certa do sistema.

## Problemas comuns

- **"Limite mensal do assistente atingido"**: a empresa usou a cota do mês. O assistente volta no início do próximo mês.
- **"O assistente ainda não está disponível"**: o sistema ainda não foi ligado a um serviço de IA.
- **"Código inválido ou vencido"** no Telegram: gere um código novo em **Meu perfil**. Depois de 5 códigos errados, o bot espera 10 minutos antes de aceitar outro.
- **"A ação venceu"**: o resumo vale 10 minutos. Peça ao assistente para preparar de novo.
- **O bot pede para vincular a conta de novo**: a conta foi desvinculada ou o mesmo Telegram foi vinculado a outro usuário.

## Veja também

- [Buscar e usar atalhos](/ajuda/inicio/busca-e-atalhos)
