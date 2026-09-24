# Process log — Challenge 003 Lead Scorer

Registro cronológico. Ferramenta principal: **Claude Code (Claude Opus 5.5)** no terminal, com acesso ao repo e aos meus projetos locais.
Convenção: **[EU]** = decisão/correção minha · **[IA]** = o que a IA propôs/fez · **[DADO]** = o que os dados mostraram.

---

## 1. Escolha do desafio

- [IA] Leu os READMEs dos 4 challenges + guia de submissão + CONTRIBUTING + template.
- [EU] Pedi para a IA varrer **todos os meus projetos locais** atrás de algo reaproveitável, com a instrução de não perder tempo se não houvesse.
- [IA] Encontrou no meu CRM de produção (Fadelito, rede de escolas) heurísticas de pipeline que eu já opero:
  limite de "tempo parado" por estágio, estado "morto" (lead esfriou de vez → arquivar em vez de alertar pra sempre),
  comparação com pares usando taxa agregada + amostra mínima, e fila de ações ordenada por **valor esperado**.
  Recomendou **não** portar código (domínio diferente, código de cliente em repo público) — só o raciocínio.
- [EU] Escolhi o 003. Motivo: é o problema que eu já resolvo no dia a dia (deal esfriando sem ninguém ver), e é o único challenge onde software rodando é obrigatório.
- [EU] Mandei a IA salvar o brief (estrutura, requisitos, critérios, dicas) na memória persistente dela como **referência primária** para toda decisão.

## 2. Exploração dos dados (antes de qualquer feature)

Regra que impus: **olhar os dados antes de decidir o score** (o próprio brief pede isso).

### Qualidade dos dados — achados
| Problema | Impacto | Tratamento |
|---|---|---|
| `GTXPro` no pipeline vs `GTX Pro` no catálogo | 1.480 deals perdem preço/série no join | normalizar nome |
| `technolgy` (typo) em setor | setor duplicado em qualquer agrupamento | normalizar |
| 68% dos Engaging e 67% dos Prospecting **sem conta** | não dá pra usar dado de conta nesses deals | virar tarefa de higiene na UI, não esconder |
| 5 vendedores sem nenhum deal | aparecem vazios nos filtros | ok, mostrar |
| Dados terminam em 2017-12-31 | "hoje" precisa ser fixado | data de referência = 2017-12-31 (configurável) |

### O achado central: as features "óbvias" são ruído
Testei cada feature categórica contra simulação de acaso puro (2.000 sorteios binomiais com a taxa global de 63,2%):

| Feature | Win rate (min–max) | p vs. acaso |
|---|---|---|
| Vendedor | 55%–70% | 0,29 |
| Conta | 53%–75% | 0,96 |
| Produto | 60%–65% | 0,49 |
| Setor / região / manager | ~61%–66% | 0,79–0,99 |
| Vendedor × série / × produto | — | 0,21–0,24 |
| **Idade do deal (≤15d vs >15d)** | **56% vs 68%** | **<0,001** |
| **Mês de fim de trimestre** | **~80% vs ~52%** | **<0,001** |

- [DADO] Só o **tempo** carrega sinal. Deals que sobrevivem ganham mais (P(ganho | idade>90d) = 71%, >120d = 76%).
- [DADO] Fechamento é bimodal: ou morre rápido (≤15d), ou fecha entre 60–138d. Com 90–138d, **86% fecham nos 30 dias seguintes**.
- [DADO] **Nenhum deal na história fechou depois de 138 dias.** Com referência 2017-12-31, **1.291 dos 1.589 Engaging (81%) já passaram disso** — US$ 3,2 mi dos US$ 5,0 mi do pipeline (preço de lista). Pipeline inflado de zumbis.
- [DADO] `close_value` ≈ preço de lista (razão média 0,996) → preço do produto é proxy honesto do valor de um deal aberto.

### Onde a IA errou (até aqui)
- **[IA] errou:** na primeira resposta, antes de ver os dados, a IA sugeriu como diferencial frases como *"esse vendedor fecha 40% menos que os pares nessa série de produto"*. O teste de significância mostrou que diferenças vendedor×série são indistinguíveis de ruído (p≈0,22). Se eu tivesse aceitado, a ferramenta ranquearia deals — e exporia vendedores — com base em acaso. **Correção:** nenhuma feature entra no score sem passar no teste contra acaso; a UI mostra essas features como contexto e explica por que não pesam.
- É exatamente o que um baseline "cola o brief" faz: pesa setor/vendedor/produto porque *parecem* relevantes.

## 3. Desenho

- [IA] Propôs uma tela única "segunda de manhã" com 3 filas (fechar agora / decidir zumbis / nutrir).
- **[EU] corrigi o escopo:** a tela matinal é **uma feature**, não o produto. Pedi o mesmo que fiz no meu CRM: **pegar o melhor do Salesforce e refinar** — um app de vendas de verdade, com a priorização no centro.
- [IA] Mapeou 7 features Salesforce → versão refinada (Meu Dia, Pipeline, Ficha do deal com "top factors" só estatisticamente válidos, Forecast honesto, Conta 360, Time com intervalo de confiança, "Como o score funciona").
- [IA] Propôs Python + SPA estática. **[EU] questionei se não ficaria simples demais.** Resultado: motor Python testado → React+TypeScript (Vite) → GitHub Pages. Sem backend por decisão (dados são snapshot, score é batch — como o próprio Einstein), sem LLM em runtime (explicações determinísticas: zero alucinação no que o vendedor lê, zero chave de API pro avaliador).

## 4. Motor de scoring (`solution/engine/`)

