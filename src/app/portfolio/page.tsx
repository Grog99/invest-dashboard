import Link from "next/link";
import { db, companies, transactions } from "@/db";
import { asc, desc } from "drizzle-orm";
import { computePortfolio, computeYearlyTax } from "@/lib/portfolio";
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
} from "@/components/ui";
import { RefreshQuotesButton } from "@/components/RefreshButtons";
import { CompanyModalButton } from "@/components/CompanyForm";
import { TransactionModalButton } from "@/components/TransactionForm";
import { DividendModalButton } from "@/components/DividendForm";
import { DeleteButton } from "@/components/DeleteButton";
import { TransactionEditButton } from "@/components/TransactionEditButton";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  const summary = computePortfolio();
  const yearly = computeYearlyTax(summary);
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
                  <Link
                    href={`/companies/${h.company.id}`}
                    className="font-medium text-ink hover:text-accent"
                  >
                    {h.company.ticker}
                  </Link>
                  <span className="ml-2 hidden text-[12px] text-muted lg:inline">
                    {h.company.name}
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
                <Td right>{h.valuePln !== null ? fmtMoney(h.valuePln) : "—"}</Td>
                <Td right>
                  <Delta value={h.unrealizedPln} pct={h.unrealizedPct} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {yearly.length > 0 && (
        <Card
          title="Podsumowanie roczne (pod PIT-38)"
          className="mb-4"
        >
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
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Wyliczenia pomocnicze: FIFO, kursy NBP z dnia poprzedzającego (D-1).
            Zweryfikuj z PIT-8C od brokera przed rozliczeniem.
          </p>
        </Card>
      )}

      {summary.realizedSales.length > 0 && (
        <Card title="Zrealizowane sprzedaże (FIFO)" className="mb-4">
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
                  <Link
                    href={`/companies/${s.companyId}`}
                    className="font-medium hover:text-accent"
                  >
                    {s.ticker}
                  </Link>
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
        </Card>
      )}

      {summary.dividendRows.length > 0 && (
        <Card title="Dywidendy" className="mb-4">
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
                  <span className="font-medium">{d.ticker}</span>
                </Td>
                <Td right>
                  {fmtNumber(d.amount)}{" "}
                  <span className="text-muted">{d.currency}</span>
                </Td>
                <Td right>
                  {fmtNumber(d.taxWithheld)}{" "}
                  <span className="text-muted">{d.currency}</span>
                </Td>
                <Td right>{d.amountPln !== null ? fmtMoney(d.amountPln) : "—"}</Td>
                <Td>
                  <span className="text-[12px] text-muted">{d.note ?? ""}</span>
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
        </Card>
      )}

      <Card title={`Transakcje (${allTx.length})`}>
        {allTx.length === 0 ? (
          <EmptyState title="Brak transakcji" />
        ) : (
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
                    <span className="font-medium">{c?.ticker ?? "?"}</span>
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
                    <span className="text-[12px] text-muted">{t.note ?? ""}</span>
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
        )}
      </Card>
    </div>
  );
}
