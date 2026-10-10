import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { PLACES, versionLabel } from '@/lib/brandVersions'
import {
    modalFooter, secondaryButton, primaryButton, labelClass, fieldClass, hintClass, rowButton, badge, chip,
    checkbox, checkRow, errorBanner,
} from '@/lib/controlStyles'
import AddButton from '@/components/ui/AddButton'
import Modal from '@/components/ui/Modal'
import ErrorBanner from '@/components/ui/ErrorBanner'

// The versions of one product: what can be bought for it, from whom, under
// which code, and where each is kept.
//
// Owners and the super admin choose what the brand recommends: one or more
// versions, or nothing in particular, for cleaning and packaging left free
// (his answers of 3 and 4 October). Anybody who manages a restaurant says
// where a version is kept, which is where the stock take lists it.
//
// A version starts when a restaurant prices a supplier's code this product has
// not had, so Add a price is how a store manager adds one. An owner can also
// add one before any restaurant buys it, to recommend it: the first price
// typed with its code then joins it (price_version).
export default function VersionsModal({
    product, versions, suppliers, boughtHere, canRecommend, onClose, onChanged, onAddPrice,
}) {
    const [error, setError] = useState('')
    const [busy, setBusy] = useState('')
    const [adding, setAdding] = useState(false)
    const mine = (versions || [])
        .filter(v => v.product_id === product.id)
        .sort((a, b) => Number(b.is_recommended) - Number(a.is_recommended)
            || Number(b.is_active) - Number(a.is_active)
            || versionLabel(a, product).localeCompare(versionLabel(b, product)))
    const supplierName = id => (suppliers || []).find(s => s.id === id)?.name || ''
    const anyIsFine = product.recommends === 'any'

    // Busy until the page has read the versions again, so a second tap works
    // from what the first one saved rather than from what was there before.
    async function write(key, table, patch, id) {
        setBusy(key)
        setError('')
        const { error: e1 } = await supabase.from(table).update(patch).eq('id', id)
        if (e1) { setBusy(''); setError(friendlyError(e1)); return }
        await onChanged?.()
        setBusy('')
    }

    return (
        <Modal title={`Versions of ${product.name}`} onClose={onClose} width="max-w-2xl">
            <div className="px-6 py-4 space-y-4">
                <ErrorBanner>{error}</ErrorBanner>

                {canRecommend && (
                    <div role="radiogroup" aria-labelledby="brand-recommends">
                        <p id="brand-recommends" className={labelClass}>The brand recommends</p>
                        <div className="flex flex-wrap gap-2">
                            {[
                                ['versions', 'Particular versions, starred below'],
                                ['any', 'Nothing in particular: any version is fine'],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="radio"
                                    aria-checked={product.recommends === value}
                                    disabled={!!busy}
                                    onClick={() => product.recommends !== value
                                        && write('recommends', 'products', { recommends: value }, product.id)}
                                    className={chip(product.recommends === value)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className={hintClass}>
                            With nothing in particular, the weekly report never mentions what was bought.
                        </p>
                    </div>
                )}

                <div className="rounded-lg bg-app-bg border border-border p-3 text-sm text-gray-700">
                    <p>
                        A version is added when a price is saved with a supplier and code this product has
                        not had. Each version is kept in the same place at every restaurant that buys it.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                        <button type="button" onClick={onAddPrice} className={rowButton('edit')}>
                            Add a price
                        </button>
                    </div>
                </div>

                {mine.length === 0 && (
                    <p className="text-sm text-muted">
                        No versions yet. One starts the first time a restaurant prices it from a supplier.
                    </p>
                )}

                <ul className="space-y-3">
                    {mine.map(v => {
                        const section = v.section || product.section
                        const alsoIn = v.also_in ?? product.also_in ?? []
                        return (
                            <li key={v.id} className="border border-border rounded-lg p-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-gray-900 break-words">
                                            {v.is_recommended && !anyIsFine && <span aria-hidden="true">★ </span>}
                                            {versionLabel(v, product)}
                                        </p>
                                        <p className="text-xs text-muted mt-0.5">
                                            {[supplierName(v.supplier_id), v.supplier_code && `code ${v.supplier_code}`]
                                                .filter(Boolean).join(', ')}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {v.is_recommended && !anyIsFine && (
                                            <span className={`${badge} bg-green-100 text-green-800`}>Recommended</span>
                                        )}
                                        {boughtHere.has(v.id) && (
                                            <span className={`${badge} bg-gray-100 text-gray-700`}>Bought here</span>
                                        )}
                                        {!v.is_active && (
                                            <span className={`${badge} bg-red-100 text-red-800`}>Switched off</span>
                                        )}
                                    </div>
                                </div>

                                {canRecommend && (
                                    <div className="mt-3">
                                        <label className={labelClass} htmlFor={`name-${v.id}`}>Name</label>
                                        {/* Saved on leaving the box. Empty goes back to the
                                            product's name with its code. */}
                                        <input
                                            id={`name-${v.id}`}
                                            defaultValue={v.name || ''}
                                            placeholder={versionLabel({ ...v, name: null }, product)}
                                            disabled={!!busy}
                                            onBlur={e => {
                                                const typed = e.target.value.trim() || null
                                                if (typed !== (v.name || null)) {
                                                    write(`name-${v.id}`, 'product_versions', { name: typed }, v.id)
                                                }
                                            }}
                                            className={fieldClass}
                                        />
                                    </div>
                                )}

                                <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)] mt-3">
                                    <div>
                                        <label className={labelClass} htmlFor={`kept-${v.id}`}>Kept in</label>
                                        <select
                                            id={`kept-${v.id}`}
                                            value={section}
                                            disabled={!!busy}
                                            onChange={e => write(`section-${v.id}`, 'product_versions', {
                                                section: e.target.value,
                                                also_in: alsoIn.filter(place => place !== e.target.value),
                                            }, v.id)}
                                            className={fieldClass}
                                        >
                                            {PLACES.map(place => <option key={place} value={place}>{place}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <p className={labelClass}>Also kept in</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {PLACES.filter(place => place !== section).map(place => {
                                                const on = alsoIn.includes(place)
                                                return (
                                                    <button
                                                        key={place}
                                                        type="button"
                                                        aria-pressed={on}
                                                        disabled={!!busy}
                                                        onClick={() => write(`also-${v.id}`, 'product_versions', {
                                                            section,
                                                            also_in: on ? alsoIn.filter(x => x !== place) : [...alsoIn, place],
                                                        }, v.id)}
                                                        className={chip(on)}
                                                    >
                                                        {place}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {canRecommend && !anyIsFine && (
                                    <div className="mt-3">
                                        <button
                                            type="button"
                                            disabled={!!busy}
                                            onClick={() => write(`star-${v.id}`, 'product_versions',
                                                { is_recommended: !v.is_recommended }, v.id)}
                                            className={rowButton(v.is_recommended ? 'plain' : 'good')}
                                        >
                                            {v.is_recommended ? 'Not recommended' : 'Recommend it'}
                                        </button>
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>
            </div>

            {canRecommend && (
                <div className="px-6 pb-4">
                    {adding ? (
                        <NewVersion
                            product={product}
                            suppliers={suppliers}
                            onCancel={() => setAdding(false)}
                            onAdded={async () => { setAdding(false); await onChanged?.() }}
                        />
                    ) : (
                        <AddButton onClick={() => setAdding(true)}>Add a version</AddButton>
                    )}
                </div>
            )}

            <div className={modalFooter}>
                <button type="button" onClick={onClose} className={secondaryButton}>Done</button>
            </div>
        </Modal>
    )
}

// A version no restaurant buys yet, for an owner to recommend before it is
// bought. The code is needed unless the supplier works without codes, the
// same rule as a price.
function NewVersion({ product, suppliers, onCancel, onAdded }) {
    const [supplierId, setSupplierId] = useState('')
    const [code, setCode] = useState('')
    const [name, setName] = useState('')
    const [recommend, setRecommend] = useState(true)
    const [problem, setProblem] = useState('')
    const [busy, setBusy] = useState(false)
    const live = (suppliers || []).filter(s => s.is_active !== false)
    const supplier = live.find(s => s.id === supplierId)

    async function add() {
        if (!supplierId) { setProblem('Pick the supplier.'); return }
        if (!code.trim() && !supplier?.works_without_codes) {
            setProblem(`${supplier?.name || 'This supplier'} uses codes, so say which one.`)
            return
        }
        setBusy(true)
        const { error } = await supabase.from('product_versions').insert({
            product_id: product.id,
            supplier_id: supplierId,
            supplier_code: code.trim() || null,
            name: name.trim() || null,
            is_recommended: recommend,
        })
        setBusy(false)
        if (error) {
            setProblem(error.code === '23505'
                ? 'This product already has a version with that supplier and code.'
                : friendlyError(error))
            return
        }
        await onAdded()
    }

    return (
        <div className="border border-border rounded-lg p-3 space-y-3">
            {problem && <p className={errorBanner} role="alert">{problem}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label className={labelClass} htmlFor="new-version-supplier">Supplier</label>
                    <select
                        id="new-version-supplier"
                        value={supplierId}
                        onChange={e => { setSupplierId(e.target.value); setProblem('') }}
                        className={fieldClass}
                    >
                        <option value="">Pick one</option>
                        {live.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className={labelClass} htmlFor="new-version-code">Supplier code</label>
                    <input
                        id="new-version-code"
                        value={code}
                        onChange={e => { setCode(e.target.value); setProblem('') }}
                        className={fieldClass}
                    />
                </div>
            </div>
            <div>
                <label className={labelClass} htmlFor="new-version-name">Name</label>
                <input
                    id="new-version-name"
                    value={name}
                    placeholder={product.name}
                    onChange={e => setName(e.target.value)}
                    className={fieldClass}
                />
            </div>
            <label className={checkRow}>
                <input type="checkbox" checked={recommend} onChange={e => setRecommend(e.target.checked)} className={checkbox} />
                <span className="text-sm text-gray-900">Recommend it</span>
            </label>
            <p className={hintClass}>
                No restaurant buys it yet. When one prices this supplier and code, the price joins it.
            </p>
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onCancel} className={secondaryButton}>Cancel</button>
                <button type="button" disabled={busy} onClick={add} className={primaryButton('md', 'good')}>
                    {busy ? 'Adding...' : 'Add the version'}
                </button>
            </div>
        </div>
    )
}
