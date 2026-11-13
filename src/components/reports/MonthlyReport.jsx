import { Link } from 'react-router-dom'
import { fmtMoney, fmtPct, num } from '@/lib/format'
import { weekNumber, weekRange, shortDate, stampDay } from '@/lib/dates'
import { bankHolidaysBetween, BANK_HOLIDAY_INK } from '@/lib/bankHolidays'
import { mailMissing, isOwnSection } from '@/lib/weeklyReport'
import { fourWeeksOf, monthlyWeeks, monthlyDates, sentAgain } from '@/lib/fourWeekReport'
import { card, cardHeader, badge, pageTitle, pageSubtitle } from '@/lib/controlStyles'
import BackButton from '@/components/ui/BackButton'
import ErrorBanner from '@/components/ui/ErrorBanner'
import SaveState from '@/components/ui/SaveState'
import PublishBar from '@/components/reports/PublishBar'
import Recipients from '@/components/reports/Recipients'
import ReportSectionHead from '@/components/reports/ReportSectionHead'
import ReportComments from '@/components/reports/ReportComments'
import ReportCorporateSales from '@/components/reports/ReportCorporateSales'
import CostCard from '@/components/reports/CostCard'
import AddSection from '@/components/reports/AddSection'
import { FigureRow } from '@/components/reports/ReportProfitLoss'

