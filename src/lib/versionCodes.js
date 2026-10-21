// Every code each version of the brand goes by: its own, and the others it
// gained when a supplier renumbered it and somebody said it was the same
// thing (version_codes, code_update). A code means one version at every
// restaurant, so a number first bought at one is known at the other.

import { supabase, everyRow } from '@/lib/supabase'

const tidy = code => String(code ?? '').trim().toLowerCase()

// One entry per code: { version_id, product_id, supplier_id, code, is_active }.
export function versionCodesOf(versions = [], others = []) {
    const byId = new Map((versions || []).map(v => [v.id, v]))
    const out = []
    for (const v of versions || []) {
        if (tidy(v.supplier_code)) {
            out.push({ version_id: v.id, product_id: v.product_id, supplier_id: v.supplier_id, code: v.supplier_code, is_active: v.is_active })
        }
    }
    for (const c of others || []) {
        const v = byId.get(c.version_id)
        if (!v || !tidy(c.code)) continue
        out.push({ version_id: v.id, product_id: v.product_id, supplier_id: c.supplier_id, code: c.code, is_active: v.is_active })
    }
    return out
}

// The brand's codes, read in one go. Returns { data, error }.
export async function readVersionCodes() {
    const [versions, others] = await Promise.all([
        everyRow(() => supabase.from('product_versions').select('id, product_id, supplier_id, supplier_code, is_active').order('id')),
        everyRow(() => supabase.from('version_codes').select('version_id, supplier_id, code').order('id')),
    ])
    const error = versions.error || others.error || null
    if (error) return { data: null, error }
    return { data: versionCodesOf(versions.data, others.data), error: null }
}

// The version a code belongs to, from `codes` (versionCodesOf), or null. A
// switched off version is nothing to match to. `supplierId` null when the
// list is one supplier's already.
export function versionOfCode(codes, supplierId, code) {
    const wanted = tidy(code)
    if (!wanted) return null
    return (codes || []).find(c => (
        (supplierId == null || c.supplier_id === supplierId) && tidy(c.code) === wanted && c.is_active !== false
    )) || null
}

// The products whose versions go by this supplier's code, across the brand,
// asked of the database for one code. Returns { data: [product ids], error }.
export async function productsWithCode(supplierId, code) {
    const wanted = String(code ?? '').trim()
    if (!supplierId || !wanted) return { data: [], error: null }
    // ilike for case, with its own wildcards made plain.
    const like = wanted.replace(/[\\%_]/g, ch => `\\${ch}`)
    const [own, others] = await Promise.all([
        supabase.from('product_versions').select('product_id').eq('supplier_id', supplierId).ilike('supplier_code', like),
        supabase.from('version_codes').select('product_versions(product_id)').eq('supplier_id', supplierId).ilike('code', like),
    ])
    const error = own.error || others.error || null
    if (error) return { data: null, error }
    const ids = [
        ...(own.data || []).map(r => r.product_id),
        ...(others.data || []).map(r => r.product_versions?.product_id),
    ].filter(Boolean)
    return { data: [...new Set(ids)], error: null }
}
