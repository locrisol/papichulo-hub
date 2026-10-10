import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useConfirm } from '@/context/confirm'
import { fmtMoney } from '@/lib/format'
import { shortDate, dayLabel, stampDay } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { pilesOf } from '@/lib/invoiceImport'
import { prefillLink } from '@/lib/products'
import { readReview, rowsFor, reviewWriter } from '@/lib/reviewWrites'
import { requestFromLine, kindWords } from '@/lib/productRequests'
import { emailTheReview } from '@/lib/rosterMail'
import { can, BRAND_CHOICES } from '@/lib/access'
import { card, cardHeader, rowButton, badge } from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import MatchLineModal from '@/components/invoices/MatchLineModal'
import SendForReviewModal from '@/components/inventory/SendForReviewModal'
import { useRecountBadges } from '@/context/badges'

// What the week's invoices want somebody to decide, at the top of Import
// invoices.
//
// It was a page of its own, Review, until 5 October 2026, when he asked
// whether it needed to be: the sidebar's count sits on Import invoices, and
// what it counted was behind a plain button on another page. Uploading the
// week and deciding what it raised are one job, so they are one page now,
// this first because it is what the count is for. /invoices/review still
// opens here.
//
// **Nothing changes a cost without him.** An invoice proposes and he accepts,
// which is the whole reason this screen exists between the import and the
// prices. The food cost already moved when the document went in, because money
// spent is money spent. What a portion costs waits here.
//
// Three piles, and only one of them takes any thought most weeks. A line the
// same as last week's was settled as it was written, so the two hundred lines a
// twenty document week carries arrive here as a handful. **A line that has
// become the same as last week since** (another line with its code answered,
// a price typed) is settled the moment this reads it, with nothing to press:
// it was a fourth pile, Nothing to decide, that only ever held up the count
// and the report.
//
// It is set based on purpose: the same screen over a bigger batch rather than
// one document at a time, because the question "has anything moved" is about
// the week and not about one piece of paper.
//
// **It asks until every line is decided** (his answer, 30 September). It used
// to look back thirty days, and a line nobody got to dropped off without ever
// being answered: the week's cost had it, but the product's price never moved
// and its category stayed a guess.

const PILE_CARDS = [
    {
        key: 'new_to_us',
        title: 'Never bought before',
        under: 'A code nobody has ever bought under. Either it is new, or it is something we already have that the supplier has renamed, or it is not stock at all.',
    },
    {
        key: 'new_code',
        title: 'The same thing under a new code',
        under: 'A code we have never had, that reads like one we already buy. If the old code has stopped, it is a code update: one price and one price history for both. If the supplier sends either one depending on what it has, we usually buy both: each keeps its own price and neither is ever counted as bought instead of the other.',
    },
    {
        key: 'price_changed',
        title: 'The price changed',
        under: 'What the supplier charged is already in the week. This is only about what the Hub costs a portion at. Not now leaves the costing as it is, and the weekly report keeps saying so until the two agree.',
    },
]

