import { AgeRuler, CurveChart } from "../components";
import { useApp } from "../data";
import { int, pValue } from "../format";

export function Method() {
  const { model } = useApp();
  const { meta } = model;
  return (
    <article className="method">
      <header className="page-head">
        <h1>Como o score funciona</h1>
        <p className="lede">
          O score responde uma pergunta: qual a chance deste deal ser <strong>ganho</strong> nos próximos {meta.horizon_days}{" "}
          dias? É a taxa histórica de deals que chegaram à mesma idade, entre {int(meta.closed_deals)} deals já fechados — não é
          uma comparação com o resto do pipeline, nem depende do valor do deal. Um score de 40 quer dizer 40% de chance. A conta
          leva em consideração que um deal aberto que ainda não fechou também é histórico: prova que aquela idade, sozinha, não
          garante fechar logo — não só os que já fecharam contam.
        </p>
      </header>

      <section>
        <h2>O que a idade do deal diz</h2>
        <p>
          Deals que morrem, morrem cedo: quem fecha em até 15 dias perde quase metade das vezes. A chance de fechar nos próximos{" "}
          {meta.horizon_days} dias sobe depois disso, atinge o pico por volta dos {meta.window_start} dias e cai de novo conforme
          o deal envelhece — chegar a {meta.max_cycle} dias sem fechar não é mais garantia de nada, é só o ponto em que nenhum
          deal da base jamais fechou.
        </p>
        <CurveChart curve={model.curve} meta={meta} />
        <AgeRuler age={null} meta={meta} size="lg" />
        <ul className="plain">
          <li><strong>Avançar</strong>, antes de {meta.window_start} dias: ainda cedo, a chance de fechar logo ainda não decolou.</li>
          <li><strong>Fechar</strong>, de {meta.window_start} a {meta.max_cycle} dias: tem histórico comparável, com score próprio para cada idade — olhe o score de cada deal, não só a fila.</li>
          <li><strong>Decidir</strong>, de {meta.max_cycle} dias em diante: sem histórico comparável. O deal sai do forecast até ser requalificado.</li>
          <li><strong>Prospectar</strong>: ainda sem data de engajamento. A conta assume que o relógio começa quando o vendedor engajar.</li>
        </ul>
      </section>

      <section>
        <h2>O que foi testado e ficou de fora</h2>
        <p>
          Cada característica foi testada contra o acaso: se todos os grupos tivessem a mesma chance de ganhar, com que
          frequência veríamos diferenças tão grandes quanto as reais? Um p alto quer dizer que o acaso explica a diferença.
        </p>
        <div className="table-wrap">
          <table className="deals">
            <thead>
              <tr>
                <th scope="col">Característica</th>
                <th scope="col" className="num">Grupos</th>
                <th scope="col" className="num">p</th>
                <th scope="col">No score?</th>
                <th scope="col">Por quê</th>
              </tr>
            </thead>
            <tbody>
              {model.significance.map((t) => (
                <tr key={t.feature}>
                  <th scope="row">{t.feature}</th>
                  <td className="num">{int(t.groups)}</td>
                  <td className="num">{pValue(t.p_value)}</td>
                  <td className={t.used ? "won" : "muted"}>{t.used ? "Sim" : "Não"}</td>
                  <td>{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Correções feitas nos dados</h2>
        <ul className="plain">
          {meta.data_fixes.map((f) => <li key={f}>{f}.</li>)}
        </ul>
      </section>

      <section>
        <h2>O que o score não sabe</h2>
        <ul className="plain">
          <li>O CRM não registra atividade (e-mails, reuniões). Idade é o melhor sinal disponível, não o ideal: um deal velho com reunião marcada amanhã parece zumbi.</li>
          <li>Os dados são um retrato de {meta.reference_date.split("-").reverse().join("/")}. Em produção, o motor rodaria toda noite sobre o CRM.</li>
          <li>Deals em prospecção não têm score nem entram no forecast: não há histórico de quantos prospects avançam para Engaging.</li>
          <li>Decisões marcadas aqui (requalificar, encerrar) ficam só neste navegador.</li>
        </ul>
      </section>
    </article>
  );
}
