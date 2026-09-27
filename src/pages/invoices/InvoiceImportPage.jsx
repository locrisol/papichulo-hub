import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { weekStartOf, todayISO, addDays } from '@/lib/dates'
import { fmtMoney } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { readPdfText } from '@/lib/pdfText'
import {
    readDocument, whereItGoes, placeDocument, matchLines, pilesOf, documentTotals,
    documentBlocks, linePayload, invoicePayload, fillInPayload, fillInClaim, creditOnHandEntry,
    documentTotal,
} from '@/lib/invoiceImport'
import { mainCategory } from '@/lib/invoiceCategories'
import { creditSettles } from '@/lib/invoiceClaims'
import { orderByUse, USE_WINDOW_DAYS } from '@/lib/supplierOrder'
import { codeRow, seenAgain } from '@/lib/priceEvents'
import {
    card, cardHeader, pageTitle, primaryButton, secondaryButton, hintClass,
} from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import DocumentCard from '@/components/invoices/DocumentCard'
import LinkAccountModal from '@/components/invoices/LinkAccountModal'
import FillInModal from '@/components/invoices/FillInModal'
import StillMissing from '@/components/invoices/StillMissing'

// Reading a week of invoices in one go.
//
// About twenty documents a week arrive, on a busy day eight, and every one of
// them used to be a supplier, a date and a total typed into a box. The
// documents are text, so all of that is already on the page and the only thing
// worth a person's attention is the handful of lines that changed.
//
// **Nothing is written until every file has been looked at.** The card for each
// one says which restaurant it lands in, which week, and what it comes to split
// by category, because those are the three things that are invisible
// afterwards. A file that does not add up cannot be imported at all.

