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

## 7. Auditoria pós-entrega (achado grave no motor)

Antes de abrir o PR, pedi uma segunda sessão do Claude Code (Claude Opus 5.5) para auditar a submissão como um avaliador externo faria, sem o contexto de quem construiu — comparando o que estava pronto contra o brief do challenge 003, rodando os testes e conferindo os números do `data.json` na unha, não só lendo o README.

**[IA/auditoria] achou dois problemas reais, não de estilo:**

1. **`fit_curve` só aprendia com deals fechados (Won/Lost).** Um deal aberto há 90 dias que ainda não fechou é prova de que 90 dias não garante fechar em 30 — mas ele não entrava em nenhuma conta. Resultado: a curva dizia "91% dos deals com 95 dias fecham em 30 dias", um número otimista por construção (viés de sobrevivência), bem no texto que o README vendia como "zero alucinação". Recalculando com os abertos como censura à direita (contam como "não fechou" só depois de observados pela janela inteira sem fechar), a mesma idade cai para ~40%. Nenhuma idade da base chega perto de 50% depois da correção — a antiga "janela ≥ 58 dias, ≥ 50%" deixou de existir.
2. **Score = percentil da receita esperada tinha correlação de 0,90 (Spearman) com o preço do deal.** Os 12 primeiros do ranking eram sempre os produtos mais caros. O brief pede explicitamente "não é só ordenar por valor" — e na prática era quase isso.

**[EU] corrigi:**
- `fit_curve` agora recebe as idades dos deals abertos e os conta no denominador de `close_soon`/`win_soon` (censura à direita). A janela de fechamento deixou de ser um limiar absoluto (`≥ 50%`) escolhido sobre uma curva que eu assumia crescente: com a correção ela sobe, tem um pico (75 dias, 44%) e cai — então passei a achar o vale depois da morte rápida inicial e subir dali até cruzar metade do pico. Os números continuam vindo dos dados, só o algoritmo ficou mais honesto sobre o formato real da curva.
- Score virou `P(ganhar em 30 dias | idade)` direto — uma probabilidade, não uma posição no ranking. Não depende mais do preço. Zumbi e prospecção ficam sem score (não têm histórico confiável de curto prazo) em vez de um "0" que parecia dizer "chance zero". A prioridade das filas continua sendo receita esperada (valor × chance), mas agora é um número visivelmente separado do score na tela.
- Efeito colateral bom: como `ev`/`ev_soon` de prospecção agora são sempre 0 (não há taxa de conversão prospecção→Engaging conhecida), o card "Receita esperada" de Meu Dia e o "Esperado" do Forecast, que antes divergiam (um somava tudo, o outro só Engaging), passaram a bater sozinhos — sem precisar sincronizar duas fórmulas na mão.
- 2 testes novos no motor (`test_censoring_pulls_close_soon_down`, `test_prospecting_and_zombie_have_no_score`) para travar os dois problemas.

Isso não teria aparecido numa revisão visual das telas (que já tinha sido feita) — só apareceu comparando os números do JSON contra a definição matemática deles, de fora. Fica registrado como o exemplo mais forte de "desconfiar do próprio output": mesmo depois de testes passando e telas revisadas, o número que o vendedor lê estava errado.

## 8. Questionando o conserto em vez de dar por encerrado

Depois que a IA corrigiu os dois problemas da seção 7, eu **não aceitei a correção como pronta só porque os testes passaram**. Rodei um segundo review adversarial (Codex, via `/codex:adversarial-review`, modelo diferente do que fez a correção) pedindo explicitamente para questionar se a implementação estava certa, não só procurar bugs de sintaxe — a mesma lógica de não deixar a IA corrigir a própria lição de casa sem outro olhar checando.

**[Codex] achou 2 problemas no que a correção da seção 7 deixou:**

