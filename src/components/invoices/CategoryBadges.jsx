import { fmtMoney } from '@/lib/format'
import { invoiceCategory, invoiceSplit } from '@/lib/invoiceCategories'
import { badge } from '@/lib/controlStyles'

// What an invoice was spent on, as the coloured labels the invoice screens use.
//
// One label for an invoice that went on one thing, which is nearly all of them
// and exactly how it looked before. A delivery that was part food and part foil
// gets a label each, with the money beside it, because one label on it would be
// wrong about some of the money whichever one was picked.
export default function CategoryBadges({ invoice }) {
    const split = invoiceSplit(invoice)
    return (
        <span className="inline-flex flex-wrap gap-1">
            {split.map(s => {
                const cat = invoiceCategory(s.category)
                return (
                    <span
                        key={s.category}
                        className={`${badge} border ${cat.soft}`}
                    >
                        {cat.label}{split.length > 1 ? ` ${fmtMoney(s.amount)}` : ''}
                    </span>
                )
            })}
        </span>
    )
}
