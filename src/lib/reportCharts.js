// What the report's five charts are made of.
//
// Here rather than in the page because two things draw them now: the screen,
// where they are SVG and can be hovered, and the mail, where they are pictures
// drawn onto a canvas at publish time. A series list written twice is a series
// list that disagrees the first time somebody adds a platform, and the picture
// that goes out to owners is the copy nobody would notice was wrong.
//
// Only the series, the scale and the words. Where they sit on the page and how
// tall they are is the page's business, and the mail's.

import { CHART_TOTAL } from './reportChart'
import { brandFor } from './platformBrand'
import { fmtMoney } from './format'

// The axis wants €14,750 rather than €14,750.00. Four gridlines each carrying
// two zeroes nobody reads is width taken off the chart itself.
const axis = v => fmtMoney(v).replace(/\.00$/, '')

// The colours off the chart that has been going out with this report for a
// year: food red, labour amber, packaging green, with net sales as the total.
// Taken down a little from the originals, which were picked for a white
// spreadsheet rather than for cream and were too light to read as a line.
const FOOD = '#BE2F24'
const LABOUR = '#BE7C1B'
const PACKAGING = '#2A8F52'

// The corporate platforms have no brand of their own, so they take a neutral
// set, ordered so the biggest is the darkest.
const CORPORATE_COLOURS = ['#1F4E5F', '#BC552B', '#2A8F52', '#8AA9B4', '#96600A', '#6B6459']

// A line per platform, plus their total.
//
// Lines rather than a stack. A stack says the parts add up to something worth
// seeing as a whole, and what is actually wanted here is which one is climbing
// and which is not. The total is on it as the heavy line so the whole is still
// there to read.
function platformSeries(platforms, totalKey, totalLabel, branded) {
    return [
        { key: totalKey, label: totalLabel, colour: CHART_TOTAL, heavy: true },
        ...platforms.map((p, i) => ({
            key: `p_${p.id}`,
            label: p.name,
            colour: branded ? brandFor(p.name).mark : CORPORATE_COLOURS[i % CORPORATE_COLOURS.length],
        })),
    ]
}

export function chartSpecs({ onlinePlatforms = [], corporatePlatforms = [] } = {}) {
    const specs = {}

    specs.sales = {
        title: 'Sales and costs',
        caption: 'Net sales against what it cost to make. Hover any week for its figures and what '
            + 'share of that week each cost was.',
        mailCaption: 'Net sales against what it cost to make, week by week.',
        stacked: ['food', 'labour', 'packaging'],
        shareOf: 'net',
        format: fmtMoney,
        formatAxis: axis,
        empty: 'No sales have been entered this year yet, so there is nothing to draw.',
        series: [
            { key: 'net', label: 'Net sales', colour: CHART_TOTAL, heavy: true },
            { key: 'food', label: 'Food', colour: FOOD },
            { key: 'labour', label: 'Labour', colour: LABOUR },
            { key: 'packaging', label: 'Packaging', colour: PACKAGING },
        ],
    }

    specs.delivery = {
        title: 'What each platform has cost',
        caption: "The percentage on hover is what that platform kept of its own takings that week, "
            + 'so forty three percent is only alarming once you can see it was thirty eight in May. '
            + 'Weeks with no report are left as gaps rather than drawn as nothing.',
        mailCaption: 'What each platform has cost, week by week.',
        pageHeading: true,
        height: 210,
        format: fmtMoney,
        formatAxis: axis,
        empty: 'No week has had its delivery costs entered yet. This fills in as reports are written.',
        // Each platform's cost is quoted against its own takings, so the figure
        // on hover is the rate it charged that week. Against total sales it
        // would look small on every platform and say nothing about any of them.
        series: [
            {
                key: 'deliveryTotal', label: 'All platforms',
                colour: CHART_TOTAL, heavy: true, shareOf: 'onlineTotal',
            },
            ...onlinePlatforms.map(p => ({
                key: `d_${p.id}`,
                label: p.name,
                colour: brandFor(p.name).mark,
                shareOf: `p_${p.id}`,
            })),
        ],
    }

    specs.earnings = {
        title: 'Net earnings, week by week',
        caption: "Hovering gives the euro and the share of that week's net sales, so both figures "
            + 'are on one chart rather than two scales on one axis.',
        mailCaption: 'Net earnings, week by week.',
        pageHeading: true,
        height: 210,
        // Earnings can be negative and a scale forced to nought would flatten a
        // bad week into the floor, which is the week worth seeing clearly.
        zero: false,
        shareOf: 'net',
        format: fmtMoney,
        formatAxis: axis,
        empty: 'No week has been written up yet, so there is nothing to compare this one against.',
        series: [{ key: 'earnings', label: 'Net earnings', colour: CHART_TOTAL, heavy: true }],
    }

    specs.online = {
        title: 'Online sales',
        caption: 'What each platform took, week by week. The tracking rows from weekly sales, '
            + 'not the till, since that is what a platform statement is reconciled against.',
        mailCaption: 'What each platform took, week by week.',
        height: 210,
        shareOf: 'onlineTotal',
        format: fmtMoney,
        formatAxis: axis,
        empty: 'Nothing has been tracked against these platforms this year yet.',
        series: platformSeries(onlinePlatforms, 'onlineTotal', 'All platforms', true),
        platforms: onlinePlatforms,
    }

    specs.corporate = {
        title: 'Corporate sales',
        caption: 'Which of them is growing. Feedr arriving and passing Lunch Team is the sort '
            + 'of thing a single week cannot show.',
        mailCaption: 'Corporate sales, week by week.',
        height: 210,
        shareOf: 'corporateTotal',
        format: fmtMoney,
        formatAxis: axis,
        empty: 'Nothing has been tracked against these accounts this year yet.',
        series: platformSeries(corporatePlatforms, 'corporateTotal', 'All accounts', false),
        platforms: corporatePlatforms,
    }

    return specs
}

// The order the charts appear in the mail, which is the order they appear on
// the report.
export const MAIL_CHART_ORDER = ['sales', 'delivery', 'earnings', 'online', 'corporate']
