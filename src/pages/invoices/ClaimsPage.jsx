import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { fmtMoney } from '@/lib/format'
import { todayISO, shortDate, fullDate, addDays } from '@/lib/dates'
import { orderByUse } from '@/lib/supplierOrder'
import { numberField } from '@/lib/numberInput'
import { friendlyError } from '@/lib/errors'
import { can, MANAGERS } from '@/lib/access'
import {
    claimKind, doorClaimPayload, claimWorking, notTheDocket, claimIsOpen, claimWeek, sentWeeks, fromEarlierWeeks,
    claimCandidates, claimMatch, otherDeliveries, byInvoice, chasingList, isLate, LATE_AFTER_DAYS, bySupplier,
} from '@/lib/invoiceClaims'
import {
    card, cardHeader, pageTitle, primaryButton, secondaryButton, rowButton, badge,
    hintClass, captionClass, tableCard, tableHeadRow, tableHeadCell, compactField, infoNote,
} from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import DoorClaimModal from '@/components/invoices/DoorClaimModal'

// What was wrong with a delivery, and what has come back.
//
// **The claim is the reason. The credit is the money.** The supplier never
// credits anything that was not asked for at the door, so a credit note is
// always the answer to a question somebody asked in person, and it never says
// what the question was.
//
// The half that earns its keep is the other way round. If two trays are queried
// at the door and no credit ever arrives, nothing in the Hub would know: it
// only ever sees documents, and there is no document for something that did not
// happen. Credits ran at 6% of spend over the month this was designed against,
// so the forgotten ones are real money. This list is what makes them visible.
//
// Everybody can open it and everybody can log one, which is the whole point.
// An employee sees their own notes and none of the money, here and in the
// database, because a claim carries an amount once it is matched to a line.

const LOOK_BACK_DAYS = 60

// Where a claim's money now comes off, once it is written. claimWeek's answer.
function landsSaid(amount, { week, delivered, moved }) {
    if (!moved) return `${fmtMoney(amount)} is coming off the week that delivery landed in.`
    return `The report for the week of ${shortDate(delivered)} has already been sent, `
        + `so ${fmtMoney(amount)} is coming off the week of ${shortDate(week)} instead, `
        + `shown as from the delivery in the week of ${shortDate(delivered)}.`
}

// A write guarded on how the claim was when the page read it changes nothing
// once it has moved on, a credit settling it say, and that has to be said
// rather than reported as done. Null when it went through.
function changedSince(rows) {
    return rows && !rows.length
        ? 'Nothing changed: that problem has moved on since this page was read. Have a look again.'
        : null
}

// A line as the claim row and the panels name it: what it is and its pack.
function lineName(line) {
    return [line?.raw_description, line?.pack_size].filter(Boolean).join(' ')
}

