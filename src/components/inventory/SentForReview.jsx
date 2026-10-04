import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, everyRow } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useConfirm } from '@/context/confirm'
import { useRecountBadges } from '@/context/badges'
import { fmtMoney } from '@/lib/format'
import { dayLabel, stampDay } from '@/lib/dates'
import { friendlyError } from '@/lib/errors'
import { roleLabel } from '@/lib/access'
import { answersFor, answerLabel, answeredWords, kindWords } from '@/lib/productRequests'
import { settleRequest, addFromRequest } from '@/lib/reviewWrites'
import { card, cardHeader, rowButton, badge } from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import MatchLineModal from '@/components/invoices/MatchLineModal'
import AddFromRequestModal from '@/components/inventory/AddFromRequestModal'

// What store managers sent for review, on top of Products, for the owners and
// the super admin to answer.
//
// Each answer settles every line with its code at the restaurant that sent
// it, the way Review would have: matched to a product, or the code marked not
// stock, or set aside. Nothing shows when nothing is waiting.
export default function SentForReview({ onChanged }) {
    const { user } = useAuth()
    const confirm = useConfirm()
    const navigate = useNavigate()
    const recountBadges = useRecountBadges()
    const [requests, setRequests] = useState([])
    const [products, setProducts] = useState([])
    const [error, setError] = useState('')
    const [said, setSaid] = useState('')
    const [busy, setBusy] = useState('')
    const [adding, setAdding] = useState(null)
    const [matching, setMatching] = useState(null)
    // Every answer reads the list again.
    const [refresh, setRefresh] = useState(0)

    useEffect(() => {
        let alive = true
        async function load() {
            const [waiting, list] = await Promise.all([
                everyRow(() => supabase.from('product_requests')
                    .select('*, sender:users!product_requests_sent_by_fkey(full_name, role), restaurants(name), suppliers(name)')
                    .is('answer', null)
                    .order('sent_at')
                    .order('id')),
                // Anything we buy, for A version of one we have. The same list
                // Review offers.
                everyRow(() => supabase.from('products')
                    .select('id, name, section, unit, is_mix, category, is_active, piece_weight')
                    .eq('is_active', true)
                    .eq('is_mix', false)
                    .order('name')
                    .order('id')),
            ])
            if (!alive) return
            const failed = waiting.error || list.error
            if (failed) { setError(friendlyError(failed)); return }
            setRequests(waiting.data || [])
            setProducts(list.data || [])
        }
        load()
        return () => { alive = false }
    }, [refresh])

    function reread() {
        setRefresh(n => n + 1)
        recountBadges()
        onChanged?.()
    }

    async function finish(work, key) {
        setBusy(key)
        setError('')
        setSaid('')
        const out = await work()
        setBusy('')
        if (out?.error) { setError(out.error); return false }
        if (out?.said) setSaid(out.said)
        reread()
        return true
    }

    async function answer(request, chosen) {
        if (chosen === 'new_product') { setAdding(request); return }
        if (chosen === 'version') { setMatching(request); return }

        if (chosen === 'not_stock' || chosen === 'do_not_buy') {
            const ok = await confirm({
                title: chosen === 'not_stock' ? 'Not stock?' : 'Do not buy it?',
                message: chosen === 'not_stock'
                    ? `Code ${request.supplier_code} stops being asked about at ${request.restaurants?.name || 'that restaurant'}. `
                        + 'Its lines still count towards the week\'s cost.'
                    : `${request.name || request.description} is not added to the brand's list. `
                        + 'What was already bought still counts towards the week\'s cost.',
                confirmLabel: chosen === 'not_stock' ? 'It is not stock' : 'Do not buy it',
            })
            if (!ok) return
        }
        await finish(async () => {
            const out = await settleRequest(request, { answer: chosen, userId: user?.id })
            return { ...out, said: out.error ? '' : answeredWords(chosen) }
        }, `${request.id}-${chosen}`)
    }

    if (!requests.length && !error) return null

    return (
        <div className={`${card} mb-6 overflow-hidden`}>
            <div className={`${cardHeader} flex items-center justify-between gap-3`}>
                <span>Sent for review</span>
                <span className="normal-case tracking-normal font-normal">{requests.length}</span>
            </div>

            <div className="p-4 space-y-3">
                <ErrorBanner>{error}</ErrorBanner>
                <Notice tone="good">{said}</Notice>

                {requests.map(request => (
                    <div key={request.id} className="border border-border rounded-lg p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                            <p className="text-sm font-bold text-gray-900 min-w-0 break-words">
                                {request.name || request.description}
                            </p>
                            <span className={`${badge} border bg-gray-100 text-gray-700 border-gray-300`}>
                                {kindWords(request)}
                            </span>
                        </div>

                        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm mb-3">
                            <dt className="text-xs text-muted pt-0.5">Sent by</dt>
                            <dd className="text-gray-900">
                                {[senderName(request), request.restaurants?.name].filter(Boolean).join(', ')}
                            </dd>
                            <dt className="text-xs text-muted pt-0.5">On</dt>
                            <dd className="text-gray-900">{dayLabel(stampDay(request.sent_at))}</dd>
                            {request.suppliers?.name && <>
                                <dt className="text-xs text-muted pt-0.5">Supplier</dt>
                                <dd className="text-gray-900">{request.suppliers.name}</dd>
                            </>}
                            {request.supplier_code && <>
                                <dt className="text-xs text-muted pt-0.5">Code</dt>
                                <dd className="text-gray-900 tabular-nums">{request.supplier_code}</dd>
                            </>}
                            {request.description && <>
                                <dt className="text-xs text-muted pt-0.5">On the invoice</dt>
                                <dd className="text-gray-900 break-words">{request.description}</dd>
                            </>}
                            {request.price_per_case != null && <>
                                <dt className="text-xs text-muted pt-0.5">Price</dt>
                                <dd className="text-gray-900 tabular-nums">{fmtMoney(request.price_per_case)} a case</dd>
                            </>}
                        </dl>

                        {request.reason && (
                            <p className="text-sm text-gray-700 italic mb-3">&ldquo;{request.reason}&rdquo;</p>
                        )}

                        <div className="flex flex-wrap gap-2">
                            {answersFor(request).map((chosen, i) => (
                                <button
                                    key={chosen}
                                    type="button"
                                    disabled={!!busy}
                                    onClick={() => answer(request, chosen)}
                                    className={rowButton(i === 0 ? 'good' : 'plain')}
                                >
                                    {answerLabel(chosen, request)}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {adding && (
                <AddFromRequestModal
                    request={adding}
                    onClose={() => setAdding(null)}
                    onAdd={async form => {
                        const out = await addFromRequest(adding, { ...form, userId: user?.id })
                        // Not added at all: the dialog stays open and says why.
                        if (out.error && !out.productId) return out.error
                        setAdding(null)
                        setSaid(out.error ? '' : answeredWords('new_product'))
                        // Added, and the rest did not go through. Added again
                        // it would be on the list twice, so it is answered as
                        // the version of the one now there.
                        setError(!out.error ? '' : out.answered
                            ? `${form.name.trim()} was added, but it could not be marked recommended: ${out.error}`
                            : `${form.name.trim()} was added, but the rest did not go through: ${out.error} `
                                + 'Answer it again with A version of one we have, and pick it.')
                        reread()
                        if (!out.error && form.food) navigate(`/catalogue/products/${out.productId}/allergens`)
                        return null
                    }}
                />
            )}

            {matching && (
                <MatchLineModal
                    row={{
                        line: {
                            code: matching.supplier_code,
                            description: matching.description || matching.name,
                            pack_size: matching.pack_size,
                            price_per_case: matching.price_per_case,
                        },
                        wantedUnits: matching.units_per_case != null ? Number(matching.units_per_case) : null,
                    }}
                    withPack={!!matching.supplier_code}
                    products={products}
                    onClose={() => setMatching(null)}
                    onMatch={async chosen => {
                        const request = matching
                        setMatching(null)
                        await finish(async () => {
                            const out = await settleRequest(request, {
                                answer: 'version', userId: user?.id, productId: chosen.productId,
                                unitsPerCase: chosen.unitsPerCase || null,
                            })
                            return { ...out, said: out.error ? '' : (out.said || answeredWords('version')) }
                        }, `${request.id}-version`)
                    }}
                />
            )}
        </div>
    )
}

// Who sent it: their name, or their role when the account cannot be read.
function senderName(request) {
    return request.sender?.full_name || roleLabel(request.sender?.role) || ''
}
