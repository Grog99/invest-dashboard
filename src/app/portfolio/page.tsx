import Link from "next/link";
import { db, companies, transactions } from "@/db";
import { asc, desc } from "drizzle-orm";
import { computePortfolio, computeYearlyTax } from "@/lib/portfolio";
import { computeCfdPositions, type CfdPnlSource } from "@/lib/cfd";
import { fmtMoney, fmtNumber, fmtQty, fmtDate } from "@/lib/format";
import {
  Card,
  PageHeader,
  Table,
  Th,
  Td,
  Delta,
  Badge,
  EmptyState,
  Field,
} from "@/components/ui";
import { RefreshQuotesButton } from "@/components/RefreshButtons";
import { CompanyModalButton } from "@/components/CompanyForm";
import { TransactionModalButton } from "@/components/TransactionForm";
import { DividendModalButton } from "@/components/DividendForm";
import { CfdModalButton } from "@/components/CfdForm";
import { DeleteButton } from "@/components/DeleteButton";
import { TransactionEditButton } from "@/components/TransactionEditButton";
import { CompanyLogo } from "@/components/CompanyLogo";
import { getLogoFlags } from "@/lib/logos";

function CfdSourceBadge({ source }: { source: CfdPnlSource }) {
  if (source === "XTB") return <Badge tone="accent">wg XTB</Badge>;
  if (source === "YAHOO") return <Badge tone="neutral">szacunek Yahoo</Badge>;
  return <Badge tone="warn">brak ceny</Badge>;
}

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  const summary = computePortfolio();
  const yearly = computeYearlyTax(summary);
  const cfd = computeCfdPositions();
  const allCompanies = db
    .select()
    .from(companies)
    .orderBy(asc(companies.ticker))
    .all();
  // Indeksy są tylko obserwowane — nie mogą być spółką transakcji/dywidendy.
  const transactableCompanies = allCompanies.filter((c) => c.type !== "INDEX");
  const allTx = db
    .select()
    .from(transactions)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all();
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));
  const logoFlags = getLogoFlags(allCompanies.map((c) => c.id));

  return (
    <div>
      <PageHeader
        title="Portfel"
        sub="Pozycje liczone z historii transakcji metodą FIFO; wartości w PLN po kursach NBP."
        actions={
          <>
            <RefreshQuotesButton />
            <CompanyModalButton label="+ Spółka" variant="secondary" size="sm" />
            {transactableCompanies.length > 0 && (
              <>
                <DividendModalButton
                  companies={transactableCompanies}
                  label="+ Dywidenda"
                  variant="secondary"
                  size="sm"
                />
                <TransactionModalButton
                  companies={transactableCompanies}
                  label="+ Transakcja"
                  size="sm"
                />
              </>
            )}
            <CfdModalButton label="+ CFD" variant="secondary" size="sm" />
          </>
        }
      />

      {summary.warnings.length > 0 && (
        <div className="mb-4 space-y-1 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3">
          {summary.warnings.map((w, i) => (
            <p key={i} className="text-[12px] text-warn">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      <Card title="Pozycje" className="mb-4">
        {summary.holdings.length === 0 ? (
          <EmptyState
            title="Brak otwartych pozycji"
            hint={
              allCompanies.length === 0
                ? "Najpierw dodaj spółkę, potem zarejestruj transakcję kupna."
                : "Dodaj transakcję kupna, aby otworzyć pozycję."
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table
                head={
                  <>
                    <Th>Spółka</Th>
                    <Th right>Ilość</Th>
                    <Th right>Śr. koszt</Th>
                    <Th right>Kurs</Th>
                    <Th right>Dziś</Th>
                    <Th right>Wartość</Th>
                    <Th right>Wartość PLN</Th>
                    <Th right>Wynik PLN</Th>
                  </>
                }
              >
                {summary.holdings.map((h) => (
                  <tr key={h.company.id} className="hover:bg-surface2/40">
                    <Td>
                      <span className="inline-flex items-center gap-2">
                        <CompanyLogo
                          ticker={h.company.ticker}
                          name={h.company.name}
                          companyId={h.company.id}
                          hasLogo={logoFlags.get(h.company.id) ?? false}
                          color={h.company.color}
                        />
                        <span>
                          <Link
                            href={`/companies/${h.company.id}`}
                            className="font-medium text-ink hover:text-accent"
                          >
                            {h.company.ticker}
                          </Link>
                          <span className="ml-2 hidden text-[12px] text-muted lg:inline">
                            {h.company.name}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td right>{fmtQty(h.shares)}</Td>
                    <Td right>
                      {fmtNumber(h.avgCost)}{" "}
                      <span className="text-muted">{h.company.currency}</span>
                    </Td>
                    <Td right>
                      {h.price !== null ? fmtNumber(h.price) : "—"}
                    </Td>
                    <Td right>
                      <Delta pct={h.dayChangePct} />
                    </Td>
                    <Td right>
                      {h.value !== null
                        ? `${fmtNumber(h.value)} ${h.company.currency}`
                        : "—"}
                    </Td>
                    <Td right>
                      {h.valuePln !== null ? fmtMoney(h.valuePln) : "—"}
                    </Td>
                    <Td right>
                      <Delta value={h.unrealizedPln} pct={h.unrealizedPct} />
                    </Td>
                  </tr>
                ))}
              </Table>
            </div>
            <div className="space-y-2 md:hidden">
              {summary.holdings.map((h) => (
                <div
                  key={h.company.id}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <CompanyLogo
                        ticker={h.company.ticker}
                        name={h.company.name}
                        companyId={h.company.id}
                        hasLogo={logoFlags.get(h.company.id) ?? false}
                        color={h.company.color}
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/companies/${h.company.id}`}
                          className="font-medium text-ink hover:text-accent"
                        >
                          {h.company.ticker}
                        </Link>
                        <div className="truncate text-[12px] text-muted">
                          {h.company.name}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] text-muted">Wynik PLN</div>
                      <Delta value={h.unrealizedPln} pct={h.unrealizedPct} />
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <Field label="Ilość">{fmtQty(h.shares)}</Field>
                    <Field label="Śr. koszt">
                      {fmtNumber(h.avgCost)}{" "}
                      <span className="text-muted">{h.company.currency}</span>
                    </Field>
                    <Field label="Kurs">
                      {h.price !== null ? fmtNumber(h.price) : "—"}
                    </Field>
                    <Field label="Dziś">
                      <Delta pct={h.dayChangePct} />
                    </Field>
                    <Field label="Wartość PLN">
                      {h.valuePln !== null ? fmtMoney(h.valuePln) : "—"}
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card title="Pozycje CFD" className="mb-4">
        {cfd.positions.length === 0 ? (
          <EmptyState
            title="Brak pozycji CFD"
            hint="Dodaj pozycję przez „+ CFD” — domyślnie WIG20, wartość punktu 20 zł/pkt."
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table
                head={
                  <>
                    <Th>Pozycja</Th>
                    <Th right>Wolumen</Th>
                    <Th right>Cena otwarcia</Th>
                    <Th right>Kurs bieżący</Th>
                    <Th right>Wart. punktu</Th>
                    <Th right>Ekspozycja</Th>
                    <Th right>Wynik P&L</Th>
                    <Th />
                  </>
                }
              >
                {cfd.positions.map((p) => (
                  <tr key={p.position.id} className="hover:bg-surface2/40">
                    <Td>
                      <span className="inline-flex items-center gap-2">
                        <Badge tone={p.position.direction === "LONG" ? "pos" : "neg"}>
                          {p.position.direction}
                        </Badge>
                        <span>
                          <span className="font-medium text-ink">{p.position.name}</span>
                          <span className="ml-2 hidden text-[12px] text-muted lg:inline">
                            {p.position.quoteSymbol}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td right>{fmtQty(p.position.volume)}</Td>
                    <Td right>{fmtNumber(p.position.openPrice)}</Td>
                    <Td right>
                      {p.effectivePrice !== null ? (
                        <span className="inline-flex items-center gap-1.5">
                          {fmtNumber(p.effectivePrice)}
                          <CfdSourceBadge source={p.pnlSource} />
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-muted">—</span>
                          <CfdSourceBadge source={p.pnlSource} />
                        </span>
                      )}
                    </Td>
                    <Td right>
                      {fmtNumber(p.position.pointValue)}{" "}
                      <span className="text-muted">PLN/pkt</span>
                    </Td>
                    <Td right>
                      {p.exposure !== null ? fmtMoney(p.exposure) : "—"}
                    </Td>
                    <Td right>
                      <Delta value={p.pnl} />
                    </Td>
                    <Td right>
                      <span className="inline-flex items-center gap-1">
                        <CfdModalButton position={p.position} iconOnly />
                        <DeleteButton
                          url={`/api/cfd/${p.position.id}`}
                          confirmText={`Usunąć pozycję CFD „${p.position.name}"?`}
                          label="Usuń"
                          iconOnly
                        />
                      </span>
                    </Td>
                  </tr>
                ))}
              </Table>
            </div>
            <div className="space-y-2 md:hidden">
              {cfd.positions.map((p) => (
                <div
                  key={p.position.id}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <Badge tone={p.position.direction === "LONG" ? "pos" : "neg"}>
                        {p.position.direction}
                      </Badge>
                      <div className="min-w-0">
                        <div className="font-medium text-ink">{p.position.name}</div>
                        <div className="truncate text-[12px] text-muted">
                          {p.position.quoteSymbol}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] text-muted">Wynik P&L</div>
                      <Delta value={p.pnl} />
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <Field label="Wolumen">{fmtQty(p.position.volume)}</Field>
                    <Field label="Cena otwarcia">{fmtNumber(p.position.openPrice)}</Field>
                    <Field label="Kurs bieżący">
                      {p.effectivePrice !== null ? fmtNumber(p.effectivePrice) : "—"}
                    </Field>
                    <Field label="Źródło">
                      <CfdSourceBadge source={p.pnlSource} />
                    </Field>
                    <Field label="Wart. punktu">
                      {fmtNumber(p.position.pointValue)} PLN/pkt
                    </Field>
                    <Field label="Ekspozycja">
                      {p.exposure !== null ? fmtMoney(p.exposure) : "—"}
                    </Field>
                  </div>
                  <div className="mt-2 flex justify-end gap-1">
                    <CfdModalButton position={p.position} iconOnly />
                    <DeleteButton
                      url={`/api/cfd/${p.position.id}`}
                      confirmText={`Usunąć pozycję CFD „${p.position.name}"?`}
                      label="Usuń"
                      iconOnly
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Ekspozycja (wartość nominalna, z dźwignią) jest informacyjna —{" "}
              <strong>nie</strong> wchodzi do wartości portfela. Do majątku dolicza
              się tylko wynik P&L (mark-to-market). Szacunek Yahoo liczy się z
              indeksu kasowego WIG20, a XTB wycenia CFD z kontraktu futures FW20 —
              różnica to baza/rolowanie; skoryguj „wg XTB”, jeśli chcesz dokładny wynik.
            </p>
          </>
        )}
      </Card>

      {yearly.length > 0 && (
        <Card
          title="Podsumowanie roczne (pod PIT-38)"
          className="mb-4"
        >
          <div className="hidden md:block">
            <Table
              head={
                <>
                  <Th>Rok</Th>
                  <Th right>Przychód (sprzedaż)</Th>
                  <Th right>Koszty</Th>
                  <Th right>Dochód</Th>
                  <Th right>Podatek 19%</Th>
                  <Th right>Dywidendy brutto</Th>
                  <Th right>Podatek pobrany</Th>
                  <Th right>Dopłata od dywidend</Th>
                </>
              }
            >
              {yearly.map((y) => (
                <tr key={y.year}>
                  <Td>{y.year}</Td>
                  <Td right>{fmtMoney(y.proceedsPln)}</Td>
                  <Td right>{fmtMoney(y.costsPln)}</Td>
                  <Td right>
                    <Delta value={y.incomePln} />
                  </Td>
                  <Td right>{fmtMoney(y.tax19)}</Td>
                  <Td right>{fmtMoney(y.divGrossPln)}</Td>
                  <Td right>{fmtMoney(y.divWithheldPln)}</Td>
                  <Td right>{fmtMoney(y.divTaxDuePln)}</Td>
                </tr>
              ))}
            </Table>
          </div>
          <div className="space-y-2 md:hidden">
            {yearly.map((y) => (
              <div
                key={y.year}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[14px] font-medium">{y.year}</div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] text-muted">Dochód</div>
                    <Delta value={y.incomePln} />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <Field label="Przychód (sprzedaż)">
                    {fmtMoney(y.proceedsPln)}
                  </Field>
                  <Field label="Koszty">{fmtMoney(y.costsPln)}</Field>
                  <Field label="Podatek 19%">{fmtMoney(y.tax19)}</Field>
                  <Field label="Dywidendy brutto">
                    {fmtMoney(y.divGrossPln)}
                  </Field>
                  <Field label="Podatek pobrany">
                    {fmtMoney(y.divWithheldPln)}
                  </Field>
                  <Field label="Dopłata od dywidend">
                    {fmtMoney(y.divTaxDuePln)}
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Wyliczenia pomocnicze: FIFO, kursy NBP z dnia poprzedzającego (D-1).
            Zweryfikuj z PIT-8C od brokera przed rozliczeniem.
          </p>
        </Card>
      )}

      {summary.realizedSales.length > 0 && (
        <Card title="Zrealizowane sprzedaże (FIFO)" className="mb-4">
          <div className="hidden md:block">
            <Table
              head={
                <>
                  <Th>Data</Th>
                  <Th>Spółka</Th>
                  <Th right>Ilość</Th>
                  <Th right>Przychód</Th>
                  <Th right>Koszt</Th>
                  <Th right>Wynik</Th>
                  <Th right>Wynik PLN</Th>
                </>
              }
            >
              {summary.realizedSales.map((s, i) => (
                <tr key={i}>
                  <Td>{fmtDate(s.date)}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <CompanyLogo
                        ticker={s.ticker}
                        name={companyById.get(s.companyId)?.name ?? s.ticker}
                        companyId={s.companyId}
                        hasLogo={logoFlags.get(s.companyId) ?? false}
                        color={companyById.get(s.companyId)?.color ?? null}
                      />
                      <Link
                        href={`/companies/${s.companyId}`}
                        className="font-medium hover:text-accent"
                      >
                        {s.ticker}
                      </Link>
                    </span>
                  </Td>
                  <Td right>{fmtQty(s.quantity)}</Td>
                  <Td right>
                    {fmtNumber(s.proceeds)}{" "}
                    <span className="text-muted">{s.currency}</span>
                  </Td>
                  <Td right>
                    {fmtNumber(s.cost)}{" "}
                    <span className="text-muted">{s.currency}</span>
                  </Td>
                  <Td right>
                    <Delta value={s.pl} currency={s.currency} />
                  </Td>
                  <Td right>
                    <Delta value={s.plPln} />
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
          <div className="space-y-2 md:hidden">
            {summary.realizedSales.map((s, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <CompanyLogo
                      ticker={s.ticker}
                      name={companyById.get(s.companyId)?.name ?? s.ticker}
                      companyId={s.companyId}
                      hasLogo={logoFlags.get(s.companyId) ?? false}
                      color={companyById.get(s.companyId)?.color ?? null}
                    />
                    <div>
                      <Link
                        href={`/companies/${s.companyId}`}
                        className="font-medium hover:text-accent"
                      >
                        {s.ticker}
                      </Link>
                      <div className="text-[12px] text-muted">
                        {fmtDate(s.date)}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] text-muted">Wynik PLN</div>
                    <Delta value={s.plPln} />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <Field label="Ilość">{fmtQty(s.quantity)}</Field>
                  <Field label="Wynik">
                    <Delta value={s.pl} currency={s.currency} />
                  </Field>
                  <Field label="Przychód">
                    {fmtNumber(s.proceeds)}{" "}
                    <span className="text-muted">{s.currency}</span>
                  </Field>
                  <Field label="Koszt">
                    {fmtNumber(s.cost)}{" "}
                    <span className="text-muted">{s.currency}</span>
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {summary.dividendRows.length > 0 && (
        <Card title="Dywidendy" className="mb-4">
          <div className="hidden md:block">
            <Table
              head={
                <>
                  <Th>Data</Th>
                  <Th>Spółka</Th>
                  <Th right>Brutto</Th>
                  <Th right>Podatek pobrany</Th>
                  <Th right>Brutto PLN</Th>
                  <Th>Notatka</Th>
                  <Th />
                </>
              }
            >
              {summary.dividendRows.map((d, i) => (
                <tr key={i}>
                  <Td>{fmtDate(d.date)}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <CompanyLogo
                        ticker={d.ticker}
                        name={companyById.get(d.companyId)?.name ?? d.ticker}
                        companyId={d.companyId}
                        hasLogo={logoFlags.get(d.companyId) ?? false}
                        color={companyById.get(d.companyId)?.color ?? null}
                      />
                      <span className="font-medium">{d.ticker}</span>
                    </span>
                  </Td>
                  <Td right>
                    {fmtNumber(d.amount)}{" "}
                    <span className="text-muted">{d.currency}</span>
                  </Td>
                  <Td right>
                    {fmtNumber(d.taxWithheld)}{" "}
                    <span className="text-muted">{d.currency}</span>
                  </Td>
                  <Td right>
                    {d.amountPln !== null ? fmtMoney(d.amountPln) : "—"}
                  </Td>
                  <Td>
                    <span className="text-[12px] text-muted">
                      {d.note ?? ""}
                    </span>
                  </Td>
                  <Td right>
                    <DeleteButton
                      url={`/api/dividends/${d.id}`}
                      confirmText={`Usunąć dywidendę ${d.ticker} z ${fmtDate(d.date)}?`}
                      label="Usuń"
                      iconOnly
                    />
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
          <div className="space-y-2 md:hidden">
            {summary.dividendRows.map((d, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <CompanyLogo
                      ticker={d.ticker}
                      name={companyById.get(d.companyId)?.name ?? d.ticker}
                      companyId={d.companyId}
                      hasLogo={logoFlags.get(d.companyId) ?? false}
                      color={companyById.get(d.companyId)?.color ?? null}
                    />
                    <div>
                      <span className="font-medium">{d.ticker}</span>
                      <div className="text-[12px] text-muted">
                        {fmtDate(d.date)}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <div className="text-right">
                      <div className="text-[11px] text-muted">Brutto PLN</div>
                      <div className="text-[13px]">
                        {d.amountPln !== null ? fmtMoney(d.amountPln) : "—"}
                      </div>
                    </div>
                    <DeleteButton
                      url={`/api/dividends/${d.id}`}
                      confirmText={`Usunąć dywidendę ${d.ticker} z ${fmtDate(d.date)}?`}
                      label="Usuń"
                      iconOnly
                    />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <Field label="Brutto">
                    {fmtNumber(d.amount)}{" "}
                    <span className="text-muted">{d.currency}</span>
                  </Field>
                  <Field label="Podatek pobrany">
                    {fmtNumber(d.taxWithheld)}{" "}
                    <span className="text-muted">{d.currency}</span>
                  </Field>
                  {d.note && <Field label="Notatka">{d.note}</Field>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title={`Transakcje (${allTx.length})`}>
        {allTx.length === 0 ? (
          <EmptyState title="Brak transakcji" />
        ) : (
          <>
            <div className="hidden md:block">
              <Table
                head={
                  <>
                    <Th>Data</Th>
                    <Th>Spółka</Th>
                    <Th>Typ</Th>
                    <Th right>Ilość</Th>
                    <Th right>Cena</Th>
                    <Th right>Prowizja</Th>
                    <Th>Notatka</Th>
                    <Th />
                  </>
                }
              >
                {allTx.map((t) => {
                  const c = companyById.get(t.companyId);
                  return (
                    <tr key={t.id} className="hover:bg-surface2/40">
                      <Td>{fmtDate(t.date)}</Td>
                      <Td>
                        <span className="inline-flex items-center gap-2">
                          {c && (
                            <CompanyLogo
                              ticker={c.ticker}
                              name={c.name}
                              companyId={c.id}
                              hasLogo={logoFlags.get(c.id) ?? false}
                              color={c.color}
                            />
                          )}
                          <span className="font-medium">{c?.ticker ?? "?"}</span>
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={t.type === "BUY" ? "pos" : "neg"}>
                          {t.type === "BUY" ? "Kupno" : "Sprzedaż"}
                        </Badge>
                      </Td>
                      <Td right>{fmtQty(t.quantity)}</Td>
                      <Td right>
                        {fmtNumber(t.price)}{" "}
                        <span className="text-muted">{c?.currency}</span>
                      </Td>
                      <Td right>{fmtNumber(t.commission)}</Td>
                      <Td>
                        <span className="text-[12px] text-muted">
                          {t.note ?? ""}
                        </span>
                      </Td>
                      <Td right>
                        <span className="inline-flex items-center gap-1">
                          <TransactionEditButton
                            companies={allCompanies}
                            transaction={t}
                          />
                          <DeleteButton
                            url={`/api/transactions/${t.id}`}
                            confirmText={`Usunąć transakcję ${t.type === "BUY" ? "kupna" : "sprzedaży"} ${c?.ticker ?? ""} z ${fmtDate(t.date)}?`}
                            label="Usuń"
                            iconOnly
                          />
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            </div>
            <div className="space-y-2 md:hidden">
              {allTx.map((t) => {
                const c = companyById.get(t.companyId);
                return (
                  <div
                    key={t.id}
                    className="rounded-lg border border-border bg-surface p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        {c && (
                          <CompanyLogo
                            ticker={c.ticker}
                            name={c.name}
                            companyId={c.id}
                            hasLogo={logoFlags.get(c.id) ?? false}
                            color={c.color}
                          />
                        )}
                        <div>
                          <span className="font-medium">{c?.ticker ?? "?"}</span>
                          <div className="text-[12px] text-muted">
                            {fmtDate(t.date)}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={t.type === "BUY" ? "pos" : "neg"}>
                          {t.type === "BUY" ? "Kupno" : "Sprzedaż"}
                        </Badge>
                        <TransactionEditButton
                          companies={allCompanies}
                          transaction={t}
                        />
                        <DeleteButton
                          url={`/api/transactions/${t.id}`}
                          confirmText={`Usunąć transakcję ${t.type === "BUY" ? "kupna" : "sprzedaży"} ${c?.ticker ?? ""} z ${fmtDate(t.date)}?`}
                          label="Usuń"
                          iconOnly
                        />
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                      <Field label="Ilość">{fmtQty(t.quantity)}</Field>
                      <Field label="Cena">
                        {fmtNumber(t.price)}{" "}
                        <span className="text-muted">{c?.currency}</span>
                      </Field>
                      <Field label="Prowizja">{fmtNumber(t.commission)}</Field>
                      {t.note && <Field label="Notatka">{t.note}</Field>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