export default function InvoiceImportPage() {
    const { user } = useAuth()
    const { activeRestaurant, restaurants } = useRestaurant()
    const restaurantId = activeRestaurant?.id

    const [files, setFiles] = useState([])
    const [reading, setReading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [said, setSaid] = useState('')
    const [known, setKnown] = useState(null)
    const [linking, setLinking] = useState(null)
    const [fillingIn, setFillingIn] = useState(null)
    // Credits somebody has said were not taken off by hand, so they go in.
    const [allowed, setAllowed] = useState(() => new Set())
    // Bumped after anything goes in, so the list of what is still to
    // download is read again and the documents just imported drop off it.
    const [checked, setChecked] = useState(0)
    const picker = useRef(null)

    // Everything the matching needs, read once. A batch of twenty files asking
    // for the same four lists twenty times is twenty times the waiting for
    // exactly the same answer.
    useEffect(() => {
        if (!restaurantId) return
        let alive = true

        async function load() {
            // See the comment on the same line in ClaimsPage: a banner that is
            // never cleared outlives the thing it was about.
            setError('')
            const [accounts, suppliers, prices, codes, held, documents] = await Promise.all([
                supabase.from('supplier_accounts').select('*'),
                supabase.from('suppliers').select('id, name, category, is_active'),
                supabase.from('product_supplier_prices')
                    .select('*, products(id, name, section, unit, piece_weight)')
                    .eq('restaurant_id', restaurantId),
                supabase.from('supplier_codes').select('*').eq('restaurant_id', restaurantId),
                supabase.from('invoices')
                    .select('id, invoice_number, invoice_date, total_amount, supplier_id')
                    .eq('restaurant_id', restaurantId),
                // The supplier's own list, where it has been pasted. It is what
                // says for certain whether a credit was already taken off a
                // total typed by hand.
                supabase.from('supplier_documents').select('*').eq('restaurant_id', restaurantId),
            ])

            if (!alive) return
            const failed = [accounts, suppliers, prices, codes, held, documents].map(r => r.error).find(Boolean)
            if (failed) { setError(friendlyError(failed)); return }

            // In the order the Invoices page offers them, most used first.
            const recent = addDays(todayISO(), -USE_WINDOW_DAYS)
            setKnown({
                accounts: accounts.data || [],
                suppliers: orderByUse(
                    suppliers.data || [],
                    (held.data || []).filter(h => h.invoice_date >= recent),
                ),
                documents: documents.data || [],
                prices: prices.data || [],
                codes: codes.data || [],
                held: held.data || [],
            })
        }

        load()
        return () => { alive = false }
    }, [restaurantId])

    // One file, from bytes to a card.
    //
    // The reading happens here and the deciding happens in lib, so everything
    // below the parse can be tested without a PDF engine or a browser.
    async function look(file) {
        const base = { key: `${file.name}-${file.lastModified}`, name: file.name, state: 'working' }
        try {
            const { items } = await readPdfText(file)
            const doc = readDocument(items)
            if (!doc) {
                return { ...base, state: 'blocked', blocks: ['That file is not a document the Hub can read.'] }
            }

            const where = placeOf(doc, known, restaurantId, restaurants)
            const supplier = known.suppliers.find(s => s.id === where.supplierId) || null
            const mine = known.held.filter(h => h.supplier_id === where.supplierId)

            const matched = matchLines({
                lines: doc.lines,
                codes: known.codes.filter(c => c.supplier_id === where.supplierId),
                prices: known.prices.filter(p => p.supplier_id === where.supplierId),
                supplier,
                date: doc.date,
            })

            const place = placeDocument(doc, mine)
            const blocks = documentBlocks(doc)

            return {
                ...base,
                doc,
                where,
                supplier,
                place,
                blocks,
                matched,
                piles: pilesOf(matched),
                totals: documentTotals(matched),
                restaurantName: restaurants?.find(r => r.id === where.restaurantId)?.name || null,
                state: stateOf({ where, place, blocks }),
            }
        } catch (err) {
            return { ...base, state: 'blocked', blocks: [err.message || 'That file could not be opened.'] }
        }
    }

    async function chose(event) {
        const chosen = [...(event.target.files || [])]
        event.target.value = ''
        if (!chosen.length || !known) return

        setReading(true)
        setError('')
        setSaid('')

        // One at a time on purpose. Twenty PDF engines at once on a laptop is
        // how a browser tab stops answering, and the whole batch is a few
        // seconds either way.
        for (const file of chosen) {
            const read = await look(file)
            setFiles(all => (all.some(f => f.key === read.key) ? all : [...all, read]))
        }
        setReading(false)
    }

    // An account number nobody has claimed. Asked once, and then the Hub knows
    // for every document that supplier ever sends.
    async function claimAccount(supplierId) {
        const accountNo = linking.doc.accountNo
        const { error: e1 } = await supabase.from('supplier_accounts').insert({
            supplier_id: supplierId, restaurant_id: restaurantId, account_no: accountNo,
        })
        setLinking(null)
        if (e1) { setError(friendlyError(e1)); return }

        setKnown(k => ({
            ...k,
            accounts: [...k.accounts, { supplier_id: supplierId, restaurant_id: restaurantId, account_no: accountNo }],
        }))
        // The cards were all built against the old answer, so they are read
        // again rather than patched. Anything else is two ideas of what a file
        // says, and one of them stale.
        setFiles([])
        setSaid('That account is linked now. Choose the files again.')
    }

    // A credit for an invoice that was typed in by hand, net of that credit, is
    // already counted: importing it would take the same money off twice. It is
    // worked out over the whole batch, because the invoice it credits may be one
    // of the other files.
    //
    // **Only a file that is going in as new clears it.** One that is itself
    // typed in by hand has to be filled in first, or pressing Import would put
    // the credit in against a total that already has it taken off. So the card
    // says which one to fill in, and once it is filled in the credit settles the
    // shortage the fill in turns into a claim.
    const cards = useMemo(() => files.map(file => {
        if (file.state !== 'ready' || file.doc?.kind !== 'credit' || allowed.has(file.key)) return file
        const others = files.filter(f => f.key !== file.key)
        const onHand = creditOnHandEntry(file.doc, {
            held: (known?.held || []).filter(h => h.supplier_id === file.where.supplierId),
            documents: (known?.documents || []).filter(d => d.supplier_id === file.where.supplierId),
            batch: others.filter(f => f.state === 'ready').map(f => f.doc),
        })
        if (!onHand) return file
        const waitingOn = others.find(f => f.state === 'by_hand' && f.doc?.number === onHand.invoiceNumber)
        return { ...file, state: 'on_hand', onHand: { ...onHand, waitingOn: waitingOn?.name || null } }
    }), [files, known, allowed])

    const ready = cards.filter(f => f.state === 'ready')

    async function importAll() {
        setSaving(true)
        setError('')
        let done = 0

        // The documents go in date order, so a credit note is never written
        // before the invoice it credits and the reference can be resolved as it
        // goes rather than in a second pass.
        const inOrder = [...ready].sort((a, b) => (
            (a.doc.date || '').localeCompare(b.doc.date || '')
            || (a.doc.kind === 'credit' ? 1 : 0) - (b.doc.kind === 'credit' ? 1 : 0)
        ))

        // Every code seen anywhere in the batch, gathered as the documents go
        // in and written once at the end.
        //
        // **The same code is on several invoices in a week**, which is the
        // normal case rather than the odd one: a product bought twice a week is
        // two documents carrying the same number. Writing the code row per
        // document meant inserting it, then inserting it again, and the unique
        // key stopping the second one dead halfway through a batch.
        const seen = new Map()

        for (const file of inOrder) {
            const failed = await writeDocument(file, seen)
            if (failed) { setError(failed); break }
            done += 1
            setFiles(all => all.filter(f => f.key !== file.key))
        }

        const failedCodes = await writeCodes(seen)
        setSaving(false)
        if (failedCodes) { setError(failedCodes); return }
        if (done) setSaid(`${done} ${done === 1 ? 'document' : 'documents'} imported.`)
        setChecked(n => n + 1)
    }

    async function writeCodes(seen) {
        for (const [key, entry] of seen) {
            const existing = known.codes.find(c => (
                c.supplier_id === entry.supplierId && c.supplier_code === entry.line.code
            ))

            const patch = existing
                ? seenAgain(existing, { line: entry.line, date: entry.lastSeen })
                : codeRow({
                    code: entry.line.code,
                    line: entry.line,
                    supplierId: entry.supplierId,
                    restaurantId: entry.restaurantId,
                    priceId: entry.priceId,
                    date: entry.firstSeen,
                })
            // first_seen_on is what says how long the Hub has known about
            // something, and the earliest document in the batch is the answer.
            if (!existing) patch.last_seen_on = entry.lastSeen

            const { error: e1 } = existing
                ? await supabase.from('supplier_codes').update(patch).eq('id', existing.id)
                : await supabase.from('supplier_codes').insert(patch)
            if (e1) return friendlyError(e1)

            seen.delete(key)
        }
        return null
    }

    async function writeDocument(file, seen) {
        const { doc, where, matched, supplier } = file

        const { data: invoice, error: e1 } = await supabase.from('invoices')
            .insert(invoicePayload(doc, {
                restaurantId: where.restaurantId,
                supplierId: where.supplierId,
                weekStart: weekStartOf(doc.date),
                createdBy: user?.id,
                // Where most of its money went, which is what History shows
                // it as. The supplier's own category only when there are no
                // lines to go by.
                category: mainCategory(documentTotals(matched), supplier?.category),
            }))
            .select()
            .single()
        if (e1) return friendlyError(e1)

        // A credit note's lines are money coming back at the price already
        // charged. They are not evidence of a new price, so nobody is asked
        // about them.
        const { error: e2 } = await supabase.from('invoice_lines')
            .insert(matched.map(row => ({
                ...linePayload(row, invoice.id),
                ...(doc.kind === 'credit' ? { decision: 'matched' } : {}),
            })))
        if (e2) return friendlyError(e2)

        // Every code on the document, gathered rather than written. This is
        // what later lets the Hub notice that one stopped appearing and another
        // turned up in its place.
        for (const row of matched) {
            const key = `${where.supplierId}:${row.line.code}`
            const already = seen.get(key)
            seen.set(key, {
                supplierId: where.supplierId,
                restaurantId: where.restaurantId,
                line: already && already.lastSeen > doc.date ? already.line : row.line,
                priceId: row.price?.id || already?.priceId || null,
                firstSeen: already && already.firstSeen < doc.date ? already.firstSeen : doc.date,
                lastSeen: already && already.lastSeen > doc.date ? already.lastSeen : doc.date,
            })
        }

        if (doc.kind === 'credit') {
            const failed = await settleWith(doc, invoice, where, matched)
            if (failed) return failed
        }

        // If the portal list has been pasted, this closes the gap it was
        // showing.
        await supabase.from('supplier_documents')
            .update({ invoice_id: invoice.id })
            .eq('restaurant_id', where.restaurantId)
            .eq('supplier_id', where.supplierId)
            .eq('document_id', doc.number)

        return null
    }

    // A credit note, and the claims it settles.
    //
    // The claim is where money coming back is taken off, in the week the
    // delivery happened. So a credit that settles one is kept and matched and
    // does not count on its own, and a credit with no claim behind it counts on
    // its own date the ordinary way. See creditSettles.
    async function settleWith(doc, invoice, where, matched) {
        let against = null
        if (doc.orderReference) {
            const { data } = await supabase.from('invoices')
                .select('id, invoice_number, invoice_date')
                .eq('restaurant_id', where.restaurantId)
                .eq('supplier_id', where.supplierId)
                .eq('invoice_number', doc.orderReference)
                .maybeSingle()
            against = data || null
            if (against) {
                await supabase.from('invoices')
                    .update({ credit_of_invoice_id: against.id }).eq('id', invoice.id)
            }
        }

        // Read fresh for every credit, because the one before it in the batch
        // may have just settled some of them.
        const { data: open, error: e1 } = await supabase.from('invoice_line_claims')
            .select('*, invoice_lines(supplier_code)')
            .eq('restaurant_id', where.restaurantId)
            .eq('status', 'open')
        if (e1) return friendlyError(e1)

        const result = creditSettles({
            credit: { ...doc, id: invoice.id },
            lines: matched.map(row => ({
                code: row.line.code, value: row.line.value, vat: row.line.vat, deposit: row.line.deposit,
            })),
            against,
            claims: (open || []).map(c => ({ ...c, code: c.invoice_lines?.supplier_code || null })),
            supplierId: where.supplierId,
            restaurantId: where.restaurantId,
        })

        for (const { id, patch } of result.settle) {
            const { error: e2 } = await supabase.from('invoice_line_claims').update(patch).eq('id', id)
            if (e2) return friendlyError(e2)
        }
        if (result.extra) {
            const { error: e3 } = await supabase.from('invoice_line_claims').insert(result.extra)
            if (e3) return friendlyError(e3)
        }
        if (!result.countsInCost) {
            const { error: e4 } = await supabase.from('invoices')
                .update({ counts_in_cost: false }).eq('id', invoice.id)
            if (e4) return friendlyError(e4)
        }
        return null
    }

    // Putting the detail behind an invoice that was typed off a total.
    //
    // Nothing is deleted and started again: the row keeps who entered it and
    // when, the lines go on, and the difference between what was typed and what
    // the supplier charged becomes a claim, so the week does not move.
    async function fillIn({ file, invoice }, plan) {
        const { doc, where, matched } = file

        const { error: e1 } = await supabase.from('invoices')
            .update(fillInPayload(doc, { createdBy: invoice.created_by || user?.id }))
            .eq('id', invoice.id)
        if (e1) return friendlyError(e1)

        const { error: e2 } = await supabase.from('invoice_lines')
            .insert(matched.map(row => linePayload(row, invoice.id)))
        if (e2) return friendlyError(e2)

        const claim = fillInClaim(plan, {
            invoice, doc, restaurantId: where.restaurantId,
            supplierId: where.supplierId, raisedBy: user?.id,
        })
        if (claim) {
            const { error: e3 } = await supabase.from('invoice_line_claims').insert(claim)
            if (e3) return friendlyError(e3)
        }

        setFillingIn(null)
        setChecked(n => n + 1)
        setFiles(all => all.filter(f => f.key !== file.key))
        // The typed row is that document now, number and all, so a credit
        // against it in the same batch stops waiting and settles the claim.
        setKnown(k => ({
            ...k,
            held: k.held.map(h => (h.id === invoice.id
                ? { ...h, invoice_number: doc.number, total_amount: documentTotal(doc) }
                : h)),
        }))
        setSaid(claim
            ? `Filled in. ${claim.amount.toFixed(2)} is on the claims list as a shortage.`
            : 'Filled in.')
        return null
    }

    async function run(work) {
        setSaving(true)
        setError('')
        const failed = await work()
        setSaving(false)
        if (failed) setError(failed)
    }

    const waiting = ready.reduce((total, f) => total + (f.doc ? documentTotal(f.doc) : 0), 0)

    return (
        <>
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className={pageTitle}>Import invoices</h2>
                    <p className="text-sm text-gray-500 mt-1">{activeRestaurant?.name}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link to="/invoices/documents" className={secondaryButton}>
                        What the supplier says it sent
                    </Link>
                    <Link to="/invoices/review" className={secondaryButton}>Review</Link>
                    <Link to="/invoices" className={secondaryButton}>Invoices</Link>
                </div>
            </div>

            {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}
            {said && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{said}</div>}

            <div className={`${card} mb-6 overflow-hidden`}>
                <div className={cardHeader}>The files</div>
                <div className="p-5">
                    <input
                        ref={picker}
                        id="invoice-files"
                        type="file"
                        accept="application/pdf,.pdf"
                        multiple
                        className="sr-only"
                        onChange={chose}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            disabled={!known || reading}
                            onClick={() => picker.current?.click()}
                            className={primaryButton()}
                        >
                            {reading ? 'Reading...' : 'Choose the PDFs'}
                        </button>
                        {files.length > 0 && (
                            <button type="button" onClick={() => setFiles([])} className={secondaryButton}>
                                Start again
                            </button>
                        )}
                    </div>
                    <p className={hintClass}>
                        A week at a time is about twenty of them, and the credits are usually in the
                        same batch as the invoices they belong to. Nothing is written until you
                        press Import, and the files never leave this machine.
                    </p>
                </div>
            </div>

            {fillingIn && (
                <FillInModal
                    doc={fillingIn.file.doc}
                    invoice={fillingIn.invoice}
                    lines={fillingIn.file.doc.lines.length}
                    onClose={() => setFillingIn(null)}
                    onFillIn={plan => run(() => fillIn(fillingIn, plan))}
                />
            )}

            {linking && (
                <LinkAccountModal
                    accountNo={linking.doc.accountNo}
                    restaurantName={activeRestaurant?.name}
                    suppliers={known?.suppliers || []}
                    onClose={() => setLinking(null)}
                    onLink={claimAccount}
                />
            )}

            {files.length > 0 && (
                <>
                    <div className="space-y-3 mb-6">
                        {cards.map(file => (
                            <DocumentCard
                                key={file.key}
                                file={file}
                                onForget={() => setFiles(all => all.filter(f => f.key !== file.key))}
                                onLinkAccount={() => setLinking(file)}
                                onFillIn={invoice => setFillingIn({ file, invoice })}
                                onAllow={() => setAllowed(all => new Set(all).add(file.key))}
                            />
                        ))}
                    </div>

                    <div className={`${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
                        <p className="text-sm text-gray-900">
                            <strong className="font-bold">{ready.length}</strong>{' '}
                            {ready.length === 1 ? 'document' : 'documents'} ready,{' '}
                            {fmtMoney(waiting)} in all.
                        </p>
                        <button
                            type="button"
                            disabled={!ready.length || saving}
                            onClick={importAll}
                            className={primaryButton('md', 'good')}
                        >
                            {saving ? 'Importing...' : 'Import them'}
                        </button>
                    </div>
                </>
            )}

            {/* Straight after a batch is exactly when the question is asked:
                did that cover everything the supplier says it sent? */}
            <StillMissing restaurantId={restaurantId} refresh={checked} pasteLink />
        </>
    )
}

// Which restaurant a document lands in, and whether that is this one.
//
// The account number decides and nothing else does. A file for the other shop
// is refused rather than imported here, because that mistake puts a cost on the
// wrong week in two places at once and nothing would ever say why.
function placeOf(doc, known, restaurantId, restaurants) {
    const where = whereItGoes(doc.accountNo, known.accounts)
    if (where.what !== 'known') return where
    if (where.restaurantId !== restaurantId) {
        return {
            ...where,
            what: 'elsewhere',
            restaurantName: restaurants?.find(r => r.id === where.restaurantId)?.name || null,
        }
    }
    return where
}

function stateOf({ where, place, blocks }) {
    if (where.what !== 'known') return 'blocked'
    if (blocks.length) return 'blocked'
    if (place.what === 'already_here') return 'already_here'
    if (place.what === 'by_hand') return 'by_hand'
    return 'ready'
}
