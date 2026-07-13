import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

const UPDATED_ISO = "2026-07-12";
const CONTACT = "zolkapp.dev@gmail.com";

function H({ children }: { children: string }) {
  return <h2 className="mt-5 text-base font-semibold">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>;
}

export function LegalPage({ doc }: { doc: "privacy" | "terms" }) {
  const { t } = useTranslation();
  const updated = formatDate(UPDATED_ISO, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <div>
      <Link
        to="/settings"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"
      >
        <ArrowLeft size={16} /> {t("cat.backSettings")}
      </Link>
      <PageHeader
        title={doc === "privacy" ? t("legal.privacyTitle") : t("legal.termsTitle")}
        subtitle={`${t("legal.updatedPrefix")} ${updated}`}
      />
      <Card>{doc === "privacy" ? <Privacy /> : <Terms />}</Card>
    </div>
  );
}

function Privacy() {
  const { t } = useTranslation();
  const data = t("legal.privacy.data", { returnObjects: true }) as string[];
  const rights = t("legal.privacy.rights", { returnObjects: true }) as string[];
  return (
    <div>
      <P>{t("legal.privacy.intro")}</P>

      <H>{t("legal.privacy.dataTitle")}</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {data.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-muted">
            {item}
          </li>
        ))}
      </ul>

      <H>{t("legal.privacy.whereTitle")}</H>
      <P>{t("legal.privacy.where")}</P>

      <H>{t("legal.privacy.shareTitle")}</H>
      <P>{t("legal.privacy.share")}</P>

      <H>{t("legal.privacy.rightsTitle")}</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {rights.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-muted">
            {item}
          </li>
        ))}
      </ul>

      <H>{t("legal.privacy.retentionTitle")}</H>
      <P>{t("legal.privacy.retention")}</P>

      <H>{t("legal.privacy.minorsTitle")}</H>
      <P>{t("legal.privacy.minors")}</P>

      <H>{t("legal.privacy.changesTitle")}</H>
      <P>{t("legal.privacy.changes")}</P>

      <H>{t("legal.privacy.contactTitle")}</H>
      <P>{t("legal.privacy.contact", { email: CONTACT })}</P>
    </div>
  );
}

function Terms() {
  const { t } = useTranslation();
  const account = t("legal.terms.account", { returnObjects: true }) as string[];
  return (
    <div>
      <P>{t("legal.terms.intro")}</P>

      <H>{t("legal.terms.whatTitle")}</H>
      <P>{t("legal.terms.what")}</P>

      <H>{t("legal.terms.whatNotTitle")}</H>
      <P>{t("legal.terms.whatNot")}</P>

      <H>{t("legal.terms.accountTitle")}</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {account.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-muted">
            {item}
          </li>
        ))}
      </ul>

      <H>{t("legal.terms.availTitle")}</H>
      <P>{t("legal.terms.avail")}</P>

      <H>{t("legal.terms.useTitle")}</H>
      <P>{t("legal.terms.use")}</P>

      <H>{t("legal.terms.changesTitle")}</H>
      <P>{t("legal.terms.changes")}</P>

      <H>{t("legal.terms.lawTitle")}</H>
      <P>{t("legal.terms.law", { email: CONTACT })}</P>
    </div>
  );
}