- Decisão de métrica: **score = percentil da receita esperada nos próximos 30 dias** = preço × P(ganhar em até 30 dias | idade). Junta valor, chance e momento numa grandeza econômica explicável ("score 85 = entre os 15% com mais receita esperada no mês"). Zumbis vão a 0; deals jovens caem porque historicamente ainda não fecham.
- 4 filas derivadas dos dados, não de limites chutados: **fechar** (idade ≥ 58d, onde ≥50% fecham em 30d — calculado), **decidir** (idade ≥ 138d, maior ciclo já visto), **avançar** (jovem), **prospectar**.
- Resultado com ref. 2017-12-31: de 2.089 deals abertos, só **236 estão na janela de fechamento**; 1.301 são zumbis (US$ 3,23 mi dos US$ 4,97 mi em preço de lista).
- Só biblioteca padrão do Python (zero dependência). 9 testes.

### Onde a IA errou e foi corrigida nesta etapa
1. **Bug de mutação** — a IA serializou datas para texto no mesmo objeto antes do teste de significância usá-las. O teste ponta-a-ponta pegou (`TypeError`). Corrigido serializando só no final.
2. **Número frouxo da exploração** — a EDA contou zumbis como idade > 138 (1.291). O motor usa ≥ 138 (1.301): um deal ainda aberto aos 138 dias só fecharia com mais de 138, o que nunca aconteceu. O teste foi atualizado com o número correto e a justificativa.
3. **Comparações múltiplas (o mais importante)** — a primeira versão rotulou 2 vendedores como "acima/abaixo da média" com IC de 95%. Revisando a saída: comparando 35 pessoas a 95%, 1–2 falsos positivos são esperados por acaso, e o teste global de vendedor já dava p≈0,3. Rotular essas pessoas seria o ranking injusto que prometemos evitar. **Correção:** intervalo com correção de Bonferroni; teste garante que nenhum vendedor recebe rótulo enquanto o teste global não mostrar sinal.

## 5. Frontend (`solution/app/`)

- [IA] Carregou a skill de design e fez um plano antes de codar: o único sinal real é o **tempo**, então o elemento visual que se repete no app todo é a **régua de idade** (cedo · janela · além do histórico). Cor = fila de ação; zumbi em lilás apagado ("adormecido"), não vermelho de alarme. Evitou de propósito os clichês de página gerada por IA (fundo creme + terracota, eyebrow em caixa alta, "01/02/03").
- React + TypeScript (Vite), zero dependência além de React. Rotas em hash (funcionam no GitHub Pages sem config). Decisões do vendedor em `localStorage`.
- 7 telas: Meu dia · Pipeline (lista ordenável + quadro) · Ficha do deal · Forecast honesto · Contas/Conta 360 · Time · Como o score funciona. Filtros região → manager → vendedor em todas.

### Verificação visual (screenshots em `process-log/screenshots/`)
A extensão do Chrome travou na captura 3 vezes; em vez de insistir, a IA trocou para Chrome headless por linha de comando — que também gerou as imagens deste log.

### O que a revisão das telas pegou (e foi corrigido)
1. **Score comprimido (bug de lógica, não de visual).** Top 6 todos com 100. Causa: os 1.301 zumbis empatados em 0 ocupavam 62% do ranking, então todo deal vivo caía entre 62 e 100. Correção: percentil só entre deals vivos; teste novo garante que a escala usa 0–100.
2. **Forecast inflado pela prospecção.** A primeira versão contava deals em Prospecting a 63% de chance — taxa que vem de deals que *já engajaram*. Não há dado de quantos prospects engajam. Correção: prospecção sai do "esperado" e aparece separada. O esperado caiu de US$ 1,2 mi para US$ 472 mil — a diferença era número inventado.
3. **Achado novo, só visível no forecast por região:** os 500 deals em prospecção são **todos da Central**, e **todos os 408 Engaging da Central já passaram de 138 dias**. A Central não tem nenhum deal vivo em negociação — topo parado, meio morto. O app agora mostra um alerta quando um grupo está nessa situação, e o "Meu dia" muda a mensagem: a semana não é de fechar, é de destravar o funil.
4. Curva despencava no fim (ruído com n < 30 deals) → não desenha abaixo de 30.
5. Régua quase invisível no modo escuro; colunas numéricas alinhadas à esquerda (conflito de especificidade CSS); "1 que você já decidiu ficam" (concordância + contagem ignorando o filtro); "0 deals… Comece por eles"; p-valor com ponto em vez de vírgula.

### Teste funcional no navegador real
Decisão "Encerrar" persiste e tira o zumbi da fila · filtro Região=West + Vendedor=Hayden vira "Bom dia, Hayden." com 5 deals na janela · busca e contagem de decididos respeitam o recorte.

## 6. Documentação e verificação final

- README da submissão no template do desafio: Setup, Lógica, Limitações, Recomendações e Process Log resumido.
- **Cada número do README foi conferido contra o `data.json`** antes de ficar no texto. Dois p-valores estavam arredondados diferente do que o app mostra (0,96 → 0,95; 0,49 → 0,48) e foram alinhados.
- **Clone limpo da branch:** testes do motor passando, motor regenerando os dados, `npm ci` + build do app funcionando — o caminho que o avaliador vai seguir.
- **[IA] errou no git:** o `.gitignore` da raiz do repo ignora `submissions/` (contradiz o CONTRIBUTING; não pode ser alterado pela regra do PR). O `git add -f` usado para contornar isso também atropelou o `.gitignore` interno e colocou `node_modules/`, `dist/` e caches do Python no commit. Pego na revisão do commit, antes de qualquer push; corrigido adicionando só a lista explícita de arquivos-fonte.
