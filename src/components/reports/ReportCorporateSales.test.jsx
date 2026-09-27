// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReportCorporateSales from '@/components/reports/ReportCorporateSales'
import { accountColour } from '@/lib/reportCharts'

// The week of 13 September.
const platforms = [
    { id: 'c', name: 'Clockmeal' },
    { id: 'l', name: 'Lunch Team' },
    { id: 'f', name: 'Feedr' },
    { id: 'k', name: 'Catering' },
]
const taken = { c: 150, l: 1102.5, f: 2052.44, k: 745 }

function draw(over = {}) {
    return render(
        <ReportCorporateSales
            platforms={platforms} taken={taken} notes={new Map()} canEdit={false} onSaveNote={() => {}}
            {...over}
        />,
    )
}

const barOf = name => screen.getByRole('img', { name: new RegExp(`^${name}:`) }).firstChild

describe('ReportCorporateSales', () => {
    // His catch, 27 September: the bars were sized against the biggest account,
    // so Feedr always filled its bar, and under the total that read as if it
    // were all of it.
    it('fills each bar to its share of the total', () => {
        draw()
        expect(barOf('Feedr').style.width).toMatch(/^50\.67/)
        expect(barOf('Lunch Team').style.width).toMatch(/^27\.22/)
        expect(barOf('Clockmeal').style.width).toMatch(/^3\.70/)
    })

    it('says the share beside the money', () => {
        draw()
        expect(screen.getByText('50.7%')).toBeTruthy()
        expect(screen.getByText('18.4%')).toBeTruthy()
    })

    it('still puts the biggest first', () => {
        draw()
        const names = screen.getAllByText(/^(Feedr|Lunch Team|Catering|Clockmeal)$/).map(el => el.textContent)
        expect(names).toEqual(['Feedr', 'Lunch Team', 'Catering', 'Clockmeal'])
    })

    it("asks for a comment by the account's name", () => {
        draw({ canEdit: true })
        expect(screen.getByPlaceholderText('Add a comment for Feedr')).toBeTruthy()
        expect(screen.getByPlaceholderText('Add a comment for Lunch Team')).toBeTruthy()
    })

    // The colour its line has on the Corporate sales chart, which hands them
    // out in the order the accounts are set up, not by size.
    it('wears the colour its line has on the chart', () => {
        draw()
        const feedr = accountColour(platforms, 'f')
        expect(feedr).not.toBe(accountColour(platforms, 'l'))
        const bar = barOf('Feedr')
        const toHex = rgb => '#' + rgb.match(/\d+/g).slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()
        expect(toHex(bar.style.background)).toBe(feedr.toUpperCase())
    })

    it('draws empty bars and no share for a week with nothing taken', () => {
        draw({ taken: {} })
        expect(barOf('Feedr').style.width).toBe('0%')
        expect(screen.queryByText(/%$/)).toBeNull()
    })
})