export default function ClaimsPage() {
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const restaurantId = activeRestaurant?.id
    const manager = can(user, MANAGERS)

    const [claims, setClaims] = useState([])
    const [invoices, setInvoices] = useState([])
    const [suppliers, setSuppliers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [said, setSaid] = useState('')
    const [logging, setLogging] = useState(false)
    const [busy, setBusy] = useState('')
    const [refresh, setRefresh] = useState(0)

    useEffect(() => {
        if (!restaurantId) return
        let alive = true

        async function load() {
            setLoading(true)
            // Cleared here rather than only on the way out. A banner that is
            // set once and never unset outlives the thing it was about: fix the
            // database, come back, and the page is still complaining about a
            // read that now works perfectly well.
            setError('')
            const from = addDays(todayISO(), -LOOK_BACK_DAYS)

            const [sup, cl, inv] = await Promise.all([
                supabase.from('suppliers').select('id, name').eq('is_active', true),
                // An employee reads their own through my_claims, which has no
                // euros: no amount, nothing credited, no invoice. With no
                // amount a claim is still waiting for as long as it is open,
                // which is what claimIsOpen says, and a credit that covers it
                // in full closes it.
                supabase.from(manager ? 'invoice_line_claims' : 'my_claims')
                    .select('*')
                    .eq('restaurant_id', restaurantId)
                    .gte('raised_on', from)
                    .order('raised_on', { ascending: false }),
                // Only a manager can see the invoices, so the documents
                // are only asked for where they can be used.
                manager
                    ? supabase.from('invoices')
                        .select('id, invoice_number, invoice_date, supplier_id, document_type, total_amount, invoice_lines(id, raw_description, pack_size, cases, units, price_per_case, units_per_case, unit_price, line_total, vat_amount, deposit_amount, supplier_code, product_supplier_prices(price_per_case))')
                        .eq('restaurant_id', restaurantId)
                        .gte('invoice_date', from)
                        .order('invoice_date', { ascending: false })
                        .order('id')
                    : Promise.resolve({ data: [] }),
            ])

            if (!alive) return
            const failed = sup.error || cl.error || inv.error
            if (failed) { setError(friendlyError(failed)); setLoading(false); return }

            // Most used first, the order the Invoices page offers them in. An
            // employee cannot read the invoices, so for them it is the
            // problems they have logged, which puts the supplier they deal
            // with at the door at the top after the first one.
            setSuppliers(orderByUse(sup.data || [], [...(inv.data || []), ...(cl.data || [])]))
            setClaims(cl.data || [])
            setInvoices(inv.data || [])
            setLoading(false)
        }

        load()
        return () => { alive = false }
    }, [restaurantId, manager, refresh])

    const waiting = useMemo(() => chasingList(claims, todayISO()), [claims])
    const perSupplier = useMemo(
        () => (manager ? bySupplier(claims, suppliers, todayISO()) : []),
        [manager, claims, suppliers],
    )
    const settled = useMemo(() => claims.filter(c => !claimIsOpen(c)), [claims])
    const owed = waiting.reduce((total, w) => total + (w.balance || 0), 0)

    async function logIt(form) {
        const row = doorClaimPayload(form, {
            restaurantId, raisedBy: user?.id, today: todayISO(),
        })
        const { error: e1 } = await supabase.from('invoice_line_claims').insert(row)
        if (e1) return friendlyError(e1)

        setLogging(false)
        // Told to wait only when there is nothing to pick from yet. Its
        // invoice can already be in, and a note with no docket is offered the
        // deliveries around that day straight away.
        setSaid(!manager
            ? 'Logged. A manager will put it against the invoice once it comes in.'
            : claimCandidates(row, invoices).lines.length
                ? 'Logged. Say which line it was below.'
                : 'Logged. Once its invoice is imported, say which line it was below.')
        setRefresh(n => n + 1)
        return null
    }

    // Putting a note against the line it was about.
    //
    // Attaching a claim to the wrong line moves money off the wrong product and
    // nothing would ever say so, so it is always somebody's tap. The Hub only
    // suggests one when the docket number was written down and one line on
    // that document plainly matches. Everything else is a list to choose from.
    //
    // **Nothing is written until the money has been read back** (weigh, then
    // the panel on the row). On 2 October one tap put a note for docket
    // 45747318 on another delivery's line, priced three bags as three kilos,
    // and moved it a week, and all of it was only said afterwards.
    async function weigh(claim, line, invoice, priced = {}) {
        const working = claimWorking(claim, line, priced)
        if (working.problem) return { problem: working.problem }
        // Which weeks have gone out already, so the money lands in a report.
        // See claimWeek.
        const { weeks: sent, error: e0 } = await sentWeeks(supabase, restaurantId)
        if (e0) return { problem: friendlyError(e0) }
        return { ...working, ...claimWeek(invoice.invoice_date, sent) }
    }

    // `otherDelivery` is the panel having said, in bold, that this is not the
    // invoice written on the note. Without it a mismatch is refused, so
    // nothing can put a note on another delivery without that being said.
    async function attach(claim, line, invoice, { otherDelivery = false, ...priced } = {}) {
        setError('')
        setSaid('')
        if (notTheDocket(claim, invoice) && !otherDelivery) {
            setError(`That isn't invoice ${claim.docket_number}, the one written on the note.`)
            return false
        }
        setBusy(claim.id)
        const weighed = await weigh(claim, line, invoice, priced)
        if (weighed.problem) { setBusy(''); setError(weighed.problem); return false }
        const { amount, week } = weighed

        // Only while it is still waiting for its line with nothing back on it.
        // The panel stays open until the yes, and a credit for its docket can
        // settle it meanwhile; a write then would move money a credit already
        // put in its week.
        const { data, error: e1 } = await supabase.from('invoice_line_claims')
            .update({
                invoice_id: invoice.id,
                invoice_line_id: line.id,
                amount,
                supplier_id: invoice.supplier_id,
                counted_week: week,
            })
            .eq('id', claim.id)
            .eq('status', 'open')
            .is('invoice_line_id', null)
            .eq('credited_amount', 0)
            .is('credit_invoice_id', null)
            .select('id')

        setBusy('')
        if (e1) { setError(friendlyError(e1)); return false }
        // True either way, so the panel closes and the row shows it as it is now.
        setSaid(changedSince(data) || landsSaid(amount, weighed))
        setRefresh(n => n + 1)
        return true
    }

    async function close(claim, status) {
        setBusy(claim.id)
        const { error: e1 } = await supabase.from('invoice_line_claims')
            .update({ status, settled_on: todayISO() })
            .eq('id', claim.id)
        setBusy('')
        if (e1) { setError(friendlyError(e1)); return }
        setRefresh(n => n + 1)
    }

    return (
        <>
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className={pageTitle}>Delivery problems</h2>
                    <p className="text-sm text-gray-500 mt-1">{activeRestaurant?.name}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setLogging(true)} className={primaryButton()}>
                        Log a problem
                    </button>
                    {manager && <Link to="/invoices/import" className={secondaryButton}>Import invoices</Link>}
                </div>
            </div>

            {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}
            {said && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{said}</div>}

            <div className={`${card} p-4 mb-6`}>
                <p className="text-sm text-gray-900">
                    <strong className="font-bold">Say it at the door or it never happens.</strong>{' '}
                    They do not credit anything that was not queried when it arrived, so this list
                    is the only record of what was asked for.
                </p>
                {manager && (
                    <p className={hintClass}>
                        Anything still open after {LATE_AFTER_DAYS} days is worth a phone call.
                        Every credit over the month this was designed against arrived the same day
                        or the next.
                    </p>
                )}
            </div>

            {logging && (
                <DoorClaimModal
                    suppliers={suppliers}
                    onClose={() => setLogging(false)}
                    onSave={logIt}
                />
            )}

            {loading && <p className="text-sm text-muted">Reading...</p>}

            {!loading && (
                <div className={`${card} mb-6 overflow-hidden`}>
                    <div className={`${cardHeader} flex items-center justify-between gap-3`}>
                        <span>Still waiting</span>
                        <span className="normal-case tracking-normal font-normal">
                            {manager && owed > 0 ? fmtMoney(owed) : waiting.length}
                        </span>
                    </div>
                    <div className="p-4">
                        {waiting.length === 0 && (
                            <p className="text-sm text-muted italic">
                                Nothing open. Everything asked for has come back.
                            </p>
                        )}
                        <div className="space-y-3">
                            {waiting.map(({ claim, balance, days }) => (
                                <ClaimRow
                                    key={claim.id}
                                    claim={claim}
                                    balance={balance}
                                    days={days}
                                    late={isLate({ days })}
                                    manager={manager}
                                    busy={busy === claim.id}
                                    suppliers={suppliers}
                                    invoices={invoices}
                                    onWeigh={weigh}
                                    onAttach={attach}
                                    onClose={close}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* How each supplier does, which is the conversation this list is
                really for. Two figures nobody in the building has ever been
                able to put a number on: how much of what was asked for came
                back, and how long it took. */}
            {!loading && manager && perSupplier.length > 0 && (
                <div className={`${tableCard} mb-6`}>
                    <table className="w-full">
                        <thead>
                            <tr className={tableHeadRow}>
                                <th className={`${tableHeadCell} text-left px-4 py-2`}>Supplier</th>
                                <th className={`${tableHeadCell} text-right px-4 py-2`}>Asked</th>
                                <th className={`${tableHeadCell} text-right px-4 py-2`}>Back</th>
                                <th className={`${tableHeadCell} text-right px-4 py-2`}>Waiting</th>
                                <th className={`${tableHeadCell} text-right px-4 py-2`}>Usual wait</th>
                                <th className={`${tableHeadCell} text-right px-4 py-2`}>Oldest</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {perSupplier.map(row => (
                                <tr key={row.supplierId || 'none'}>
                                    <td className="px-4 py-2 text-sm text-gray-900">
                                        {row.name}
                                        <span className="text-xs text-muted">
                                            {' '}&#183; {row.raised} raised
                                            {row.refused ? `, ${row.refused} refused` : ''}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-sm text-right tabular-nums">
                                        {fmtMoney(row.asked)}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-right tabular-nums">
                                        {fmtMoney(row.credited)}
                                        {row.backPct != null && (
                                            <span className="text-xs text-muted"> {row.backPct}%</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-right tabular-nums font-semibold">
                                        {row.waiting > 0 ? fmtMoney(row.waiting) : ''}
                                    </td>
                                    <td className="px-4 py-2 text-sm text-right tabular-nums text-muted">
                                        {row.typicalDays == null
                                            ? ''
                                            : `${row.typicalDays} ${row.typicalDays === 1 ? 'day' : 'days'}`}
                                    </td>
                                    <td className={`px-4 py-2 text-sm text-right tabular-nums ${
                                        row.oldest >= LATE_AFTER_DAYS ? 'font-bold text-amber-800' : 'text-muted'
                                    }`}
                                    >
                                        {row.oldest == null
                                            ? ''
                                            : `${row.oldest} ${row.oldest === 1 ? 'day' : 'days'}`}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && settled.length > 0 && (
                <div className={`${card} overflow-hidden`}>
                    <div className={cardHeader}>Finished</div>
                    <div className="p-4 space-y-2">
                        {settled.map(claim => {
                            const kind = claimKind(claim.kind)
                            return (
                                <div key={claim.id} className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className={`${badge} border ${kind.soft}`}>{kind.label}</span>
                                    <span className="line-through text-muted">{claim.what}</span>
                                    <span className="text-xs text-muted">
                                        {shortDate(claim.raised_on)}
                                        {claim.status === 'refused' ? ', they said no' : ''}
                                        {claim.status === 'void' ? ', taken back' : ''}
                                    </span>
                                    {manager && claim.credited_amount > 0 && (
                                        <span className="text-xs font-semibold text-green-700 tabular-nums">
                                            {fmtMoney(claim.credited_amount)} back
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </>
    )
}

function ClaimRow({
    claim, balance, days, late, manager, busy, suppliers, invoices, onWeigh, onAttach, onClose,
}) {
    const kind = claimKind(claim.kind)
    const supplier = suppliers.find(s => s.id === claim.supplier_id)
    const [picking, setPicking] = useState(false)
    // The docket written down is not in the Hub, and somebody says it was a
    // different delivery anyway, a number copied wrong.
    const [other, setOther] = useState(false)
    // A price query is worth the difference, so it waits here for the price
    // that should have been charged before it is put against the line.
    const [pricing, setPricing] = useState(null)
    // The money read back before anything is written, with the invoice, the
    // week it comes off, and whether it is the docket on the note.
    const [confirming, setConfirming] = useState(null)
    const [problem, setProblem] = useState('')
    const [weighing, setWeighing] = useState(false)

    async function choose(line, invoice, priced = null) {
        setProblem('')
        if (claim.kind === 'price' && !priced) {
            const costingFrom = line.product_supplier_prices?.price_per_case
            setPricing({ line, invoice, agreed: costingFrom == null ? '' : String(costingFrom) })
            return
        }
        setWeighing(true)
        const weighed = await onWeigh(claim, line, invoice, priced || {})
        setWeighing(false)
        if (weighed.problem) { setProblem(weighed.problem); return }
        setPricing(null)
        setConfirming({ line, invoice, priced: priced || {}, other: notTheDocket(claim, invoice), ...weighed })
    }

    async function yes() {
        const { line, invoice, priced, other } = confirming
        if (await onAttach(claim, line, invoice, { ...priced, otherDelivery: other })) setConfirming(null)
    }

    // A claim whose delivery's report had already gone out comes off a later
    // week (claimWeek). Said here so nobody looks for it in the wrong report.
    const from = manager ? fromEarlierWeeks([claim], invoices, claim.counted_week)[0] : null

    // Always offered rather than done. With a docket number, only that
    // document's lines, and nothing until it is imported.
    const open = manager && !claim.invoice_line_id
    const suggestion = open ? claimMatch(claim, invoices) : null
    const found = open ? claimCandidates(claim, invoices) : null

    return (
        <div className={`border rounded-lg p-3 ${late ? 'border-amber-300 bg-amber-50/50' : 'border-border'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`${badge} border ${kind.soft}`}>{kind.label}</span>
                        <span className="text-sm font-bold text-gray-900">{claim.what}</span>
                    </div>
                    <p className="text-xs text-muted mt-1">
                        {supplier?.name || 'Unknown supplier'}, {fullDate(claim.raised_on)}
                        {claim.docket_number ? `, docket ${claim.docket_number}` : ', no docket number'}
                        {' '}&#183;{' '}
                        {[
                            Number(claim.cases) ? `${claim.cases} cases` : null,
                            Number(claim.units) ? `${claim.units} units` : null,
                        ].filter(Boolean).join(' and ')}
                    </p>
                    {claim.note && <p className="text-xs text-muted mt-1 italic">{claim.note}</p>}
                    {from && (
                        <p className="text-xs text-muted mt-1">
                            Comes off the week of {shortDate(claim.counted_week)}, from the delivery in the week
                            of {shortDate(from.delivered)}.
                        </p>
                    )}
                </div>

                <div className="text-right">
                    {manager && balance != null && (
                        <p className="text-sm font-bold text-gray-900 tabular-nums">{fmtMoney(balance)}</p>
                    )}
                    <p className={`text-xs ${late ? 'font-bold text-amber-800' : 'text-muted'}`}>
                        {days === 0 ? 'today' : `${days} ${days === 1 ? 'day' : 'days'} ago`}
                    </p>
                </div>
            </div>

            {manager && !claim.invoice_line_id && (
                <div className="mt-3">
                    {problem && <ErrorBanner className="mb-2">{problem}</ErrorBanner>}
                    {/* One thing at a time: while a line is being priced or
                        read back, the list it came from waits. */}
                    {!pricing && !confirming && (found.waiting ? (
                        <>
                            <p className="text-sm text-gray-900 mb-2">
                                {`Invoice ${claim.docket_number} isn't in the Hub yet. `
                                    + "Once it's imported, its lines show here."}
                            </p>
                            <button
                                type="button"
                                onClick={() => { setProblem(''); setOther(o => !o) }}
                                className={rowButton()}
                            >
                                {other ? 'Never mind' : 'It was a different delivery'}
                            </button>
                            {other && (
                                <LinePicker
                                    lines={otherDeliveries(claim, invoices)}
                                    note={`None of these is invoice ${claim.docket_number}.`}
                                    busy={busy || weighing}
                                    onChoose={choose}
                                />
                            )}
                        </>
                    ) : suggestion ? (
                        <>
                            <p className="text-xs text-muted mb-2">
                                Docket {claim.docket_number} has{' '}
                                <strong className="font-bold">{suggestion.line.raw_description}</strong> on
                                it, and nothing else on that document is much like it.
                            </p>
                            <button
                                type="button"
                                disabled={busy || weighing}
                                onClick={() => choose(suggestion.line, suggestion.invoice)}
                                className={rowButton('good')}
                            >
                                That is the one
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => { setProblem(''); setPicking(p => !p) }}
                                className={rowButton('edit')}
                            >
                                {picking ? 'Never mind' : 'Say which line this was'}
                            </button>
                            {picking && <LinePicker lines={found.lines} busy={busy || weighing} onChoose={choose} />}
                        </>
                    ))}

                    {/* The goods arrived and were kept, so what is coming back is
                        the overcharge and not the line. It starts from what the
                        Hub costs that product at, which is the price that was
                        agreed unless somebody says otherwise. */}
                    {pricing && (
                        <div className={`mt-3 ${infoNote}`}>
                            <label className="text-xs text-blue-900 block mb-1" htmlFor={`agreed-${claim.id}`}>
                                <strong className="font-bold">{pricing.line.raw_description}</strong> came in at{' '}
                                {fmtMoney(pricing.line.price_per_case)} a case. What should they have charged?
                            </label>
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    id={`agreed-${claim.id}`}
                                    {...numberField({
                                        value: pricing.agreed,
                                        onChange: agreed => setPricing(p => ({ ...p, agreed })),
                                        decimals: 2,
                                    })}
                                    className={`${compactField} w-28`}
                                />
                                <button
                                    type="button"
                                    disabled={busy || weighing || pricing.agreed === ''}
                                    onClick={() => choose(pricing.line, pricing.invoice, {
                                        agreedPerCase: Number(pricing.agreed),
                                    })}
                                    className={rowButton('good')}
                                >
                                    That is the price
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setProblem(''); setPricing(null) }}
                                    className={rowButton()}
                                >
                                    Never mind
                                </button>
                            </div>
                            <p className="text-xs text-blue-900 mt-1">
                                The claim is the difference on {Number(claim.cases) || 0} cases
                                {Number(claim.units) ? ` and ${claim.units} units` : ''}, not the whole line.
                            </p>
                        </div>
                    )}

                    {confirming && (
                        <div className={`mt-3 ${infoNote} space-y-1`}>
                            <p className="font-semibold">{confirming.words}</p>
                            <p>
                                On invoice {confirming.invoice.invoice_number} of{' '}
                                {shortDate(confirming.invoice.invoice_date)}, {lineName(confirming.line)}.
                            </p>
                            <p>
                                {confirming.moved
                                    ? `The report for the week of ${shortDate(confirming.delivered)} has gone out, `
                                        + `so it comes off the week of ${shortDate(confirming.week)}.`
                                    : `It comes off the week of ${shortDate(confirming.week)}.`}
                            </p>
                            {confirming.other && (
                                <p className="font-bold">
                                    {`This isn't invoice ${claim.docket_number}, the one written on the note.`}
                                </p>
                            )}
                            <div className="flex flex-wrap gap-2 pt-2">
                                <button type="button" disabled={busy} onClick={yes} className={rowButton('good')}>
                                    Yes, that line
                                </button>
                                <button type="button" onClick={() => setConfirming(null)} className={rowButton()}>
                                    Never mind
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {manager && (
                <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => onClose(claim, 'refused')} className={rowButton()}>
                        They said no
                    </button>
                    <button type="button" disabled={busy} onClick={() => onClose(claim, 'void')} className={rowButton()}>
                        Take it back
                    </button>
                </div>
            )}

            {!manager && (
                <p className={`${captionClass} mt-2 normal-case tracking-normal font-normal text-muted`}>
                    Logged. A manager will put it against the invoice once it comes in.
                </p>
            )}
        </div>
    )
}

// The lines to choose from, under a heading for each delivery so nobody takes
// one delivery's Chorizo for another's. The closest words come first in each,
// and a long invoice shows its first few until asked for the rest.
const FIRST_LINES = 5

function LinePicker({ lines, note, busy, onChoose }) {
    const [whole, setWhole] = useState(() => new Set())
    const groups = byInvoice(lines)

    if (!groups.length) {
        return <p className={`${hintClass} mt-2`}>No invoice from them has come in for around that day.</p>
    }

    return (
        <div className="mt-2 space-y-3">
            {note && <p className="text-xs text-muted">{note}</p>}
            {groups.map(({ invoice, lines: on }) => {
                const shown = whole.has(invoice.id) ? on : on.slice(0, FIRST_LINES)
                return (
                    <div key={invoice.id}>
                        <p className="text-xs font-semibold text-gray-700 mb-1">
                            Invoice {invoice.invoice_number}, {shortDate(invoice.invoice_date)}
                        </p>
                        <ul className="space-y-1">
                            {shown.map(({ line }) => (
                                <li key={line.id}>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => onChoose(line, invoice)}
                                        className="w-full text-left text-sm px-3 py-2 rounded-lg border border-border hover:bg-gray-50"
                                    >
                                        <span className="font-semibold">{line.raw_description}</span>
                                        <span className="text-xs text-muted">
                                            {' '}{[line.pack_size, `${fmtMoney(line.price_per_case)} a case`]
                                                .filter(Boolean).join(', ')}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {shown.length < on.length && (
                            <button
                                type="button"
                                onClick={() => setWhole(all => new Set(all).add(invoice.id))}
                                className={`${rowButton()} mt-1`}
                            >
                                Show all {on.length} lines
                            </button>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
