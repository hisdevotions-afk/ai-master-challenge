# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Vendedores e o sales manager que precisam decidir, numa segunda de manhã, onde focar a semana num pipeline de vendas B2B. Com um vendedor selecionado no filtro, a tela se dirige a ele diretamente ("Bom dia, Hayden."); sem filtro, a um manager ou à Head de RevOps olhando a operação inteira.

## Product Purpose

**Pipeline em Foco** é um app de vendas que traduz um motor de scoring (Python, sem LLM em runtime) em quatro filas de ação priorizadas — Fechar, Decidir, Avançar, Prospectar — com o porquê de cada prioridade em português claro. Existe para substituir o ranking arbitrário de forecast por um baseado no único sinal que passou em teste estatístico contra o acaso nesta base: a idade do deal.

## Positioning

Cada score e cada fila vêm de testes de significância reais sobre os dados (vendedor, conta, produto, setor, região e manager foram testados e descartados; só a idade do deal muda a chance de ganhar). Um concorrente não pode copiar a interface sem copiar a disciplina estatística por trás — inclusive o "Time" que recusa ranquear vendedores porque a diferença é ruído (p = 0,30).

## Operating Context

- Dado é um retrato estático (`data.json` gerado do motor Python a partir de CSVs); não há CRM ao vivo.
- Decisões do vendedor ("requalifiquei", "encerrar como perdido") persistem só em `localStorage` do navegador, não voltam para um CRM.
- Filtros de Região → Manager → Vendedor presentes em todas as telas, com escopo em cascata.
- Roteamento é hash-based, client-side, sem backend.

## Capabilities and Constraints

- Sete telas: Meu dia, Pipeline (lista + quadro kanban), Ficha do deal, Forecast honesto, Contas, Time, Como o score funciona.
- Motor de scoring: `score = percentil de (preço × P(ganhar em 30 dias | idade))` entre deals vivos; zumbis (parados além do maior ciclo já fechado) valem 0.
- Prospecção fica fora do forecast esperado por falta de histórico de conversão para "Engaging".
- Stack: React 19 + TypeScript + Vite, sem dependências de UI de terceiros — todo o visual é CSS autoral.
- Sem atividade de CRM (e-mails, reuniões) nos dados: idade é o melhor sinal disponível, não o ideal.

## Brand Commitments

Identidade visual pinada pelo usuário à marca **G4** (G4 Educação / g4.business), extraída ao vivo do perfil no Instagram: campo navy profundo como estrutura primária, ouro de assinatura reservado a dados de dinheiro e ações primárias, superfícies em marfim/creme, bordô como acento secundário, serifada editorial para títulos (Libre Caslon Text) sobre sans limpa para dados (Manrope), marca com estrela-bússola. Registro completo da direção em `.impeccable/surfaces/`.

## Evidence on Hand

- Dados sintéticos de demonstração (empresas fictícias), retrato de referência em 31/12/2017 — não são clientes reais e não devem ser tratados como tal em nenhuma cópia futura.
- `solution/data/*.csv`: pipeline de vendas, contas, times, produtos.
- `solution/engine/scoring.py` + `test_scoring.py`: motor determinístico e sua suíte de testes.
- Screenshots de verificação em `process-log/screenshots/` (versão anterior ao redesign G4).

## Product Principles

1. Nenhuma feature entra no score sem passar em teste de significância contra o acaso — a interface nunca implica causalidade que os dados não sustentam.
2. Zumbi é decisão, não alarme eterno: um deal sem histórico comparável sai do forecast até ser requalificado ou encerrado, nunca fica perseguindo o vendedor.
3. Nunca ranquear pessoas por ruído estatístico: diferenças sem significância aparecem como higiene de pipeline, não como desempenho.
4. Cor é fila de ação, não decoração: a paleta comunica em que fila cada deal está, em toda tela onde ele aparece.
