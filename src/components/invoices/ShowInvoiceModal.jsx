import { useEffect, useState, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtMoney, fmtQty, num } from '@/lib/format'
import { fullDate } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import {
    badge, toneBadge, tableCard, tableHeadRow, tableHeadCell, modalFooter, secondaryButton,
} from '@/lib/controlStyles'
import { invoiceCategory } from '@/lib/invoiceCategories'
import {
    documentName, inPrintedOrder, lineDecision, matchedTo, claimsByLine, claimsOnNoLine, claimWords, documentExtras,
    categoryFoot,
} from '@/lib/invoiceLines'
import Modal from '@/components/ui/Modal'
import ModalSection from '@/components/ui/ModalSection'
import ErrorBanner from '@/components/ui/ErrorBanner'
import SupplierBadge from '@/components/ui/SupplierBadge'

// What the Hub read off one document, opened from Show invoice on a row.
//
// Every line as it was read, what each was counted as, and what was decided
// about it, so a row's category badges and a price on the report can be
// checked against the paper in someone's hand. The PDF is not kept, so this
// is the reading and not the document.
//
// The lines are read when it opens and not with the page, which only needs
// their categories and money for the badges. Only the columns shown here.
const LINE_COLUMNS = 'id, line_no, supplier_code, raw_description, pack_size, cases, units, price_per_case, '
    + 'line_total, vat_amount, deposit_amount, category, decision, products(name), '
    + 'product_supplier_prices(version_id, product_versions(name))'

const CLAIM_COLUMNS = 'id, invoice_line_id, kind, cases, units, what, note, amount, credited_amount, status'

// A figure, or nothing where the reading has none. Not the dash fmtMoney gives
// for nothing, which in a column of figures reads as a minus.
const money = v => (v == null ? '' : fmtMoney(v))
const qty = v => (v == null ? '' : fmtQty(v))

