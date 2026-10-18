import { supplierBadge } from '@/lib/controlStyles'

// The supplier of a version, as a badge. One look for every supplier: see
// supplierBadge in controlStyles.
export default function SupplierBadge({ name }) {
    return <span className={supplierBadge}>{name || 'Unknown supplier'}</span>
}
