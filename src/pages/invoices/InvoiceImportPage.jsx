import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, everyRow } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useConfirm } from '@/context/confirm'
import { useRestaurant } from '@/context/restaurant'
import { weekStartOf, todayISO, addDays, fullDate } from '@/lib/dates'
import { fmtMoney, namesList } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { readPdfText } from '@/lib/pdfText'
import {
    readDocument, whereItGoes, placeDocument, matchLines, pilesOf, documentTotals,
    documentBlocks, linePayload, invoicePayload, fillInPayload, fillInClaim, creditOnHandEntry,
    documentTotal, typedAgain,
} from '@/lib/invoiceImport'
import { mainCategory } from '@/lib/invoiceCategories'
import { creditSettles, sentWeeks, canDetach } from '@/lib/invoiceClaims'
import { orderByUse, USE_WINDOW_DAYS } from '@/lib/supplierOrder'
import { codeRow, seenAgain } from '@/lib/priceEvents'
import { creditsFor } from '@/lib/supplierDocuments'
import { readToDecide } from '@/lib/invoiceReview'
import {
    card, cardHeader, pageTitle, primaryButton, secondaryButton, hintClass,
} from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import WarningUntilSeen from '@/components/ui/WarningUntilSeen'
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
//
// **After a batch, Review opens whenever anything is waiting on it**, from this
// batch or an earlier one (his answers of 30 September). Not while a file is
// still on the page, because leaving would throw it away: then it says how many
// lines are waiting and gives the way there.

const ON_REVIEW = 'Below is everything waiting for a decision, from this import and any before it.'

