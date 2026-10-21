import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { shortDate } from '@/lib/dates'
import { allergensChanged } from '@/lib/allergensChanged'
import { VERSION_PICTURES, versionPicturePath } from '@/lib/photo'
import {
    badge, checkbox, checkRow, errorBanner, fieldClass, hintClass, labelClass, modalFooter, primaryButton,
    rowButton, secondaryButton, segmentButton, segmentTrack,
} from '@/lib/controlStyles'
import {
    anyVersionWords, costPreviewWords, groupsOf, ownPrice, priceWords, setWith, standingOf, withFallback, withoutFallback,
} from '@/lib/recommended'
import { readCostPrices, readMenuCosting } from '@/lib/costPrices'
import { dishChanges } from '@/lib/mixCost'
import { useConfirm } from '@/context/confirm'
import AddButton from '@/components/ui/AddButton'
import ArrangeList from '@/components/ui/ArrangeList'
import AutoTextarea from '@/components/ui/AutoTextarea'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Modal from '@/components/ui/Modal'
import ModalSection from '@/components/ui/ModalSection'
import PhotoButton from '@/components/ui/PhotoButton'
import PhotoStrip from '@/components/ui/PhotoStrip'
import SupplierBadge from '@/components/ui/SupplierBadge'

const MOST_PICTURES = 4