// The monthly report: four weekly reports, as they were sent, added up (his,
// 13 November 2026). The Hub makes it as a draft once the fourth week of the
// block is sent, and it goes out only when a manager sends it, with comments
// of its own.
//
// The same report page drives it, so the comments, sections, publish bar, who
// gets it and the send are a weekly report's own. Only what it shows is here:
// money, his pick, because the prices, checklists, paperwork and actions are
// about one week or one day and do not add up.
//
// Read only apart from the comments. The figures come from the four weeks; to
// change one, its week is reopened and sent again, and this report says so.
export default function MonthlyReport({
    report, restaurantName, sections, figures, weeks = [], blockers, warnings,
    canEdit, canWrite, saving, savedAt, writeFailed, mailed, error,
    owners, extras, extrasEditable, commentsOf, on,
}) {
    const start = report.week_start
    const block = fourWeeksOf(start)
    const sent = report.status === 'published'
    const latest = [...weeks].sort((a, b) => (a.week_start < b.week_start ? 1 : -1))[0]
    // Week 4's charts, week by week up to the end of the block: frozen onto a
    // sent monthly report, read from week 4 on a draft.
    const charts = (sent ? report.charts : latest?.charts) || {}
    const lastWeek = weekNumber(block.weeks[3])
    const again = sent && figures.fourWeeks ? sentAgain(figures.fourWeeks.weeks, weeks) : []
    const platforms = figures.platforms || []
    const online = platforms.filter(p => p.bucket === 'online_platform')
    const corporate = platforms.filter(p => p.bucket === 'catering')
    const net = num(figures.net)
    const share = amount => (net > 0 ? (num(amount) / net) * 100 : null)
    const onlineTotal = online.reduce((t, p) => t + num(p.taken), 0)

    const comments = section => (
        <ReportComments
            items={commentsOf(section)}
            canEdit={canEdit}
            onAdd={note => on.addComment(section.id, note)}
            onSave={on.saveComment}
            onRemove={on.removeItem}
            label={isOwnSection(section) ? 'Notes' : 'Comments'}
        />
    )
    const head = (section, note) => (
        <ReportSectionHead
            section={section}
            canEdit={canEdit}
            onRename={on.renameSection}
            onRemove={on.removeSection}
            note={note}
        />
    )
    const picture = (url, alt, caption) => url && (
        <figure className="mt-4">
            <img src={url} alt={alt} className="w-full rounded-lg border border-border bg-white" />
            <figcaption className="text-xs text-muted mt-2">{caption}</figcaption>
        </figure>
    )

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                    <BackButton to="/reports" className="mb-2">All reports</BackButton>
                    <h2 className={pageTitle}>Monthly report</h2>
                    <p className={pageSubtitle}>
                        {monthlyWeeks(start)} &middot; {monthlyDates(start)} &middot; {restaurantName}
                    </p>
                    {bankHolidaysBetween(start, block.end).map(holiday => (
                        <p key={holiday.date} className="text-xs font-bold mt-1" style={{ color: BANK_HOLIDAY_INK }}>
                            {holiday.name}, {shortDate(holiday.date)}
                        </p>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-3 flex-shrink-0 self-start">
                    {canEdit && <SaveState problem={writeFailed} saving={saving} savedAt={savedAt} />}
                    <span className={`${badge} ${report.status === 'draft' || mailMissing(report)
                        ? 'bg-accent-light text-accent-ink'
                        : 'bg-green-50 text-green-700'}`}>
                        {report.status === 'draft'
                            ? (report.send_count > 0 ? 'Reopened' : 'Draft')
                            : mailMissing(report) ? 'Not sent' : 'Sent'}
                    </span>
                </div>
            </div>

            {error && <ErrorBanner>{error}</ErrorBanner>}

            <PublishBar
                report={report}
                blockers={blockers}
                warnings={warnings}
                canWrite={canWrite}
                busy={saving}
                mailed={mailed}
                onPublish={on.publish}
                onReopen={on.reopen}
                onTest={on.testSend}
                onSend={on.sendUnsent}
            />

            <Recipients
                owners={owners}
                extras={extras}
                canEdit={extrasEditable}
                busy={saving}
                onChange={on.changeRecipients}
            />

            {/* MADE FROM: the four weeks, each a click away. */}
            <div className={card}>
                <div className={`${cardHeader} rounded-t-xl`}>Made from</div>
                <div className="p-4 sm:p-5">
                    <p className="text-xs text-muted mb-3">
                        The four weekly reports as they were sent, added up, so this agrees with the mails already
                        sent. Each percentage is worked out from the totals, never as an average of the weeks.
                    </p>
                    {again.length > 0 && (
                        <p className="text-sm text-amber-700 mb-3">
                            {again.length === 1 ? `Week ${weekNumber(again[0])} was` : `Weeks ${again.map(weekNumber).join(' and ')} were`}{' '}
                            sent again after this report went out. Reopen this report and send it again to bring it up to date.
                        </p>
                    )}
                    <ul className="rounded-lg border border-border divide-y divide-border bg-white">
                        {block.weeks.map(w => {
                            const row = weeks.find(r => r.week_start === w)
                            const state = !row ? 'No report sent yet'
                                : row.status !== 'published' ? 'Reopened'
                                    : `Sent ${shortDate(stampDay(row.published_at))}`
                            return (
                                <li key={w} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2.5">
                                    <span className="min-w-0">
                                        {row ? (
                                            <Link to={`/reports/${row.id}`} className="font-semibold text-gray-900 underline decoration-border underline-offset-2 hover:decoration-accent">
                                                Week {weekNumber(w)}
                                            </Link>
                                        ) : (
                                            <span className="font-semibold text-gray-900">Week {weekNumber(w)}</span>
                                        )}
                                        <span className="text-sm text-muted"> &middot; {weekRange(w)}</span>
                                    </span>
                                    <span className={`text-sm tabular-nums ${!row || row.status !== 'published' || again.includes(w)
                                        ? 'text-accent-ink' : 'text-muted'}`}>
                                        {again.includes(w) ? `${state}, sent again since` : state}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            </div>

            {sections.map(section => {
                if (section.key === 'sales_costs') {
                    return (
                        <div key={section.id} className={card}>
                            {head(section, 'Four weeks added up')}
                            <div className="p-4 sm:p-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                    <div className="rounded-lg border border-border bg-app-bg p-4">
                                        <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Net sales</p>
                                        <p className="font-serif text-3xl font-bold text-sidebar leading-none tabular-nums">
                                            {fmtMoney(figures.net)}
                                        </p>
                                        <p className="text-sm text-muted mt-2 tabular-nums">{fmtMoney(figures.gross)} gross</p>
                                    </div>
                                    <div className="rounded-lg border border-border bg-app-bg p-4">
                                        <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Trading days</p>
                                        <p className="font-serif text-3xl font-bold text-sidebar leading-none tabular-nums">
                                            {figures.tradingDays}
                                        </p>
                                        <p className="text-sm text-muted mt-2">
                                            {figures.tradingDays === 28 ? 'Open every day' : 'of the 28 days'}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <CostCard label="Food" figure={figures.food} share={figures.foodPct}
                                        shareGross={figures.foodPctGross} target={figures.targets?.food} />
                                    <CostCard label="Labour" figure={figures.labour} share={figures.labourPct}
                                        shareGross={figures.labourPctGross} target={figures.targets?.labour} />
                                    <CostCard label="Packaging and cleaning" figure={figures.packaging} share={figures.packagingPct}
                                        shareGross={figures.packagingPctGross} target={figures.targets?.packaging} />
                                </div>

                                <p className="text-xs text-muted mt-4">
                                    The four weeks as they were sent. The Cost dashboard reads the invoices as they stand
                                    today, so it can differ when one was entered after its week went out.
                                    {figures.fourWeeks?.targetsChanged && ' The targets changed during these four weeks; these are the last week\'s.'}
                                </p>

                                {/* The comments on the costs, under them (his,
                                    13 November 2026), the same as a week. */}
                                {comments(section)}

                                {picture(charts.sales, 'Net sales against what it cost, week by week',
                                    `Net sales against what it cost, week by week up to week ${lastWeek}, as drawn when week ${lastWeek} was sent.`)}
                            </div>
                        </div>
                    )
                }

                if (section.key === 'profit_loss') {
                    const overheads = figures.fourWeeks?.overheads || []
                    return (
                        <div key={section.id} className={card}>
                            {head(section, 'Four weeks added up')}
                            <div className="p-4 sm:p-5">
                                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Third party delivery costs</p>
                                <div className="rounded-lg border border-border bg-white overflow-hidden">
                                    {online.map(p => (
                                        <FigureRow
                                            key={p.id}
                                            label={p.name}
                                            hint={p.rate == null ? null : `${fmtPct(p.rate, 2)} of the ${fmtMoney(p.weekTaken)} it took`}
                                            amount={p.cost}
                                            share={share(p.cost)}
                                        />
                                    ))}
                                    <FigureRow strong tint="bg-app-bg" label="Total"
                                        hint="The share beside it is of the four weeks' net sales."
                                        amount={figures.deliveryTotal} share={share(figures.deliveryTotal)} />
                                </div>

                                <p className="text-xs font-bold text-muted uppercase tracking-wider mt-6 mb-2">Fixed overhead</p>
                                <div className="rounded-lg border border-border bg-white overflow-hidden">
                                    {overheads.filter(o => num(o.amount) !== 0).map(o => (
                                        <FigureRow key={o.key} label={o.label} amount={o.amount} share={share(o.amount)} />
                                    ))}
                                    <FigureRow strong tint="bg-app-bg" label="Total fixed overhead"
                                        amount={figures.standing} share={share(figures.standing)} />
                                </div>

                                <div className="rounded-lg border border-border bg-white overflow-hidden mt-6">
                                    <FigureRow label="Gross profit" hint="Net sales less food, packaging and labour"
                                        amount={figures.grossProfit} share={figures.grossProfitPct} />
                                    <FigureRow label="Overheads" hint="Fixed overhead and delivery"
                                        amount={figures.overhead} share={figures.overheadPct} />
                                    <FigureRow strong tint="bg-app-bg" label="Net earnings"
                                        amount={figures.earnings} share={figures.earningsPct} />
                                </div>

                                {comments(section)}
                                {picture(charts.delivery, 'What each platform kept, week by week',
                                    `What each platform kept of its sales, week by week up to week ${lastWeek}.`)}
                                {picture(charts.earnings, 'Net earnings, week by week',
                                    `Net earnings, week by week up to week ${lastWeek}.`)}
                            </div>
                        </div>
                    )
                }

                if (section.key === 'online_sales') {
                    const summary = new Map((figures.fourWeeks?.online || []).map(o => [o.id, o]))
                    return (
                        <div key={section.id} className={card}>
                            {head(section, 'Four weeks added up')}
                            <div className="p-4 sm:p-5 space-y-3">
                                <div className="rounded-lg bg-sidebar text-white px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
                                    <span className="text-xs font-bold uppercase tracking-wider opacity-75">Online revenue</span>
                                    <span className="text-right">
                                        <span className="font-serif text-2xl font-bold tabular-nums">{fmtMoney(onlineTotal)}</span>
                                        {share(onlineTotal) != null && (
                                            <span className="block text-xs tabular-nums opacity-75">{fmtPct(share(onlineTotal), 2)} of net sales</span>
                                        )}
                                    </span>
                                </div>
                                {online.map(p => {
                                    const s = summary.get(p.id)
                                    const stars = Object.entries(s?.reviews.stars || {}).sort((a, b) => b[0] - a[0])
                                    return (
                                        <div key={p.id} className="rounded-xl border border-border border-l-4 bg-app-bg p-4"
                                            style={{ borderLeftColor: p.mark || undefined }}>
                                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                                <span className="font-bold text-base text-gray-900">{p.name}</span>
                                                <span className="text-right">
                                                    <span className="font-serif text-lg font-bold text-sidebar tabular-nums">{fmtMoney(p.taken)}</span>
                                                    {share(p.taken) != null && <span className="block text-xs text-muted tabular-nums">{fmtPct(share(p.taken), 2)} of net sales</span>}
                                                </span>
                                            </div>
                                            <dl className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                                                <div>
                                                    <dt className="text-xs text-muted">Rating</dt>
                                                    <dd className="tabular-nums text-gray-900">
                                                        {s?.rating?.to == null ? 'Not recorded'
                                                            : s.rating.from == null || Math.abs(s.rating.to - s.rating.from) < 0.005
                                                                ? s.rating.to.toFixed(1)
                                                                : `${s.rating.to.toFixed(1)}, ${s.rating.to > s.rating.from ? 'up' : 'down'} from ${s.rating.from.toFixed(1)}`}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs text-muted">Reviews</dt>
                                                    <dd className="text-gray-900">
                                                        {s?.reviews.count ? `${s.reviews.count}: ${stars.map(([n, c]) => `${n}★ × ${c}`).join(', ')}` : 'None'}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs text-muted">Refunds</dt>
                                                    <dd className="tabular-nums text-gray-900">
                                                        {s?.refunds.count ? `${s.refunds.count}, ${fmtMoney(s.refunds.money)}` : 'None'}
                                                    </dd>
                                                </div>
                                            </dl>
                                        </div>
                                    )
                                })}
                                {online.length === 0 && <p className="text-sm text-muted">No online platforms took anything in these four weeks.</p>}
                                {comments(section)}
                                {picture(charts.online, 'What each platform took, week by week',
                                    `What each platform took, week by week up to week ${lastWeek}.`)}
                            </div>
                        </div>
                    )
                }

                if (section.key === 'corporate_sales') {
                    const taken = Object.fromEntries(corporate.map(p => [p.id, num(p.taken)]))
                    const notes = new Map(section.items.filter(i => i.kind === 'comment' && i.key).map(i => [i.key, i]))
                    return (
                        <div key={section.id} className={card}>
                            {head(section, 'Four weeks added up')}
                            <div className="p-4 sm:p-5">
                                <ReportCorporateSales
                                    platforms={corporate}
                                    taken={taken}
                                    notes={notes}
                                    canEdit={canEdit}
                                    onSaveNote={(platform, note) => on.savePlatformNote(section.id, platform, note)}
                                />
                                {comments(section)}
                                {picture(charts.corporate, 'Corporate orders, week by week',
                                    `Corporate orders, week by week up to week ${lastWeek}.`)}
                            </div>
                        </div>
                    )
                }

                // A section of his own: notes, nothing else.
                return (
                    <div key={section.id} className={card}>
                        {head(section)}
                        <div className="p-4 sm:p-5">
                            {comments(section)}
                            {!canEdit && commentsOf(section).length === 0 && (
                                <p className="text-sm text-muted">Nothing written for these four weeks.</p>
                            )}
                        </div>
                    </div>
                )
            })}

            {canEdit && <AddSection onAdd={on.addSection} />}
        </div>
    )
}