// `refresh` is the page's, raised after an import, so this reads again.
export default function WaitingForDecision({ restaurantId, refresh: imported = 0 }) {
    const recountBadges = useRecountBadges()
    const { user } = useAuth()
    const confirm = useConfirm()
    const location = useLocation()
    // Owners and the super admin keep the brand's list, so only they set a
    // line aside or start a product from one. A store manager says which of
    // our products it is, or sends it for review (his design, 4 October).
    const keepsTheList = can(user, BRAND_CHOICES)

    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [said, setSaid] = useState('')
    const [busy, setBusy] = useState('')
    const [matching, setMatching] = useState(null)
    const [sending, setSending] = useState(null)
    const [refresh, setRefresh] = useState(0)
    // What is waiting on a review here: its lines are the owners' question.
    const [sent, setSent] = useState([])
    // A refresh follows something done here that the sidebar may count.
    useEffect(() => { if (refresh) recountBadges() }, [refresh, recountBadges])

    useEffect(() => {
        if (!restaurantId) return
        let alive = true

        async function load() {
            setError('')
            const { data: read, sent: waitingSent, error: failed } = await readReview(restaurantId)
            if (!alive) return
            if (failed) { setError(failed); return }
            setData(read)
            setSent(waitingSent)
        }

        load()
        return () => { alive = false }
    }, [restaurantId, refresh, imported])

    // The same matching the import ran, over the rows as they were stored.
    // See rowsFor.
    const rows = useMemo(() => rowsFor(data), [data])
    const piles = useMemo(() => pilesOf(rows), [rows])
    const waiting = rows.length - (piles.unchanged?.length || 0)

    // The same as last week by now, so settled with nothing to press, once a
    // list. A failure says so and is not tried again until the next read.
    const settled = useRef('')
    useEffect(() => {
        const list = piles.unchanged || []
        if (!data || !list.length) return
        const key = list.map(r => r.stored.id).join(',')
        if (settled.current === key) return
        settled.current = key
        reviewWriter({ restaurantId, userId: user?.id, data, rows }).clearUnchanged(list).then(failed => {
            if (failed) setError(`Lines the same as before could not be settled: ${failed}`)
            else setRefresh(n => n + 1)
        })
    }, [piles, data, rows, restaurantId, user])

    // Arriving from a link to it: the sidebar's count, the report, an old
    // bookmark to Review. Once, when there is something to show.
    const shown = useRef(false)
    useEffect(() => {
        if (shown.current || !data || location.hash !== '#waiting') return
        shown.current = true
        document.getElementById('waiting')?.scrollIntoView({ block: 'start' })
    }, [data, location.hash])

    const writer = reviewWriter({ restaurantId, userId: user?.id, data, rows, onSaid: setSaid })
    const { sameCode } = writer

    async function run(key, work) {
        setBusy(key)
        setError('')
        setSaid('')
        const failed = await work()
        setBusy('')
        if (failed) { setError(failed); return }
        setRefresh(n => n + 1)
    }

    // A delivery charge, a crate deposit, a fuel surcharge. They have codes and
    // they would turn up in this pile every single week.
    async function notStock(row) {
        const reason = await confirm({
            title: 'Not stock?',
            message: `${row.line.description} will stop being offered here, and lines carrying `
                + `code ${row.line.code} will still count towards the week's cost. `
                + 'This is for a delivery charge, a crate deposit and the like. For something '
                + 'ordered by mistake, use Leave this one instead.',
            confirmLabel: 'It is not stock',
        })
        if (!reason) return null
        return writer.notStock(row)
    }

    // To the owners, with everything they need to answer without the
    // invoice. Its lines stop asking here once it is saved: they are the
    // owners' question now, and they do not hold the report.
    async function sendForReview(row, said) {
        const { data: made, error: e1 } = await supabase.from('product_requests')
            .insert(requestFromLine(row, { restaurantId, userId: user?.id, ...said }))
            .select('id').single()
        if (e1) return friendlyError(e1)
        emailTheReview(made.id)
        setSaid(`Sent for review. ${row.line.description} stops asking here while the owners answer it.`)
        return null
    }

    // Nothing at all on the page while nothing waits: the page is for
    // importing then. A failed read still says so.
    if (!data) return error ? <ErrorBanner className="mb-4">{error}</ErrorBanner> : null
    if (waiting === 0 && sent.length === 0 && !said && !error) return null

    return (
        <section id="waiting" className="scroll-mt-24">
            <ErrorBanner className="mb-4">{error}</ErrorBanner>
            <Notice tone="good" className="mb-4">{said}</Notice>

            {waiting > 0 && (
                <p className="text-sm text-gray-700 mb-3">
                    <strong className="font-bold text-gray-900">Waiting for a decision:</strong>{' '}
                    {waiting} {waiting === 1 ? 'line' : 'lines'}, from every import so far.
                </p>
            )}

            {matching && (
                <MatchLineModal
                    row={matching}
                    products={data.products}
                    onClose={() => setMatching(null)}
                    onMatch={async chosen => {
                        setMatching(null)
                        await run('match', () => writer.matchTo(matching, chosen))
                    }}
                />
            )}

            {sending && (
                <SendForReviewModal
                    row={sending}
                    onClose={() => setSending(null)}
                    onSend={async said => {
                        setError('')
                        setSaid('')
                        const failed = await sendForReview(sending, said)
                        if (failed) return failed
                        setSending(null)
                        setRefresh(n => n + 1)
                        return null
                    }}
                />
            )}

            {PILE_CARDS.map(pile => (
                piles[pile.key]?.length > 0 && (
                    <div key={pile.key} className={`${card} mb-6 overflow-hidden`}>
                        <div className={`${cardHeader} flex items-center justify-between gap-3`}>
                            <span>{pile.title}</span>
                            <span className="normal-case tracking-normal font-normal">
                                {piles[pile.key].length}
                            </span>
                        </div>
                        <div className="p-4">
                            <p className="text-xs text-muted mb-4">{pile.under}</p>

                            <div className="space-y-3">
                                {piles[pile.key].map(row => (
                                    <ReviewRow
                                        key={row.stored.id}
                                        row={row}
                                        busy={busy}
                                        keepsTheList={keepsTheList}
                                        sameCodeCount={sameCode(row).length}
                                        onAccept={also => run(`accept-${row.stored.id}`, () => writer.accept(row, also))}
                                        onReject={() => run(`reject-${row.stored.id}`, () => writer.reject(row))}
                                        onSameProduct={() => run(`same-${row.stored.id}`, () => writer.sameProduct(row))}
                                        onBuyBoth={() => run(`both-${row.stored.id}`, () => writer.buyBoth(row))}
                                        onMatch={() => setMatching(row)}
                                        onNotStock={() => run(`skip-${row.stored.id}`, () => notStock(row))}
                                        onLeave={() => run(`leave-${row.stored.id}`, () => writer.leaveOne(row))}
                                        onSend={() => setSending(row)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )
            ))}

            {sent.length > 0 && (
                <div className={`${card} mb-6 overflow-hidden`}>
                    <div className={`${cardHeader} flex items-center justify-between gap-3`}>
                        <span>Sent for review</span>
                        <span className="normal-case tracking-normal font-normal">{sent.length}</span>
                    </div>
                    <div className="p-4">
                        <p className="text-xs text-muted mb-3">
                            Waiting on a review. Their lines are not asked about here, and they do not hold
                            the weekly report.
                        </p>
                        <ul className="divide-y divide-border">
                            {sent.map(request => (
                                <li key={request.id} className="py-2 first:pt-0 last:pb-0">
                                    <p className="text-sm font-bold text-gray-900">
                                        {request.description || request.name}
                                    </p>
                                    <p className="text-xs text-muted mt-0.5">
                                        {[
                                            kindWords(request),
                                            request.supplier_code && `code ${request.supplier_code}`,
                                            `sent ${dayLabel(stampDay(request.sent_at))}`,
                                        ].filter(Boolean).join(', ')}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </section>
    )
}

// One line, and what can be done about it.
function ReviewRow({
    row, busy, keepsTheList, sameCodeCount, onAccept, onReject, onSameProduct, onBuyBoth, onMatch, onNotStock,
    onLeave, onSend,
}) {
    const { line, stored, supplier, pile } = row
    const doc = stored.invoices

    return (
        <div className="border border-border rounded-lg p-3">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">{line.description}</p>
                    <p className="text-xs text-muted mt-0.5">
                        {supplier?.name || 'Unknown supplier'}, code {line.code}
                        {line.pack_size ? `, ${line.pack_size}` : ''}, on{' '}
                        {doc.document_type === 'credit' ? 'credit note' : 'invoice'}{' '}
                        {doc.invoice_number} of {shortDate(doc.invoice_date)}
                    </p>
                </div>
                <span className={`${badge} border bg-gray-100 text-gray-700 border-gray-300 tabular-nums`}>
                    {fmtMoney(line.price_per_case)} a case
                </span>
            </div>

            {pile === 'price_changed' && (
                <div className="mb-3">
                    <p className="text-sm text-gray-900">
                        <span className="tabular-nums">{fmtMoney(row.was)}</span>
                        {' to '}
                        <span className="tabular-nums font-bold">{fmtMoney(row.now)}</span>
                        {row.perUnitNow != null && (
                            <span className="text-muted">
                                {' '}({fmtMoney(row.perUnitWas)} to {fmtMoney(row.perUnitNow)} a unit)
                            </span>
                        )}
                    </p>
                    {row.packMoved && (
                        <p className="text-xs text-amber-800 mt-1">
                            <strong className="font-bold">The pack changed as well.</strong>{' '}
                            {row.price.units_per_case} to {row.wantedUnits} in a case, so this is a
                            second price rather than a change to the one we have. The pack we cost
                            from today is not the pack on this invoice.
                        </p>
                    )}
                </div>
            )}

            {pile === 'new_code' && row.successor && (
                <p className="text-sm text-gray-900 mb-3">
                    This looks like <strong className="font-bold">{row.successor.last_description}</strong>,
                    bought under code {row.successor.supplier_code}
                    {row.successor.stillBought
                        ? `, which is still coming as well (last on ${shortDate(row.successor.last_seen_on)}).`
                        : ` and not seen since ${shortDate(row.successor.last_seen_on)}.`}
                </p>
            )}

            {sameCodeCount > 1 && (
                <p className="text-xs text-muted mb-2">
                    This code is on {sameCodeCount} lines in here. Deciding once does every one of
                    them at the same price.
                </p>
            )}

            <div className="flex flex-wrap gap-2">
                {pile === 'price_changed' && !row.packMoved && (
                    <>
                        <button type="button" disabled={!!busy} onClick={() => onAccept(false)} className={rowButton('good')}>
                            Cost from the new price
                        </button>
                        <button type="button" disabled={!!busy} onClick={onReject} className={rowButton()}>
                            Not now
                        </button>
                    </>
                )}

                {pile === 'price_changed' && row.packMoved && (
                    <>
                        <button type="button" disabled={!!busy} onClick={() => onAccept(true)} className={rowButton('good')}>
                            Add the pack and cost from it
                        </button>
                        <button type="button" disabled={!!busy} onClick={() => onAccept(false)} className={rowButton()}>
                            Add the pack, keep the old one
                        </button>
                        <button type="button" disabled={!!busy} onClick={onReject} className={rowButton()}>
                            Not now
                        </button>
                    </>
                )}

                {pile === 'new_code' && (
                    <>
                        <button type="button" disabled={!!busy} onClick={onSameProduct} className={rowButton('good')}>
                            Same thing, this is a code update
                        </button>
                        <button type="button" disabled={!!busy} onClick={onBuyBoth} className={rowButton('good')}>
                            Same thing, we usually buy both
                        </button>
                    </>
                )}

                {(pile === 'new_to_us' || pile === 'new_code') && (
                    <button type="button" disabled={!!busy} onClick={onMatch} className={rowButton('edit')}>
                        One of our products
                    </button>
                )}

                {(pile === 'new_to_us' || pile === 'new_code') && !keepsTheList && (
                    <button type="button" disabled={!!busy} onClick={onSend} className={rowButton()}>
                        Send for review
                    </button>
                )}

                {(pile === 'new_to_us' || pile === 'new_code') && keepsTheList && (
                    <>
                        <Link
                            to={prefillLink('/catalogue/products', {
                                name: tidyName(line.description),
                                section: SECTION_FOR[line.storage] || 'Dry',
                                unit: 'KG',
                                supplierId: row.supplierId,
                                code: line.code,
                                pricePerCase: line.price_per_case,
                                unitsPerCase: row.wantedUnits,
                                back: '/invoices/import',
                            })}
                            className={rowButton()}
                        >
                            Make it a new product
                        </Link>
                        <button type="button" disabled={!!busy} onClick={onLeave} className={rowButton()}>
                            Leave this one
                        </button>
                        <button type="button" disabled={!!busy} onClick={onNotStock} className={rowButton()}>
                            Not stock
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

// The band the line sat under on the page already says where a thing is kept,
// so the creation form opens on the right section rather than on the first one
// in the list.
const SECTION_FOR = { frozen: 'Freezer', chilled: 'Cold Room', ambient: 'Dry' }

// A supplier writes in capitals and the catalogue does not. Title case is a
// better starting point than shouting, and it is a starting point: whoever
// creates the product types the name they actually use.
function tidyName(said) {
    return String(said || '')
        .toLowerCase()
        .replace(/\b[a-z]/g, c => c.toUpperCase())
}