1. **`PRODUCT.md` (o "manual" do produto) ficou descrevendo a fórmula antiga do score** (percentil × preço, zumbi = 0) depois que o código já usava a nova (chance de ganhar em %, zumbi/prospecção = sem score). Documentação e código descolados — quem lesse só o manual acharia que o código está errado.
2. **A "janela de fechamento" pode estar apoiada num pico instável da curva.** O código acha o ponto de idade com a maior chance histórica de fechar logo (o "pico") e usa metade dele como fronteira da janela. Mas "maior entre várias idades" é sensível a solavancos de amostra pequena — como jogar uma moeda 10 vezes e tirar 7 caras não prova moeda viciada. O corte de 30 deals por idade ajuda, mas não tem garantia formal de que o pico escolhido é real e não ruído; se os dados mudarem um pouco, a fronteira pode pular de lugar sem aviso.

**[EU] entendi cada achado antes de mandar corrigir** — pedi para a IA explicar os dois sem termo técnico, em linguagem simples, antes de decidir o que fazer com eles. Não bastava a IA dizer "achei 2 problemas, corrigindo": exigi entender o mecanismo de cada um para poder julgar se a correção proposta ia fazer sentido.

Esse é o padrão que quero deixar registrado: a IA implementa, mas **a decisão de aceitar ou empurrar de volta para revisão é minha**, e passar a correção por um segundo review antes de considerar o trabalho pronto é parte do processo, não um extra — questionar se a IA fez certo, em vez de copiar e colar o resultado, vale tanto na primeira versão quanto na correção da correção.

## 9. Questionei o bot também, não só o motor

Antes de dar o bot de notificação por pronto, perguntei diretamente: "ele faz sentido, visto que só dispara com webhook/email já configurado?". Não aceitei a resposta óbvia ("sim, é assim que bot funciona") — pedi pra examinar o que acontece **antes** do envio: de onde viria o destino de cada um dos 35 vendedores. Resposta: de lugar nenhum. `sales_teams.csv` não tem email nem Slack ID, então "mandar a fila pra cada vendedor sem abrir o app" (a frase do resumo executivo) exigia rodar o comando 35 vezes à mão, cada uma com o destino certo digitado — não era um bot, era um formatador de mensagem que alguém aciona uma de cada vez.

**[EU] decidi fechar esse buraco** com o menor código que resolve de verdade, não com o mais impressionante: `--all` roda o digest dos 35 vendedores do roster numa chamada, e `--targets targets.json` (arquivo opcional, documentado em `targets.example.json`) dá o destino de cada um. Sem o arquivo, cai no mesmo modo seguro de sempre — só imprime, nada é enviado. Isso é dado que eu inventei (não veio do CSV do Kaggle), então documentei explicitamente que é um artefato que a RevOps manteria na vida real, não um dado do dataset.

## 10. Tirei a explicação do produto de dentro do produto

Pedi um unslop nos textos do app (adjetivo sem dado atrás, tipo "Forecast honesto") e, na mesma conversa, questionei se a tela "Como o score funciona" fazia sentido dentro do app ou se bastava documentar no GitHub. Minha primeira resposta foi defender a tela — o brief pede explicabilidade, e a tela linkava a ficha do deal. **[EU] corrigi minha própria IA:** explicabilidade é sobre o motivo de CADA dado, junto do dado — não sobre uma aba separada explicando como o produto foi construído. E documentação de "em cima de quais métricas foi feita a inteligência" não é MVP; é processo.

Isso separou duas coisas que a resposta anterior misturava:

- **Decisão** (fica no produto): por que este deal tem este score, a taxa do vendedor com a faixa de confiança, o histórico da conta. Já estava em grande parte na ficha do deal; o que faltava era estar também nas **listas** (Meu dia, Contas) — motivo virou linha visível em cada `DealRow`, não só um clique de distância.
- **Construção** (não fica no produto): a tabela de significância completa, a curva genérica, as correções de dado, o motivo estatístico por trás de "ninguém foi ranqueado" no Time. Isso já estava documentado no README e no `scoring.py` — a tela `/metodo` era a mesma informação duplicada dentro do app, com a moldura errada ("manual do produto" em vez de "prova de auditoria").

**Removido:** a página inteira (`Method.tsx`), o item de menu, o link "Ver os testes" na ficha do deal (mandava pra uma tela que ia sumir, e citava um p-valor que o vendedor não precisa ler) e as citações de p-valor no Time e na ficha do deal — ficou só o veredito em português ("dentro da média do time"), não o método estatístico que prova o veredito. O motor continua calculando tudo isso (`significance` no `data.json`); só parou de aparecer na tela.

