import { fmtMoney, fmtPct } from '@/lib/format'
import { statusFor } from '@/lib/costTargets'

// One cost, as a share of net sales, on a weekly report and on a monthly one.
//
// Net first and large, gross second and small. Net is what the business
// actually keeps and is what every target is set against; gross is here only
// because the report has always quoted it and people read for it.
//
// Green at or under target, amber within two points over, red beyond. The same
// bands the cost dashboard uses, so a week does not look different depending on
// which screen you read it on.
//
// The report prints percentages to two decimals where the rest of the app
// uses one, because a food cost moving by a tenth of a point is a real
// change on a week's turnover and gets argued about.
const pct2 = v => fmtPct(v, 2)

const TONE = {
    green: 'text-green-700',
    amber: 'text-amber-700',
    red: 'text-red-600',
    none: 'text-muted',
}

export default function CostCard({ label, figure, share, shareGross, target }) {
    const tone = TONE[statusFor(share, target)]

    return (
        <div className="rounded-lg border border-border bg-app-bg p-4">
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">{label}</p>
            <p className={`font-serif text-3xl font-bold leading-none ${tone}`}>{pct2(share)}</p>
            <p className="text-sm text-muted mt-2 tabular-nums">
                of net{target ? ` · ${target}% target` : ''}
            </p>
            <p className="text-sm text-gray-700 mt-1 tabular-nums font-semibold">{fmtMoney(figure)}</p>
            <p className="text-xs text-muted mt-0.5 tabular-nums">{pct2(shareGross)} of gross</p>
        </div>
    )
}
