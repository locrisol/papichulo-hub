// Setting the weekly report email off.
//
// Two jobs, and they are here rather than in the page because both of them are
// slow, both can fail, and neither is allowed to take the report down with it.
//
//   1. draw the five charts and put them somewhere a mail can reach
//   2. ask the function to send it
//
// **Who it goes to is not decided here.** The function works the owners out of
// the accounts for itself. All this posts is which report, and for a test the
// figures the screen is showing, because a draft has none frozen to read.

import { supabase } from './supabase'
import { chartToBlob, MAIL_WIDTH } from './reportChartImage'
import { chartSpecs, MAIL_CHART_ORDER } from './reportCharts'

const BUCKET = 'report-charts'

// Which address the app is being used from, so the link in the mail comes back
// to the same place. The function only takes it when it is one it was told to
// expect, so a preview build works and nothing else can put an address of its
// own into a mail that goes out under our name.
const origin = typeof window === 'undefined' ? '' : window.location.origin

// Draw the five and upload them.
//
// The path begins with the report's id, which is what the storage rule checks:
// a manager cannot write a picture into another restaurant's report even by
// typing the path themselves. A test writes beside the real ones rather than
// over them, so trying a draft cannot overwrite what a published report is
// already pointing at.
//
// A chart with nothing to draw is left out rather than uploaded blank, and the
// mail leaves the picture out to match.
export async function uploadCharts({ reportId, rows, onlinePlatforms, corporatePlatforms, test = false }) {
    const specs = chartSpecs({ onlinePlatforms, corporatePlatforms })
    const urls = {}

    for (const key of MAIL_CHART_ORDER) {
        const spec = specs[key]
        if (!spec) continue

        // A platform chart with no platforms has no series worth drawing.
        if (spec.platforms && spec.platforms.length === 0) continue

        let blob
        try {
            blob = await chartToBlob({
                rows,
                series: spec.series,
                stacked: spec.stacked,
                shareOf: spec.shareOf,
                format: spec.format,
                formatAxis: spec.formatAxis,
                zero: spec.zero !== false,
                width: MAIL_WIDTH,
                title: spec.title,
            })
        } catch (err) {
            // One chart that would not draw is not a reason to stop a report
            // going out. The mail is built to leave a picture out.
            console.warn(`Could not draw the ${key} chart.`, err)
            continue
        }
        if (!blob) continue

        const path = `${reportId}/${test ? 'test-' : ''}${key}.png`
        const { error } = await supabase.storage.from(BUCKET)
            .upload(path, blob, { contentType: 'image/png', upsert: true })

        if (error) {
            console.warn(`Could not upload the ${key} chart.`, error)
            continue
        }

        urls[key] = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    }

    return urls
}

// Send it. Returns what the function said, so the page can tell somebody how
// many it went to rather than saying "done" and leaving them wondering.
//
// Unlike the time off mail this one IS awaited and its answer IS shown. That
// mail is a side effect of answering a request that is already answered; this
// one is the point. A manager who presses publish and is told nothing has no
// way of knowing whether five people have the week or nobody does.
export async function sendReport({ reportId, test = false, figures, charts }) {
    const { data, error } = await supabase.functions.invoke('weekly-report-email', {
        body: { reportId, test, origin, figures, charts },
    })

    if (error) {
        // The function puts its reason in the body, and supabase-js throws away
        // everything but the status unless it is asked.
        let why = error.message
        try {
            const body = await error.context?.json?.()
            if (body?.error) why = body.error
        } catch { /* the status on its own will have to do */ }
        throw new Error(why)
    }

    return data || {}
}