## 11. Sugestão de ação na fila Decidir, e o limite que eu não ia deixar passar

Depois de dar bulk-decide na fila Decidir (seção anterior à unslop), pediram sugestão de qual deal fechar/requalificar e por quê — "pode ser Python/ML em vez de LLM". Antes de escrever qualquer código, precisei resolver uma tensão que o pedido não via: **zumbi ainda está aberto.** Não existe rótulo ganho/perdido pra um classificador aprender — é literalmente por isso que a fila se chama "decidir" e não "fechar". Treinar qualquer coisa supervisionada em cima disso seria inventar um outcome que os dados não têm, o mesmo tipo de alucinação que o projeto inteiro evita desde a seção 1.

**[EU] recusei a versão fácil** (um modelo bonito, sem dado pra sustentar) e construí o que os dados realmente respondem: uma função de triagem, não de previsão. Duas variáveis honestas — tem conta vinculada, e quanto além da mediana de "dias além do maior ciclo" (mediana calculada dos próprios 1.301 zumbis, não escolhida à mão, mesmo princípio do `window_start`). Documentei isso explicitamente no código e no README como o que é: prioriza a revisão, não prediz resultado.

Reaproveitei a infraestrutura que já existia em vez de criar uma nova: a sugestão vira o `action` do deal — o mesmo campo que a ficha do deal, a tabela do Pipeline e o bot do Slack/email já leem. Resultado: `notify.py` passou a mandar a razão certa pra cada zumbi sem eu tocar em uma linha do bot. Os botões "Requalifiquei"/"Encerrar como perdido" também passaram a destacar o sugerido, e o botão "selecionar sugeridos pra encerrar" no Pipeline liga direto no bulk-decide que já existia — o "por quê" e o "faça em lote" acabaram compondo sozinhos.

## 12. Fechando o loop do bulk-decide: confirmação, desfazer, nota e portabilidade

Depois de dar bulk-decide na seção 11, numa sessão seguinte do Claude Code eu levantei quatro furos deixados pela mecânica original e os tratei como **conserto e acabamento**, não como features novas. A ordem reflete prioridade: o primeiro era um risco de operação; os demais são ergonomia de decisão.

**12.1 Conserto: confirmação + desfazer em lote (`pages/Pipeline.tsx`, `styles.css`).** O bulk-decide original aplicava na hora e sem reverter — clicar "Encerrar como perdido" em 42 deals fazia aquilo sem volta e sem como voltar atrás. Agora o botão abre uma **confirmação** ("Confirma encerrar 42 deals?") que só aplica no "Sim, confirmar", e logo depois um **toast de desfazer** aparece ("42 deals encerrados como perdido. Desfazer") que reverte o lote inteiro de uma vez — um ÚNICO clique desfaz os 42, não 42 cliques. Sem timer: o toast fica até a próxima ação em lote ou até desfazer, mesmo padrão do "Desfazer" por deal na ficha — o vendedor não perde a janela de correção por hesitar 5 segundos.

**12.2 Nota por decisão (`components.tsx`, `data.ts`, `main.tsx`, `styles.css`).** "Requalifiquei"/"Encerrar" marcava o deal, mas não guardava o *porquê*. Adicionei um campo de texto opcional ao lado da decisão ("falei com o cliente, decisão sai em fevereiro") que fica no **mesmo `localStorage`** da decisão (`note?` no tipo `Decisions`), sem backend novo — quando o vendedor voltar num deal daqui a 3 meses, o "por que eu decidi isso" está lá. Detalhe que cuidei: editar só a nota **preserva o `at` original** da decisão (a nota não reseta o momento em que o deal foi decidido, senão desordenava o histórico).

**12.3 Exportar/importar decisões (`main.tsx`, `styles.css`, README).** A limitação documentada é real: a decisão só existe naquele navegador. Adicionei na sidebar, em versão reduzida, um bloco **"Baixar decisões (N)" / "Importar decisões"** que gera um JSON com as decisões da sessão e importa de volta validando o formato — reaproveitando o mesmo mecanismo de `downloadBlob` do "Exportar CSV" que já existia. Não resolve multi-dispositivo de verdade (documentei no README que "não é sincronização"), mas dá um jeito de levar a decisão de um navegador pro outro e de fazer backup antes de limpar o cache.