export default function ShowInvoiceModal({ invoice, onClose }) {
    const [lines, setLines] = useState(null)
    const [claims, setClaims] = useState([])
    const [creditOf, setCreditOf] = useState(null)
    const [error, setError] = useState('')
    const credit = invoice.document_type === 'credit'
    const creditOfId = credit ? invoice.credit_of_invoice_id : null

    useEffect(() => {
        let alive = true

        async function load() {
            const [read, logged, against] = await Promise.all([
                supabase.from('invoice_lines')
                    .select(LINE_COLUMNS)
                    .eq('invoice_id', invoice.id)
                    .order('line_no'),
                supabase.from('invoice_line_claims')
                    .select(CLAIM_COLUMNS)
                    .eq('invoice_id', invoice.id),
                // Which invoice a credit note is for, by its number. The page
                // only has the id, and that invoice can be in any week.
                creditOfId
                    ? supabase.from('invoices')
                        .select('invoice_number, invoice_date')
                        .eq('id', creditOfId)
                        .maybeSingle()
                    : Promise.resolve({ data: null, error: null }),
            ])
            if (!alive) return
            const failed = read.error || logged.error || against.error
            if (failed) { setError(friendlyError(failed)); return }
            setLines(inPrintedOrder(read.data))
            setClaims(logged.data || [])
            setCreditOf(against.data || null)
        }

        load()
        return () => { alive = false }
    }, [invoice.id, creditOfId])

    const problems = claimsByLine(claims)
    const wholeDocument = claimsOnNoLine(claims)
    const extras = documentExtras(lines)
    const foot = lines ? categoryFoot(invoice, lines) : null

    // One fact to a line, the way the other dialogs lay a document out.
    const facts = [
        { label: 'Supplier', value: <SupplierBadge name={invoice.suppliers?.name} /> },
        { label: 'Number', value: invoice.invoice_number || 'None' },
        { label: 'Date', value: fullDate(invoice.invoice_date) },
        { label: 'Type', value: credit ? 'Credit note' : 'Invoice' },
        ...(creditOfId && !error ? [{
            label: 'Credit for',
            value: creditOf
                ? `${documentName(creditOf)}, ${fullDate(creditOf.invoice_date)}`
                : (lines ? 'An invoice no longer in the Hub' : 'Loading...'),
        }] : []),
        { label: 'Total', value: fmtMoney(invoice.total_amount) },
        ...(lines ? [
            { label: 'VAT', value: fmtMoney(extras.vat) },
            { label: 'Deposits', value: fmtMoney(extras.deposits) },
        ] : []),
    ]

    return (
        <Modal title={documentName(invoice)} onClose={onClose} width="max-w-5xl">
            <div className="px-6 py-4">
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                    {facts.map(f => (
                        <Fragment key={f.label}>
                            <dt className="text-xs text-muted pt-0.5">{f.label}</dt>
                            <dd className="text-gray-900 tabular-nums break-words">{f.value}</dd>
                        </Fragment>
                    ))}
                </dl>
            </div>

            {wholeDocument.length > 0 && (
                <ModalSection
                    title="Delivery problems"
                    description="Logged against the whole invoice rather than one of its lines."
                >
                    <div className="space-y-3">
                        {wholeDocument.map(claim => <Problem key={claim.id} claim={claim} />)}
                    </div>
                </ModalSection>
            )}

            <ModalSection
                title="Lines"
                description="What the Hub read off the document, in the order it was printed. The PDF itself is not kept."
            >
                <ErrorBanner>{error}</ErrorBanner>
                {!error && !lines && <p className="text-sm text-muted">Loading...</p>}
                {lines?.length === 0 && (
                    <p className="text-sm text-muted italic">No lines were read off this one.</p>
                )}

                {lines?.length > 0 && (
                    <>
                        {/* A card each up to a laptop, where ten columns would
                            scroll sideways. The words and the money first,
                            because they are what is read against the paper. */}
                        <div className="lg:hidden space-y-3">
                            {lines.map(line => (
                                <div key={line.id} className="border border-border rounded-lg p-3">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <p className="text-sm font-bold text-gray-900 min-w-0 break-words">
                                            {line.raw_description}
                                        </p>
                                        <span className="text-sm font-semibold text-gray-900 whitespace-nowrap tabular-nums">
                                            {money(line.line_total)}
                                        </span>
                                    </div>
                                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2 text-sm">
                                        {[
                                            ['Code', line.supplier_code],
                                            ['Pack', line.pack_size],
                                            ['Cases', qty(line.cases)],
                                            ['Single items', qty(line.units)],
                                            ['Price per case', money(line.price_per_case)],
                                            ['VAT', <Vat line={line} />],
                                        ].map(([label, value]) => (
                                            <div key={label} className="min-w-0">
                                                <dt className="text-xs text-muted">{label}</dt>
                                                <dd className="text-gray-900 tabular-nums break-words">{value}</dd>
                                            </div>
                                        ))}
                                        <div className="col-span-2">
                                            <dt className="text-xs text-muted">Counted as</dt>
                                            <dd className="mt-0.5"><CountedAs category={line.category} /></dd>
                                        </div>
                                        <div className="col-span-2">
                                            <dt className="text-xs text-muted">Decision</dt>
                                            <dd className="mt-0.5">
                                                <Decision line={line} credit={credit} problems={problems.get(line.id) || []} />
                                            </dd>
                                        </div>
                                    </dl>
                                </div>
                            ))}
                        </div>

                        <div className={`${tableCard} hidden lg:block`}>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className={tableHeadRow}>
                                        <th className={`${tableHeadCell} text-left px-2 py-2`}>Code</th>
                                        <th className={`${tableHeadCell} text-left px-2 py-2`}>On the invoice</th>
                                        <th className={`${tableHeadCell} text-left px-2 py-2`}>Pack</th>
                                        <th className={`${tableHeadCell} text-right px-2 py-2`}>Cases</th>
                                        <th className={`${tableHeadCell} text-right px-2 py-2`}>Single items</th>
                                        <th className={`${tableHeadCell} text-right px-2 py-2`}>Price per case</th>
                                        <th className={`${tableHeadCell} text-right px-2 py-2`}>Line total</th>
                                        <th className={`${tableHeadCell} text-right px-2 py-2`}>VAT</th>
                                        <th className={`${tableHeadCell} text-left px-2 py-2`}>Counted as</th>
                                        <th className={`${tableHeadCell} text-left px-2 py-2`}>Decision</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {lines.map(line => (
                                        <tr key={line.id} className="align-top">
                                            <td className="px-2 py-2 text-gray-900 tabular-nums whitespace-nowrap">{line.supplier_code}</td>
                                            <td className="px-2 py-2 text-gray-900 min-w-[10rem]">{line.raw_description}</td>
                                            <td className="px-2 py-2 text-gray-700 whitespace-nowrap">{line.pack_size}</td>
                                            <td className="px-2 py-2 text-right text-gray-900 tabular-nums">{qty(line.cases)}</td>
                                            <td className="px-2 py-2 text-right text-gray-900 tabular-nums">{qty(line.units)}</td>
                                            <td className="px-2 py-2 text-right text-gray-900 tabular-nums whitespace-nowrap">{money(line.price_per_case)}</td>
                                            <td className="px-2 py-2 text-right text-gray-900 font-medium tabular-nums whitespace-nowrap">{money(line.line_total)}</td>
                                            <td className="px-2 py-2 text-right text-gray-900 tabular-nums whitespace-nowrap"><Vat line={line} /></td>
                                            <td className="px-2 py-2"><CountedAs category={line.category} /></td>
                                            <td className="px-2 py-2 min-w-[9rem]">
                                                <Decision line={line} credit={credit} problems={problems.get(line.id) || []} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </ModalSection>

            {foot && lines.length > 0 && (
                <ModalSection
                    title="By category"
                    description={foot.byLine
                        ? 'What the lines come to under each category, VAT and deposits included. These are the figures on the invoice\'s row.'
                        : 'None of its lines has a category, so the whole invoice counts under the one it was filed under, as its row says.'}
                >
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm items-center">
                        {foot.split.map(s => (
                            <Fragment key={s.category}>
                                <dt><CountedAs category={s.category} /></dt>
                                <dd className="text-gray-900 font-semibold tabular-nums">{fmtMoney(s.amount)}</dd>
                            </Fragment>
                        ))}
                        {foot.uncategorised != null && (
                            <>
                                <dt><CountedAs category={null} /></dt>
                                <dd className="text-gray-900 font-semibold tabular-nums">{fmtMoney(foot.uncategorised)}</dd>
                            </>
                        )}
                    </dl>
                    {foot.uncategorised != null && (
                        <p className="text-xs text-muted mt-2">
                            A line with no category is not counted in the week&apos;s costs.
                        </p>
                    )}
                </ModalSection>
            )}

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Close</button>
            </div>
        </Modal>
    )
}

// Its share of the VAT, and of a container deposit where it carries one, so
// the line's figures add up to what it costs.
function Vat({ line }) {
    return (
        <>
            {money(line.vat_amount)}
            {num(line.deposit_amount) ? (
                <span className="block text-xs text-muted">{fmtMoney(line.deposit_amount)} deposit</span>
            ) : null}
        </>
    )
}

// What a line was counted as, in the colours and words of the row's badges.
// A line with none says so, in a plain pill so it is not read as Other.
function CountedAs({ category }) {
    if (!category) return <span className={toneBadge('plain')}>No category</span>
    const cat = invoiceCategory(category)
    return <span className={`${badge} border ${cat.soft}`}>{cat.label}</span>
}

// What was decided, which of our products and version it is matched to, and
// any delivery problem logged against it.
function Decision({ line, credit, problems }) {
    const said = lineDecision(line, { credit })
    const match = matchedTo(line)
    return (
        <div className="space-y-1">
            <span className={toneBadge(said.tone)}>{said.label}</span>
            {match && (
                <p className="text-sm text-gray-900">
                    {match.product}
                    {match.version && <span className="block text-xs text-muted">Version: {match.version}</span>}
                </p>
            )}
            {said.note && <p className="text-xs text-muted">{said.note}</p>}
            {problems.map(claim => (
                <div key={claim.id} className="pt-1">
                    <p className="text-xs text-muted">Delivery problem</p>
                    <Problem claim={claim} />
                </div>
            ))}
        </div>
    )
}

// One delivery problem: what was wrong and how many, what the door wrote,
// and where it is up to.
function Problem({ claim }) {
    const words = claimWords(claim)
    return (
        <div>
            <p className="text-sm text-gray-900">
                <span className={`${badge} border ${words.soft}`}>{words.label}</span>
                {words.what && <span> {words.what}</span>}
            </p>
            {words.said.map(s => <p key={s} className="text-sm text-gray-900 break-words">{s}</p>)}
            {words.state && <p className="text-xs text-muted">{words.state}</p>}
        </div>
    )
}
