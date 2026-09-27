// The till's Weekly Sales Summary as XML, with invented figures and an
// invented shop, for the reader's tests and the upload dialog's.
//
// No real takings in the repository. What is kept from the real file is
// everything awkward about it: the default namespace, the From and To with
// tabs and line breaks in them, the store as its own field, the figures as
// Sum fields named by day, the tender's name AFTER its seven figures in the
// same section, and the discounts subreport using the same Day1 to Day7 names
// for something that must not be read as a tender.
function field(name, value) {
    return `<Field Name="x" FieldName="${name}"><FormattedValue>${value}</FormattedValue><Value>${value}</Value></Field>`
}

function days(prefix, suffix, values) {
    return values.map((v, i) => field(`Sum ({@${prefix}_Day${i + 1}}${suffix})`, v.toFixed(2))).join('\n')
        + field(`Sum ({@${prefix}_Week}${suffix})`, values.reduce((a, b) => a + b, 0).toFixed(2))
}

function tender(name, values) {
    return `<Section SectionNumber="0">${days('Tender_Sales', ', {XCUBE_TENDER.METHODDESC}', values)}`
        + `${field('{XCUBE_TENDER.METHODDESC}', name)}</Section>`
}

export function exportOf({ from = '06 September 2026', to = '12 September 2026', store = 'Papi Chulo Testville', tenders, gross, net }) {
    return `<?xml version="1.0" encoding="UTF-8" ?>
<CrystalReport xmlns="urn:crystal-reports:schemas:report-detail">
<Group Level="1"><GroupHeader><Section SectionNumber="0">
<Text Name="Text39"><TextValue>    From\t: ${from}
    To\t: ${to}</TextValue>
</Text>
<Text Name="Text38"><TextValue> Weekly Sales Summary</TextValue></Text>
${field('{StoreInfo.DESCRIPTION}', store)}
</Section></GroupHeader>
<GroupFooter>
<Subreport Name="Discounts"><Group Level="1"><GroupFooter><Section SectionNumber="0">
${days('Discounts', ', {@DiscountName}', [1, 2, 3, 4, 5, 6, 7])}
${field('GroupName ({@DiscountName})', 'Student 20%')}
</Section></GroupFooter></Group></Subreport>
<Subreport Name="Totals"><ReportFooter>
<Section SectionNumber="0">${days('Sales_NetSales', '', net)}</Section>
<Section SectionNumber="8">${days('Sales_GrossSales', '', gross)}</Section>
</ReportFooter></Subreport>
<Subreport Name="Tenders">
${Object.entries(tenders).map(([name, values]) => `<Group Level="1"><Group Level="2"><Group Level="3"><GroupFooter>${tender(name, values)}</GroupFooter></Group></Group></Group>`).join('\n')}
<ReportFooter><Section SectionNumber="0">${days('Tender_Sales', '', gross)}</Section></ReportFooter>
</Subreport>
</GroupFooter></Group>
</CrystalReport>`
}

// A week that adds up, Sunday shut.
export const WEEK = {
    tenders: {
        CASH: [0, 10, 20, 30, 40, 50, 60],
        'Credit Card': [0, 100, 100, 100, 100, 100, 100],
        Kiosk: [0, 500, 400, 300, 200, 100, 50.5],
        'Ordu App': [0, 0, 12.5, 0, 0, 0, 0],
        Feedr: [0, 200, 0, 0, 0, 0, 0],
    },
    gross: [0, 810, 532.5, 430, 340, 250, 210.5],
    net: [0, 740, 488.4, 395, 311, 229, 193],
}

export const TENDERS = [
    { key: 'cash', label: 'Cash Sales', is_active: true, counts_toward_gross: true, sort_order: 1 },
    { key: 'card', label: 'Card', is_active: true, counts_toward_gross: true, sort_order: 2 },
    { key: 'kiosk', label: 'Kiosk', is_active: true, counts_toward_gross: true, sort_order: 3 },
    { key: 'online_sales', label: 'Online Platforms', is_active: true, counts_toward_gross: true, sort_order: 4 },
    { key: 'ordu_app', label: 'Ordu App', is_active: false, counts_toward_gross: true, sort_order: 5 },
    { key: 'feedr', label: 'Feedr', is_active: true, counts_toward_gross: true, sort_order: 6 },
]

export const DATES = ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']

export function blankWeek() {
    return Object.fromEntries(DATES.map(d => [d, {
        id: null, isClosed: false, gross: '', net: '', staffFood: '',
        tenderValues: {}, storedTenders: {}, platformValues: {},
    }]))
}

export const PLACES = { CASH: 'cash', 'Credit Card': 'card', Kiosk: 'kiosk', Feedr: 'feedr', 'Ordu App': 'kiosk' }