**12.4 Tooltip/hover nos gráficos (`components.tsx`, `pages/Forecast.tsx`, `pages/Team.tsx`, `styles.css`).** A curva e a barra empilhada eram SVG estático — decorativo, sem valor exato ao passar o mouse. Na **curva**, o hover agora converte a posição do mouse numa idade e mostra um tooltip ("42 dias · Ganhar: 33% · Fechar em 30d: 41%"), com o marcador mudando de cor no hover pra distinguir do marcador fixo do deal — virou ferramenta de consulta de qualquer idade, não foto de um ponto. Na **barra do Forecast**, cada segmento virou um link com `title`/`aria-label` (passar o mouse mostra "Fechar: US$ X em N deals") e ainda é clicável pro filtro `?fila=`. Bônus, o **tempo/médio do Time** ganhou tooltip com a faixa de confiança. Baixo esforço, mas é a diferença entre "gráfico decorativo" e "gráfico que você usa".

**Registro de processo.** Esta sessão rodou perto do limite de requisições da ferramenta (rate limit) e a conversa completa não foi exportada antes disso — o chat fica marcado como pendente na seção de Evidências do README. As 4 mudanças estão todas no código-fonte confirmadas contra as funções auxiliares (`int`, `plural`, `moneyShort`, `sum`, `pct`) e os módulos importados (`BUCKETS`, `BUCKET_ORDER`), sem referência a símbolo que não exista. Não chegou a rodar o `npm run build` nesta leva (node indisponível no ambiente na hora da revisão); o `dist/` ainda é de antes destas mudanças e precisa de rebuild antes da entrega.

## 13. Centralizar a topbar e os filtros no compasso editorial

Numa nova passada de design (a framework **Impeccable**, com os playbooks de layout e de "craft-floor" — a camada que lista os vícios de IA a evitar), pedi para deixar o topo da tela e a faixa de filtros mais **alinhados ao centro**, em vez de tudo encostado na esquerda.

**Por que estava torto:** `main` e `.filters` não tinham coluna compartilhada — cada um tratava o próprio eixo, e o `.topbar-search` empurrava pra esquerda com `margin-left`. O resultado era a identidade, a busca e as ações da topbar, e os campos de filtro, todos "grudados no canto", sem leitura equilibrada em tela larga.

**O que mudei (`styles.css`):**
- `main` e `.filters` passaram a compartilhar **`max-width: 1440px; width: 100%; margin-inline: auto`** — a coluna estreita-editorial centralizada ("broadsheet"). Filtros e conteúdo lêem no mesmo compasso; em tela larga sobra papel dos dois lados em vez de tudo na esquerda.
- `.topbar-search` trocou `flex: 1 1 22rem; margin-left: 1.25rem` por `flex: 0 1 42rem; min-width: 12rem; margin-inline: auto` — a barra de busca fica centrada no vão entre a identidade (esq.) e as ações (dir.).
- **Refinamento contra "AI-slop" de design:** a faixa de filtros era um vidro translúcido genérico (`blur(10px) saturate(1.05)`, glassmorphism padrão). Refinei para **papel quase sólido** (`96%` paper, `blur(6px)`, sem boost de saturação) com filete de 1px embaixo — adere à estampa editorial, não ao "vitral" de template.

**[EU] verifiquei por geometria renderizada — não por screenshot, porque este modelo não lê imagem.** O runtime mediu as caixas (`getBoundingClientRect`) de `main`, `.filters`, `select`, `pageHead`, `toolbar`, `search`, `brand`, `actions` nas três vistas (`#/pipeline`, `#/`, `#/forecast`) e no mobile (390px):

- **Desktop 1920px:** `main` e `.filters` ambos em l=357–1797 (w=1440) — perfeitamente alinhados; `pageHead`/`toolbar` e o primeiro `select` começam no mesmo recuo interno (l=397). A busca fica centrada no vão (cx≈805, entre a marca l=20 e as ações l=1563).
- **Mobile 390px:** `main` e `.filters` full-width e alinhados; o `select` começa no padding correto (l=16); nada quebra com o novo `margin-inline: auto`.
- **`detect.mjs --scope layout` da Impeccable voltou `[]`** (sem defeito) no CSS final.

