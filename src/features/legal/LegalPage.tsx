import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { PageHeader } from "@/components/PageHeader";

const UPDATED = "26 de junho de 2026";
const CONTACT = "gabriel.zolk@znap.com.br";

function H({ children }: { children: string }) {
  return <h2 className="mt-5 text-base font-semibold">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>;
}
function LI({ children }: { children: React.ReactNode }) {
  return <li className="text-sm leading-relaxed text-muted">{children}</li>;
}

export function LegalPage({ doc }: { doc: "privacy" | "terms" }) {
  return (
    <div>
      <Link
        to="/settings"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={16} /> Ajustes
      </Link>
      <PageHeader
        title={doc === "privacy" ? "Política de Privacidade" : "Termos de Uso"}
        subtitle={`Atualizado em ${UPDATED}`}
      />
      <Card>{doc === "privacy" ? <Privacy /> : <Terms />}</Card>
    </div>
  );
}

function Privacy() {
  return (
    <div>
      <P>
        Esta Política explica como o aplicativo <b>Financer</b> ("app") trata
        seus dados. Ele foi feito para organizar suas finanças pessoais e segue
        o princípio <b>local-first</b>: seus dados ficam primeiro no seu próprio
        aparelho.
      </P>

      <H>Quais dados o app trata</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <LI>
          <b>Dados que você cria:</b> contas, lançamentos, categorias, metas,
          orçamentos, recorrências, tags e anexos (comprovantes).
        </LI>
        <LI>
          <b>Conta de sincronização (opcional):</b> seu e-mail, usado só para
          login e para sincronizar entre seus dispositivos.
        </LI>
        <LI>
          <b>Feedback (opcional):</b> o texto que você envia, com a tela e o
          navegador no momento, para corrigirmos problemas.
        </LI>
        <LI>
          Não coletamos dados de localização, contatos, nem usamos rastreadores
          de publicidade.
        </LI>
      </ul>

      <H>Onde seus dados ficam</H>
      <P>
        Por padrão, tudo fica <b>no seu aparelho</b> (armazenamento local do
        navegador). Se você ativar a sincronização, uma cópia é guardada na
        nuvem (infraestrutura <b>Supabase</b>) ligada à sua conta, transmitida
        sempre por conexão segura (HTTPS). Lançamentos marcados como{" "}
        <b>privados</b> são <b>criptografados</b> com o seu PIN antes de sair do
        aparelho — sem o PIN, ninguém os lê, nem nós.
      </P>

      <H>Compartilhamento</H>
      <P>
        <b>Não vendemos e não compartilhamos</b> seus dados com terceiros para
        fins comerciais. Utilizamos apenas o Supabase como provedor de
        infraestrutura (armazenamento/sincronização), na função de operador.
      </P>

      <H>Seus direitos (LGPD)</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <LI>
          <b>Acessar e exportar:</b> em Ajustes → Backup, você exporta tudo em
          .json ou .csv a qualquer momento.
        </LI>
        <LI>
          <b>Corrigir:</b> você edita ou apaga qualquer lançamento direto no
          app.
        </LI>
        <LI>
          <b>Excluir:</b> você pode apagar seus dados e/ou solicitar a exclusão
          da conta de sincronização pelo contato abaixo.
        </LI>
        <LI>
          <b>Revogar o consentimento:</b> basta desativar a sincronização e/ou
          parar de usar o app.
        </LI>
      </ul>

      <H>Retenção</H>
      <P>
        Os dados na nuvem permanecem enquanto sua conta existir. Ao excluir os
        dados ou a conta, eles são removidos.
      </P>

      <H>Menores</H>
      <P>
        O app não é direcionado a menores de 18 anos e não coleta dados de
        crianças intencionalmente.
      </P>

      <H>Alterações</H>
      <P>
        Podemos atualizar esta Política; mudanças relevantes serão informadas no
        app, com nova data de atualização.
      </P>

      <H>Contato</H>
      <P>
        Dúvidas ou pedidos sobre seus dados: <b>{CONTACT}</b>.
      </P>
    </div>
  );
}

function Terms() {
  return (
    <div>
      <P>
        Ao usar o aplicativo <b>Financer</b> ("app"), você concorda com estes
        Termos. Leia com atenção.
      </P>

      <H>O que o app é</H>
      <P>
        Uma ferramenta para <b>organização financeira pessoal</b>: registrar
        gastos e receitas, acompanhar contas, metas, orçamentos e relatórios.
      </P>

      <H>O que o app NÃO é</H>
      <P>
        O app <b>não presta aconselhamento financeiro, contábil, tributário ou
        de investimentos</b>. Os números e projeções são apenas organizacionais.
        Decisões financeiras são de sua responsabilidade; consulte um
        profissional quando necessário.
      </P>

      <H>Sua conta e segurança</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <LI>
          Você é responsável por manter seu login e seu PIN em segurança.
        </LI>
        <LI>
          O PIN de privacidade criptografa os dados privados.{" "}
          <b>Se você esquecer o PIN, esses dados não podem ser recuperados.</b>
        </LI>
        <LI>Faça backups regularmente (Ajustes → Backup).</LI>
      </ul>

      <H>Disponibilidade e garantias</H>
      <P>
        O app é fornecido <b>"no estado em que se encontra"</b>, sem garantia de
        funcionamento ininterrupto ou livre de erros. Não nos responsabilizamos
        por perdas decorrentes do uso, incluindo eventual perda de dados — por
        isso, mantenha backups.
      </P>

      <H>Uso adequado</H>
      <P>
        Você se compromete a usar o app de forma lícita e a não tentar
        comprometer sua segurança ou a de outros usuários.
      </P>

      <H>Alterações</H>
      <P>
        Podemos atualizar estes Termos; o uso contínuo após mudanças significa
        concordância com a nova versão.
      </P>

      <H>Legislação</H>
      <P>
        Estes Termos são regidos pela legislação brasileira. Contato:{" "}
        <b>{CONTACT}</b>.
      </P>
    </div>
  );
}