export default function InvoiceImportPage() {
    const navigate = useNavigate()
    const confirm = useConfirm()
    const { user } = useAuth()
    const { activeRestaurant, restaurants } = useRestaurant()
    const restaurantId = activeRestaurant?.id

    const [files, setFiles] = useState([])
    const [reading, setReading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [said, setSaid] = useState('')
    // A credit left waiting on a delivery problem on another invoice, kept
    // apart from what was said until somebody has seen it (astraySaid).
    const [warned, setWarned] = useState('')
    // Lines waiting on Review, for the link beside what was said.
    const [onReview, setOnReview] = useState(0)
    const [known, setKnown] = useState(null)
    const [linking, setLinking] = useState(null)
    const [fillingIn, setFillingIn] = useState(null)
    // Credits somebody has said were not taken off by hand, so they go in.
    const [allowed, setAllowed] = useState(() => new Set())
    // Documents somebody has said are another delivery from any typed in
    // for that day, so they go in as new.
    const [asNew, setAsNew] = useState(() => new Set())
    // Bumped after anything goes in, so the list of what is still to
    // download is read again and the documents just imported drop off it.
    const [checked, setChecked] = useState(0)
    // Bumped after anything goes in, so the lists below are read again, and
    // true until they are back.
    const [reread, setReread] = useState(0)
    const [stale, setStale] = useState(false)
    const loadedFor = useRef(null)
    const picker = useRef(null)

    // Everything the matching needs, read once per batch rather than once per
    // file. A batch of twenty files asking for the same four lists twenty
    // times is twenty times the waiting for exactly the same answer.
    //
    // **Read again after every batch and every fill in.** Read only when the
    // page opened, a second batch in the same visit worked from lists that
    // did not have the first one in them: a document imported a minute ago
    // showed as ready to go in again, and a code first seen in it looked new,
    // so adding it a second time failed after an import that had worked.
    useEffect(() => {
        if (!restaurantId) return
        let alive = true

        async function load() {
            // See the comment on the same line in ClaimsPage: a banner that is
            // never cleared outlives the thing it was about. Only for another
            // restaurant, though: read again after a batch, the banner may be
            // saying what went wrong in it.
            if (loadedFor.current !== restaurantId) setError('')
            // Every invoice ever held, every price and code, and every list
            // pasted all grow past a thousand rows, which is as many as one
            // read hands back, so they are read a page at a time. An invoice
            // missing from what is held would let a document already in the
            // Hub, or a typed day, go in a second time.
            const [accounts, suppliers, prices, codes, held, documents] = await Promise.all([
                supabase.from('supplier_accounts').select('*'),
                supabase.from('suppliers').select('id, name, category, is_active'),
                everyRow(() => supabase.from('product_supplier_prices')
                    .select('*, products(id, name, section, unit, piece_weight)')
                    .eq('restaurant_id', restaurantId)
                    .order('id')),
                everyRow(() => supabase.from('supplier_codes').select('*').eq('restaurant_id', restaurantId).order('id')),
                // Who typed it, how and its note too, because a fill in keeps
                // the first two and puts all of it back if it does not finish,
                // and the note is what tells two typed on one day apart.
                everyRow(() => supabase.from('invoices')
                    .select('id, invoice_number, invoice_date, total_amount, supplier_id, document_type, entry_method, created_by, notes')
                    .eq('restaurant_id', restaurantId)
                    .order('id')),
                // The supplier's own list, where it has been pasted. It is what
                // says for certain whether a credit was already taken off a
                // total typed by hand.
                everyRow(() => supabase.from('supplier_documents').select('*').eq('restaurant_id', restaurantId).order('id')),
            ])

            if (!alive) return
            const failed = [accounts, suppliers, prices, codes, held, documents].map(r => r.error).find(Boolean)
            if (failed && loadedFor.current === restaurantId) {
                // Read again after a batch: said after whatever the batch
                // said, and nothing more is read off a file, because the old
                // lists are exactly what went wrong before.
                const again = 'The lists the import works from could not be read again, so nothing '
                    + `more can go in until they are. ${friendlyError(failed)} Reload the page to try again.`
                setError(said => (said ? `${said} ${again}` : again))
                return
            }
            if (failed) { setError(friendlyError(failed)); return }
            loadedFor.current = restaurantId
            setStale(false)

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
    }, [restaurantId, reread])

    // After a write, nothing more is read off a file until the lists have it.
    function readAgain() {
        setStale(true)
        setReread(n => n + 1)
        setChecked(n => n + 1)
    }

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
        setOnReview(0)

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
    //
    // Every card is placed first, so a credit is weighed against where the
    // others stand now: an invoice said to be a different delivery is going
    // in, not waiting to be filled in.
    const cards = useMemo(() => {
        const placed = files.map(read => placedNow(read, known, asNew))
        return placed.map(file => (allowed.has(file.key) ? file : withCredit(file, placed, known)))
    }, [files, known, allowed, asNew])

    // A file taken off forgets what was said about it, so choosing it again
    // asks again.
    function forget(keys) {
        const gone = new Set(keys)
        setFiles(all => all.filter(f => !gone.has(f.key)))
        setAsNew(all => new Set([...all].filter(k => !gone.has(k))))
        setAllowed(all => new Set([...all].filter(k => !gone.has(k))))
    }

    // One tap would count a delivery twice if it is one of those typed in, so
    // it is asked, with what was typed in front of whoever is pressing it.
    async function importAsNew(file) {
        const totals = file.place.candidates.map(c => fmtMoney(c.total_amount))
        const ok = await confirm({
            title: 'A different delivery?',
            message: `${namesList(totals)} ${totals.length === 1 ? 'was' : 'were'} typed in for `
                + `${fullDate(file.doc.date)} with no document behind ${totals.length === 1 ? 'it' : 'them'}. `
                + `Import ${file.doc.number} (${fmtMoney(documentTotal(file.doc))}) as well only if it is `
                + 'another delivery that day. If it is one of those, fill that one in instead, or the '
                + 'delivery is counted twice.',
            confirmLabel: 'Import it as new',
        })
        if (ok) setAsNew(all => new Set(all).add(file.key))
    }

    const ready = cards.filter(f => f.state === 'ready')

    async function importAll() {
        setSaving(true)
        setError('')
        setSaid('')
        setOnReview(0)
        let done = 0
        let failed = null

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
        // Notes from the door that name an invoice in this batch, and claims
        // a credit in it matched by docket on another invoice.
        const notes = []
        const astray = []

        for (const file of inOrder) {
            failed = await writeDocument(file, seen, notes, astray)
            if (failed) break
            done += 1
            setFiles(all => all.filter(f => f.key !== file.key))
        }

        failed = failed || await writeCodes(seen)
        setSaving(false)
        readAgain()
        const imported = `${done} ${done === 1 ? 'document' : 'documents'} imported.${notesSaid(notes)}`
        // Added to one not seen yet from an earlier batch, never over it.
        const warn = astraySaid(astray)
        if (warn) setWarned(w => [w, warn].filter(Boolean).join(' '))
        // Something went wrong part of the way, so it stays where the files
        // are and says what went in.
        if (failed) {
            setError(failed)
            if (done) setSaid(imported)
            return
        }
        if (done) await thenReview(imported, stillNeeded(cards) - done, [warned, warn].filter(Boolean).join(' '))
    }

    // Whether anything is waiting on Review, and Review if it is. `left` is
    // how many files are still on the page that are worth staying for. Import
    // waits until every file chosen has been read, and nothing more can be
    // chosen while it imports, so the cards it was pressed over are all there
    // are. `warn` goes to Review with it, to stay there until it is seen.
    async function thenReview(already, left, warn = '') {
        const { lines, error: e1 } = await readToDecide(restaurantId)
        if (e1) {
            setSaid(already)
            setError(`What is waiting on Review could not be read: ${friendlyError(e1)}`)
            return
        }
        const waiting = lines.length
        if (waiting && !left) {
            navigate('/invoices/review', { state: { said: `${already} ${ON_REVIEW}`, warned: warn } })
            return
        }
        setOnReview(waiting)
        setSaid(waiting
            ? `${already} ${waiting} ${waiting === 1 ? 'line is' : 'lines are'} waiting on Review.`
            : `${already} Nothing is waiting on Review.`)
    }

    async function writeCodes(seen) {
        for (const [key, entry] of seen) {
            const existing = known.codes.find(c => (
                c.supplier_id === entry.supplierId && c.supplier_code === entry.line.code
            ))

            const patch = existing
                ? seenAgain(existing, { line: entry.line, date: entry.lastSeen, firstSeen: entry.firstSeen })
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

    // Every code on the document, gathered rather than written. This is what
    // later lets the Hub notice that one stopped appearing and another turned
    // up in its place.
    function gather(seen, { doc, where, matched }) {
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
    }

    async function writeDocument(file, seen, notes, astray) {
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

        gather(seen, file)

        if (doc.kind === 'credit') {
            const failed = await settleWith(doc, invoice, where, matched, astray)
            if (failed) return failed
        } else {
            notes.push({ number: doc.number, count: await doorNotesOn(doc, where) })
            await pairEarlierCredits(doc, invoice.id, where)
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

    // How many notes from the door name this invoice and are not on a line
    // yet. Nothing puts one on a line by itself, because the wrong line moves
    // money off the wrong product, so the import only says they are there.
    // Only a reminder: a read that fails says nothing rather than spoil an
    // import that worked.
    async function doorNotesOn(doc, where) {
        if (doc.kind === 'credit' || !doc.number) return 0
        const { data, error: e1 } = await supabase.from('invoice_line_claims')
            .select('id')
            .eq('restaurant_id', where.restaurantId)
            .eq('supplier_id', where.supplierId)
            .eq('docket_number', String(doc.number))
            .eq('status', 'open')
            .is('amount', null)
        return e1 ? 0 : (data || []).length
    }

    // A credit already in the Hub for this invoice, imported before it, so it
    // had nothing to pair with: without the pair a delivery sent back in full
    // still asks about its prices (voidedBy, sentBack). The credit does not
    // keep the invoice it is for, so only the supplier's list, where it has
    // been pasted, can say. Only a tidy up: one that fails leaves the two
    // unpaired, the way they were.
    async function pairEarlierCredits(doc, invoiceId, where) {
        const credits = creditsFor(known.documents, where.supplierId, doc.number)
        if (!credits.length) return
        await supabase.from('invoices')
            .update({ credit_of_invoice_id: invoiceId })
            .eq('restaurant_id', where.restaurantId)
            .eq('supplier_id', where.supplierId)
            .eq('document_type', 'credit')
            .in('invoice_number', credits)
            .is('credit_of_invoice_id', null)
    }

    // A credit note, and the claims it settles.
    //
    // The claim is where money coming back is taken off, in the week the
    // delivery happened. So a credit that settles one is kept and matched and
    // does not count on its own, and a credit with no claim behind it counts on
    // its own date the ordinary way. See creditSettles.
    async function settleWith(doc, invoice, where, matched, astray) {
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
            .select('*, invoice_lines(supplier_code), delivery:invoices!invoice_line_claims_invoice_id_fkey(invoice_number)')
            .eq('restaurant_id', where.restaurantId)
            .eq('status', 'open')
        if (e1) return friendlyError(e1)

        // The weeks already sent, because money a credit brings in for a
        // delivery whose report has gone out comes off the first week still
        // open. See claimWeek.
        const { weeks: sent, error: e5 } = await sentWeeks(supabase, where.restaurantId)
        if (e5) return friendlyError(e5)

        const result = creditSettles({
            credit: { ...doc, id: invoice.id },
            lines: matched.map(row => ({
                code: row.line.code, value: row.line.value, vat: row.line.vat, deposit: row.line.deposit,
            })),
            against,
            claims: (open || []).map(c => ({ ...c, code: c.invoice_lines?.supplier_code || null })),
            supplierId: where.supplierId,
            restaurantId: where.restaurantId,
            sent,
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
        for (const claim of result.mismatched) {
            astray.push({ credit: doc.number, on: claim.delivery?.invoice_number || null, detach: canDetach(claim) })
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

        // The lines go in as one write. If they do not, the invoice goes back
        // as it was typed, so pressing again starts clean rather than leaving
        // a filled in invoice with nothing behind it.
        const { error: e2 } = await supabase.from('invoice_lines')
            .insert(matched.map(row => linePayload(row, invoice.id)))
        if (e2) {
            const { error: back } = await supabase.from('invoices').update(typedAgain(invoice)).eq('id', invoice.id)
            return back
                ? `${friendlyError(e2)} It could not be put back as it was typed either, so reload the page before trying again.`
                : friendlyError(e2)
        }

        // **From here the invoice is that document**, and pressing again
        // would put its lines in twice. So whatever does not save after this
        // is said, and the file leaves the page like one that went in.
        const after = []
        const claim = fillInClaim(plan, {
            invoice, doc, restaurantId: where.restaurantId,
            supplierId: where.supplierId, raisedBy: user?.id,
        })
        let claimed = false
        if (claim) {
            const { error: e3 } = await supabase.from('invoice_line_claims').insert(claim)
            claimed = !e3
            if (e3) {
                after.push(`The ${fmtMoney(claim.amount)} taken off by hand did not go on the claims list, `
                    + `so that week is up by it: ${friendlyError(e3)} Log it on Delivery problems.`)
            }
        }

        // Its codes, the same as a document imported. Left out, a code first
        // bought on a typed invoice had no first or last day, and the quiet
        // days check and the report's new codes go by those. Last, because a
        // code the next import records anyway is the least of it.
        const seen = new Map()
        gather(seen, file)
        const failedCodes = await writeCodes(seen)
        if (failedCodes) after.push(`Its codes were not all recorded: ${failedCodes} The next import records them.`)

        setFillingIn(null)
        readAgain()
        const left = stillNeeded(cards.filter(f => f.key !== file.key))
        setFiles(all => all.filter(f => f.key !== file.key))
        // The typed row is that document now, number and all, so a credit
        // against it in the same batch stops waiting and settles the claim.
        setKnown(k => ({
            ...k,
            held: k.held.map(h => (h.id === invoice.id
                ? { ...h, invoice_number: doc.number, total_amount: documentTotal(doc) }
                : h)),
        }))
        await pairEarlierCredits(doc, invoice.id, where)
        const notes = notesSaid([{ number: doc.number, count: await doorNotesOn(doc, where) }])
        const filled = claimed
            ? `Filled in. ${claim.amount.toFixed(2)} is on the claims list as a shortage.${notes}`
            : `Filled in.${notes}`
        if (after.length) {
            setSaid(filled)
            return after.join(' ')
        }
        await thenReview(filled, left)
        return null
    }

    async function run(work) {
        setSaving(true)
        setError('')
        setSaid('')
        setOnReview(0)
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
            {warned && <WarningUntilSeen className="mb-4" onSeen={() => setWarned('')}>{warned}</WarningUntilSeen>}
            {said && (
                <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">
                    {said}
                    {onReview > 0 && (
                        <>
                            {' '}
                            <Link to="/invoices/review" className="font-bold underline">Open Review</Link>
                        </>
                    )}
                </div>
            )}

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
                            disabled={!known || reading || stale || saving}
                            onClick={() => picker.current?.click()}
                            className={primaryButton()}
                        >
                            {reading ? 'Reading...' : 'Choose the PDFs'}
                        </button>
                        {files.length > 0 && (
                            <button type="button" onClick={() => forget(files.map(f => f.key))} className={secondaryButton}>
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
                                busy={saving || reading || stale}
                                onForget={() => forget([file.key])}
                                onLinkAccount={() => setLinking(file)}
                                onFillIn={invoice => setFillingIn({ file, invoice })}
                                onAllow={() => setAllowed(all => new Set(all).add(file.key))}
                                onAsNew={() => importAsNew(file)}
                            />
                        ))}
                    </div>

                    <div className={`${card} p-4 flex flex-wrap items-center justify-between gap-3`}>
                        <p className="text-sm text-gray-900">
                            <strong className="font-bold">{ready.length}</strong>{' '}
                            {ready.length === 1 ? 'document' : 'documents'} ready,{' '}
                            {fmtMoney(waiting)} in all.
                        </p>
                        {/* Not while a file is still being read, or Review could
                            open over it and it would be lost. Not before the
                            lists are read again either: the old ones are how a
                            second batch went wrong. */}
                        <button
                            type="button"
                            disabled={!ready.length || saving || reading || stale}
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

// Where a file stands against what is in the Hub now rather than when it was
// read. A document imported or filled in since is already here, and a typed
// invoice filled in by another file is no longer one waiting to be. One said
// to be a different delivery from those typed in that day goes in as new.
function placedNow(file, known, asNew) {
    if (!file.doc || !known || file.where?.what !== 'known' || file.blocks?.length) return file
    const place = placeDocument(file.doc, known.held.filter(h => h.supplier_id === file.where.supplierId))
    const state = place.what === 'by_hand' && asNew.has(file.key)
        ? 'ready'
        : stateOf({ where: file.where, place, blocks: file.blocks })
    return { ...file, place, state }
}

// A credit, held back while it may already be inside a total typed by hand.
// See the comment on the cards.
function withCredit(file, placed, known) {
    if (file.state !== 'ready' || file.doc?.kind !== 'credit') return file
    const others = placed.filter(f => f.key !== file.key)
    const onHand = creditOnHandEntry(file.doc, {
        held: (known?.held || []).filter(h => h.supplier_id === file.where.supplierId),
        documents: (known?.documents || []).filter(d => d.supplier_id === file.where.supplierId),
        batch: others.filter(f => f.state === 'ready').map(f => f.doc),
    })
    if (!onHand) return file
    const waitingOn = others.find(f => f.state === 'by_hand' && f.doc?.number === onHand.invoiceNumber)
    return { ...file, state: 'on_hand', onHand: { ...onHand, waitingOn: waitingOn?.name || null } }
}

// The cards worth staying on the page for. A document already in the Hub has
// nothing left to do, so a folder with some of last week's in it still opens
// Review. One that cannot be read or is the other restaurant's is kept, so
// nobody misses that it did not go in.
function stillNeeded(cards) {
    return cards.filter(f => f.state !== 'already_here').length
}

// What the import says about notes from the door waiting on what went in,
// with a space in front, or nothing.
function notesSaid(notes) {
    const on = (notes || []).filter(n => n.count > 0)
    if (!on.length) return ''
    const each = on.map(({ number, count }) => (count === 1
        ? `1 delivery problem logged at the door is on invoice ${number}.`
        : `${count} delivery problems logged at the door are on invoice ${number}.`))
    return ` ${each.join(' ')} Say which line on Delivery problems.`
}

// A credit that matched a delivery problem by its docket and left it alone,
// because the problem is on another invoice (creditSettles). Meanwhile the
// problem's own amount comes off and the credit for it does not, or the same
// money would come off twice. Put right, deleting the credit and importing it
// again settles the problem the ordinary way; between the two, nothing comes
// off for it, so they are said together.
//
// Not this line is only there while nothing has been credited on the problem
// (canDetach), so it is only offered then.
function astraySaid(astray) {
    return (astray || []).map(({ credit, on, detach }) => (
        `The credit note ${credit} matches a delivery problem by its docket, but that problem is on `
        + `${on ? `invoice ${on}` : 'another invoice'}. Until that is put right, the problem's own amount `
        + 'comes off rather than the credit for it. '
        + (detach
            ? 'Check it on Delivery problems. If it is on the wrong invoice, use Not this line, then delete this '
                + 'credit note and import it again. Nothing comes off for it between the two, so do them together.'
            : 'Something has already been credited on that problem, so it cannot come off that invoice. '
                + 'Check it on Delivery problems.')
    )).join(' ')
}

function stateOf({ where, place, blocks }) {
    if (where.what !== 'known') return 'blocked'
    if (blocks.length) return 'blocked'
    if (place.what === 'already_here') return 'already_here'
    if (place.what === 'by_hand') return 'by_hand'
    return 'ready'
}