// Changing one product on the Recommended list: owners and the super admin.
//
// The versions that are all fine (Any of these), the ones bought only when
// those are out, in order, and everything else it has been bought as. Each
// recommended version and fallback has its pictures, name, description and
// buying notes here. Every change is saved as it is made, and the list
// behind is read again before the next one, so a second tap works from what
// the first saved.
//
// The database holds the same line as the buttons (brand_choice_guard), so
// a store manager who reached this some other way could change nothing.
export default function RecommendedEditor({ product, list, supplierName, userId, onClose, onChanged }) {
    const confirm = useConfirm()
    const [busy, setBusy] = useState('')
    const [error, setError] = useState('')
    const [arranging, setArranging] = useState(false)
    const [adding, setAdding] = useState(false)
    const groups = groupsOf(product, list.versions)
    const particular = product.recommends !== 'any'

    // One change, then the list read again. Busy until then.
    async function run(key, write, { sheetMayChange = false } = {}) {
        setBusy(key)
        setError('')
        const { error: failed } = await write()
        if (failed) { setBusy(''); setError(friendlyError(failed)); return false }
        // What is recommended, and what is switched off, can change which
        // versions a restaurant's allergen sheet reads when it has bought
        // none of them, so the sidebar counts again.
        if (sheetMayChange) allergensChanged()
        await onChanged()
        setBusy('')
        return true
    }
    const change = (key, id, patch, options) => run(key, () => supabase.from('product_versions').update(patch).eq('id', id), options)

    // A name, description or notes, saved on leaving its box. Not through
    // run: a text save locking the buttons would swallow the tap that took
    // the cursor out of the box. Whatever is typed and not saved yet waits in
    // `typing`, so closing the dialog saves it first, Escape included.
    const typing = useRef(new Map())
    function typed(version, column, text) {
        typing.current.set(`${version.id} ${column}`, { version, column, text })
    }
    async function saveText(version, column, text) {
        typing.current.delete(`${version.id} ${column}`)
        const value = text.trim() || null
        if (value === (version[column] || null)) return true
        setError('')
        const { error: failed } = await supabase.from('product_versions').update({ [column]: value }).eq('id', version.id)
        if (failed) { setError(friendlyError(failed)); return false }
        await onChanged()
        return true
    }
    async function close() {
        for (const { version, column, text } of [...typing.current.values()]) {
            if (!(await saveText(version, column, text))) return
        }
        onClose()
    }
    const fallbacksTo = (key, ids) => run(key, () => supabase.rpc('set_fallbacks', { product: product.id, versions: ids }), { sheetMayChange: true })

    // Before a change to which versions recipes cost from, what it does to
    // the cost at each restaurant and to the dishes (his note on step 1, 18
    // October 2026). The database works the cost out, since the other
    // restaurant's prices are not an owner's to read; the dishes are worked
    // out here for each restaurant whose costs can be read. True to go
    // ahead: straight away when nothing would cost anything different, or
    // when `also`, anything else the question has to say, is nothing either.
    const menu = useRef(null)
    async function costsAllowed(nextIds, { title, confirmLabel, also = '' }) {
        const { data: rows, error: failed } = await supabase.rpc('recommended_cost_preview', { product: product.id, versions: nextIds })
        if (failed) { setError(friendlyError(failed)); return false }
        let words = costPreviewWords(product, rows)
        if (words) {
            if (!menu.current) menu.current = (await readMenuCosting()).data
            const dishes = {}
            for (const r of rows) {
                if (!menu.current || r.cost_after == null) continue
                const { data: costs } = await readCostPrices(r.restaurant_id)
                if (costs?.length) dishes[r.restaurant_id] = dishChanges(product.id, r.cost_after, { ...menu.current, costPrices: costs })
            }
            words = costPreviewWords(product, rows, dishes)
        }
        if (!words) return also ? confirm({ title, message: also, confirmLabel }) : true
        return confirm({
            title, message: [also, words.message].filter(Boolean).join('\n\n'), details: words.details, groups: words.groups, confirmLabel,
        })
    }
    async function changeSet(key, nextIds, ask, write) {
        if (busy) return
        setBusy(key)
        setError('')
        const go = await costsAllowed(nextIds, ask)
        setBusy('')
        if (go) await run(key, write, { sheetMayChange: true })
    }
    const star = (id, patch) => () => supabase.from('product_versions').update(patch).eq('id', id)

    async function choose(mode) {
        if (mode === product.recommends || busy) return
        if (mode === 'any') {
            setBusy('mode')
            setError('')
            const go = await costsAllowed([], { title: 'Any version?', confirmLabel: 'Any version', also: anyVersionWords(product, groups) })
            setBusy('')
            if (!go) return
        }
        await run('mode', () => supabase.rpc('set_recommends', { product: product.id, mode }), { sheetMayChange: true })
    }

    const shared = { product, list, supplierName, busy, userId, run, typed, saveText }

    return (
        <Modal title={product.name} onClose={close} width="max-w-2xl">
            <div className="px-6 pt-4">
                <ErrorBanner className="mb-3">{error}</ErrorBanner>
                <p id="brand-recommends" className={labelClass}>The brand recommends</p>
                <div role="radiogroup" aria-labelledby="brand-recommends" className={segmentTrack}>
                    {[['versions', 'Particular versions'], ['any', 'Any version']].map(([mode, label]) => (
                        <button
                            key={mode}
                            type="button"
                            role="radio"
                            aria-checked={product.recommends === mode}
                            disabled={!!busy}
                            onClick={() => choose(mode)}
                            className={segmentButton(product.recommends === mode, true)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {!particular && (
                    <p className={hintClass}>Any version is fine, and the weekly report does not check what is bought.</p>
                )}
            </div>

            {particular && (
                <ModalSection
                    title={groups.set.length > 1 ? 'Any of these' : 'Recommended'}
                    description={groups.set.length > 1 ? 'All equally fine, bought depending on stock.' : null}
                >
                    {groups.set.length === 0 && (
                        <p className="text-sm text-muted border border-dashed border-gray-300 rounded-lg p-3">
                            Nothing recommended yet. Add one from Other versions below.
                        </p>
                    )}
                    <ul className="space-y-3">
                        {groups.set.map(v => (
                            <VersionCard key={v.id} version={v} {...shared}>
                                <button
                                    type="button"
                                    disabled={!!busy}
                                    onClick={() => changeSet(`fallback-${v.id}`, setWith(groups, v.id, false),
                                        { title: 'Make it a fallback?', confirmLabel: 'Make it a fallback' },
                                        () => supabase.rpc('set_fallbacks', { product: product.id, versions: withFallback(groups.fallbacks, v.id) }))}
                                    className={rowButton()}
                                >
                                    Make it a fallback
                                </button>
                                <button
                                    type="button"
                                    disabled={!!busy}
                                    onClick={() => changeSet(`star-${v.id}`, setWith(groups, v.id, false),
                                        { title: 'Take it off the list?', confirmLabel: 'Take off the list' },
                                        star(v.id, { is_recommended: false }))}
                                    className={rowButton()}
                                >
                                    Take off the list
                                </button>
                            </VersionCard>
                        ))}
                    </ul>
                </ModalSection>
            )}

            {particular && (
                <ModalSection
                    title="If those are out, in order"
                    description="Bought only when none of the above is in stock, the first one first."
                >
                    {groups.fallbacks.length === 0 && (
                        <p className="text-sm text-muted border border-dashed border-gray-300 rounded-lg p-3">
                            None yet. Add one from Other versions below.
                        </p>
                    )}
                    <ul className="space-y-3">
                        {groups.fallbacks.map(v => (
                            <VersionCard key={v.id} version={v} {...shared}>
                                <button
                                    type="button"
                                    disabled={!!busy}
                                    onClick={() => changeSet(`star-${v.id}`, setWith(groups, v.id, true),
                                        { title: 'Add it to the list?', confirmLabel: 'Add to the list' },
                                        star(v.id, { is_recommended: true, fallback_rank: null }))}
                                    className={rowButton('good')}
                                >
                                    Add to the list
                                </button>
                                <button
                                    type="button"
                                    disabled={!!busy}
                                    onClick={() => fallbacksTo(`fallback-${v.id}`, withoutFallback(groups.fallbacks, v.id))}
                                    className={rowButton()}
                                >
                                    Not a fallback
                                </button>
                            </VersionCard>
                        ))}
                    </ul>
                    {groups.fallbacks.length > 1 && (
                        <button type="button" disabled={!!busy} onClick={() => setArranging(true)} className={`${rowButton()} mt-3`}>
                            Change the order
                        </button>
                    )}
                </ModalSection>
            )}

            <ModalSection title={particular ? 'Other versions' : 'Versions'}>
                {groups.others.length === 0 && (
                    <p className="text-sm text-muted">
                        {particular ? 'Every version it has is on the list.' : 'No versions yet. One starts the first time a restaurant prices it.'}
                    </p>
                )}
                <ul className="space-y-3">
                    {groups.others.map(v => (
                        <ShortCard key={v.id} version={v} {...shared}>
                            {particular && (
                                <>
                                    <button
                                        type="button"
                                        disabled={!!busy}
                                        onClick={() => changeSet(`star-${v.id}`, setWith(groups, v.id, true),
                                            { title: 'Add it to the list?', confirmLabel: 'Add to the list' },
                                            star(v.id, { is_recommended: true }))}
                                        className={rowButton('edit')}
                                    >
                                        Add to the list
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!!busy}
                                        onClick={() => fallbacksTo(`fallback-${v.id}`, withFallback(groups.fallbacks, v.id))}
                                        className={rowButton()}
                                    >
                                        Add as a fallback
                                    </button>
                                </>
                            )}
                            <button
                                type="button"
                                disabled={!!busy}
                                onClick={() => change(`active-${v.id}`, v.id, { is_active: false }, { sheetMayChange: true })}
                                className={rowButton('danger')}
                            >
                                Switch off
                            </button>
                        </ShortCard>
                    ))}
                </ul>

                <div className="mt-4">
                    {adding ? (
                        <NewVersion
                            product={product}
                            suppliers={list.suppliers}
                            canRecommend={particular}
                            run={run}
                            onCancel={() => setAdding(false)}
                            onAdded={() => setAdding(false)}
                        />
                    ) : (
                        <AddButton onClick={() => setAdding(true)}>Add a version</AddButton>
                    )}
                </div>
            </ModalSection>

            {groups.off.length > 0 && (
                <ModalSection
                    title="Switched off"
                    description="Kept for what was bought before. A switched off version is on no list and no allergen sheet."
                >
                    <ul className="space-y-3">
                        {groups.off.map(v => (
                            <ShortCard key={v.id} version={v} {...shared}>
                                <button
                                    type="button"
                                    disabled={!!busy}
                                    onClick={() => change(`active-${v.id}`, v.id, { is_active: true }, { sheetMayChange: true })}
                                    className={rowButton('good')}
                                >
                                    Switch back on
                                </button>
                            </ShortCard>
                        ))}
                    </ul>
                </ModalSection>
            )}

            <div className={modalFooter}>
                <button type="button" onClick={close} className={secondaryButton}>Done</button>
            </div>

            {arranging && (
                <ArrangeList
                    title="Order of the fallbacks"
                    note="The first one is bought first when none of the recommended versions is in stock."
                    items={groups.fallbacks}
                    nameOf={v => v.name || `${product.name}, ${v.supplier_code || supplierName(v.supplier_id)}`}
                    onClose={() => setArranging(false)}
                    onSave={async order => {
                        if (await fallbacksTo('order', order.map(v => v.id))) setArranging(false)
                    }}
                />
            )}
        </Modal>
    )
}

// Who sells it under which code, what it costs at the restaurant open, and
// how often it was bought there.
function Source({ version, product, list, supplierName, withPurchases = false }) {
    const price = ownPrice(version.id, list.prices)
    const bought = list.purchases.get(version.id)
    const codes = [version.supplier_code, ...version.codes].filter(Boolean)
    const said = [
        codes.length > 0 && `code ${codes.join(', ')}`,
        price ? priceWords(price, product.unit) : 'not bought here yet',
        withPurchases && bought && `bought ${bought.times === 1 ? 'once' : `${bought.times} times`}, last ${shortDate(bought.last)}`,
    ].filter(Boolean).join(' · ')
    return (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <SupplierBadge name={supplierName(version.supplier_id)} />
            <span>{said}</span>
        </p>
    )
}

// A recommended version or a fallback: everything the list says about it,
// to change. Text is saved on leaving its box.
function VersionCard({ version, product, list, supplierName, busy, userId, run, typed, saveText, children }) {
    const confirm = useConfirm()
    const [problem, setProblem] = useState('')
    const standing = standingOf(version, product, list.versions)
    const pictures = list.pictures.get(version.id) || []
    // Where the next picture goes, counted on from the ones already there, so
    // two chosen at once do not land on the same place.
    const nextPlace = useRef(0)

    // The file is up by now. If its row cannot be saved, the file goes again
    // rather than sitting in the bucket with nothing pointing at it.
    async function pictureAdded(path) {
        const place = Math.max(nextPlace.current, pictures.length)
        nextPlace.current = place + 1
        setProblem('')
        const saved = await run(`picture-${version.id}`, () => supabase.from('version_pictures').insert({
            version_id: version.id, path, sort_order: place, added_by: userId,
        }))
        if (!saved) await supabase.storage.from(VERSION_PICTURES).remove([path])
    }

    async function takeOff(path) {
        if (!(await confirm({ title: 'Take off this picture?', confirmLabel: 'Take it off', tone: 'danger' }))) return
        const done = await run(`picture-${version.id}`, () => supabase.from('version_pictures').delete().eq('path', path))
        // The row is what the list reads, so it goes first. A file left behind
        // if this fails is out of sight and harmless.
        if (done) await supabase.storage.from(VERSION_PICTURES).remove([path])
    }

    return (
        <li className="border border-border rounded-lg p-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    {standing?.tone === 'fallback' && <span className={`${badge} bg-blue-50 text-blue-800`}>{standing.label}</span>}
                </div>
                <div className="flex flex-wrap justify-end gap-2">{children}</div>
            </div>

            <div>
                <label className={labelClass} htmlFor={`name-${version.id}`}>Name</label>
                <input
                    id={`name-${version.id}`}
                    defaultValue={version.name || ''}
                    placeholder={product.name}
                    disabled={!!busy}
                    onChange={e => typed(version, 'name', e.target.value)}
                    onBlur={e => saveText(version, 'name', e.target.value)}
                    className={fieldClass}
                />
            </div>
            <Source version={version} product={product} list={list} supplierName={supplierName} />

            <div>
                <label className={labelClass} htmlFor={`description-${version.id}`}>Description</label>
                <input
                    id={`description-${version.id}`}
                    defaultValue={version.description || ''}
                    disabled={!!busy}
                    onChange={e => typed(version, 'description', e.target.value)}
                    onBlur={e => saveText(version, 'description', e.target.value)}
                    className={fieldClass}
                />
                <p className={hintClass}>What it is and how to tell it apart: the brand, the size, how it looks.</p>
            </div>
            <div>
                <label className={labelClass} htmlFor={`notes-${version.id}`}>Buying notes</label>
                <AutoTextarea
                    id={`notes-${version.id}`}
                    minRows={2}
                    defaultValue={version.notes || ''}
                    disabled={!!busy}
                    onChange={e => typed(version, 'notes', e.target.value)}
                    onBlur={e => saveText(version, 'notes', e.target.value)}
                    className={fieldClass}
                />
                <p className={hintClass}>Where and how it is bought, for whoever orders it.</p>
            </div>

            <div>
                <p className={labelClass}>Pictures</p>
                {problem && <p className={errorBanner} role="alert">{problem}</p>}
                <PhotoStrip paths={pictures} onRemove={busy ? undefined : takeOff} label="Picture" bucket={VERSION_PICTURES} />
                {pictures.length < MOST_PICTURES && (
                    <PhotoButton
                        bucket={VERSION_PICTURES}
                        makePath={() => versionPicturePath(version.id)}
                        room={MOST_PICTURES - pictures.length}
                        onAdded={pictureAdded}
                        onError={setProblem}
                        className="mt-2"
                    >
                        Add a picture
                    </PhotoButton>
                )}
                <p className={hintClass}>Up to four.</p>
            </div>
        </li>
    )
}

// A version that is on neither list, or is switched off: what it is, with
// what can be done about it.
function ShortCard({ version, product, list, supplierName, children }) {
    return (
        <li className="border border-border rounded-lg p-3">
            <p className="text-sm font-semibold text-gray-900 break-words">{version.name || product.name}</p>
            <div className="mt-1">
                <Source version={version} product={product} list={list} supplierName={supplierName} withPurchases />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">{children}</div>
        </li>
    )
}

// A version no restaurant buys yet, to put on the list before anybody does.
// The code is needed unless the supplier works without codes, the same rule
// as a price. The first price saved with that supplier and code joins it
// (price_version).
function NewVersion({ product, suppliers, canRecommend, run, onCancel, onAdded }) {
    const [supplierId, setSupplierId] = useState('')
    const [code, setCode] = useState('')
    const [name, setName] = useState('')
    const [recommend, setRecommend] = useState(canRecommend)
    const [problem, setProblem] = useState('')
    const [saving, setSaving] = useState(false)
    const live = (suppliers || []).filter(s => s.is_active !== false)
    const supplier = live.find(s => s.id === supplierId)

    async function add() {
        if (!supplierId) { setProblem('Pick the supplier.'); return }
        if (!code.trim() && !supplier?.works_without_codes) {
            setProblem(`${supplier?.name || 'This supplier'} uses codes, so say which one.`)
            return
        }
        setSaving(true)
        let clash = false
        const done = await run('add', async () => {
            const { error } = await supabase.from('product_versions').insert({
                product_id: product.id,
                supplier_id: supplierId,
                supplier_code: code.trim() || null,
                name: name.trim() || null,
                is_recommended: canRecommend && recommend,
            })
            // Said here beside the boxes rather than at the top of the dialog.
            clash = error?.code === '23505'
            return { error: clash ? null : error }
        })
        setSaving(false)
        if (clash) { setProblem('This product already has a version with that supplier and code.'); return }
        if (done) onAdded()
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
            {canRecommend && (
                <label className={checkRow}>
                    <input type="checkbox" checked={recommend} onChange={e => setRecommend(e.target.checked)} className={checkbox} />
                    <span className="text-sm text-gray-900">Add it to the list</span>
                </label>
            )}
            <p className={hintClass}>
                No restaurant buys it yet. When one prices this supplier and code, the price joins it.
            </p>
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onCancel} className={secondaryButton}>Cancel</button>
                <button type="button" disabled={saving} onClick={add} className={primaryButton('md', 'good')}>
                    {saving ? 'Adding...' : 'Add the version'}
                </button>
            </div>
        </div>
    )
}