O `npm run build` passou limpo e o `dist/` foi reconstruído. As 4 mudanças de borda/portabilidade da seção 12 + esta 13 ficaram juntas num único commit local (nada enviado ao GitHub), para visualização no `http://127.0.0.1:8099`.

## 14. Cinco melhorias de "decisão" no Meu Dia

Depois do design centralizado (seção 13), a direção pedida foi "algo em design/inteligência que aprimore de verdade" — não mais aparência, mas o momento em que a tela ajuda (ou deixa de ajudar) o vendedor a decidir. As mudanças vieram de um olhar sobre o que o motor **já calcula** mas a tela **não expõe**, e foram agrupadas em 5 itens.

**14.1 Direção geral: expor o que já existe, não inventar score novo.** O motor (`scoring.py`) já computa `ev_soon` (receita esperada em 30d), `suggested_action` (encerrar/confirmar na fila Decidir) e a curva `win_soon` (chance de ganhar por idade). As melhorias reusam esses três — nenhum número novo foi criado, o que preserva a disciplina do projeto ("nenhuma feature sem dado atrás"). Foi uma escolha de fronteira: **a inteligência não está no score, está na navegação do gesto** (o que faço AGORA? em quantos grupo? onde trava?).

**14.2 Item 1 — Ação do momento (razor top-1).** Um card `razor` no topo do Meu Dia mostra o UMA deal de maior `ev_soon` da fila Fechar, com o seu `action` textual e o link pra ficha. É o "o que eu faço na segunda de manhã" que o challenge pinta ("o que ele vê ao abrir"). Antes isso existia só como a primeira linha de uma fila; agora é uma decisão nomeada. Sem score novo: só escolhe o topo de um ranking que `PRIORITY.fechar` já ordena.

**14.3 Item 2 — Agregado da fila Decidir.** A fila tem 1.301 deals esmagadores. `decide-split` mostra **"1.102 para encerrar | 199 para confirmar antes"** (dados reais do `suggested_action`) + link "Ver todos" — transforma a fila em decisão de gestão de dois números, sem esconder o detalhe de cada deal.

**14.4 Item 3 — Painel de saúde do funil.** `health-strip`, fita discreta com sinais de "o que trava a semana": deals parados além do ciclo (% do aberto), prospecção sem negociação viva (gargalo de engajamento) e deals sem conta vinculada. Os dois últimos são **condicionais** — só aparecem quando o recorte tem mesmo o desequilíbrio, para não virar alarme falso.

**14.5 Item 4 — Destaque do "mais quente" na fila Fechar.** O pico da curva (`win_soon` máx, derivado dos dados via `peakAge`), o deal mais próximo dele ganha o selo "no pico" + destaque da régua; o top-1 recebe a faixa lateral `hot`. Cor continua sendo fila de ação, não decoração — só sublinha urgência relativa DENTRO da mesma fila.

**14.6 Item 5 — Varredura de glassmorphism.** A última superfície translúcida restante (`.filters`, com `backdrop-filter: blur`) virou **papel sólido** (`var(--paper)`, hierarquia por borda + sombra). No dark mode vira banda navy coerente. Confirmado por CDP: `backdropFilter: "none"`.

**[EU] verifiquei por geometria renderizada e por contagem de nós no runtime** (este modelo não lê imagem). No `#/` (Meu Dia) em 1680px: `razor`, `health-strip` e `decide-split` todos alinhados à coluna central (l=284 r=1630, off=122); `hotRows=1`, `peakedRows=1`, `peakBadges=1`; o texto do agregado = "1.102 para encerrar | 199 para confirmar antes | Ver todos"; `filtersBg: "none"`. No mobile (390px) os três alinham à largura (l=18). `detect.mjs --scope layout` voltou `[]`. `npm run build` limpo; `dist/` reconstruído.

Estas 7 mudanças + a seção 13 vão num commit local (nada enviado ao GitHub), para a análise visual no `http://127.0.0.1:8099`.
