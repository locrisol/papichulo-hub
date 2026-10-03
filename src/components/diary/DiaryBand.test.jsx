// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DiaryBand from '@/components/diary/DiaryBand'

// One diary entry drawn across the days it covers. An end that carries on past
// the edge of the row is squared off and carries an arrow, in the month and in
// the week alike. Invented entry.
const entry = { id: 'd1', kind: 'promotion', title: 'Two for one week' }

describe('the ends of a band', () => {
    it('squares off and points out of the row at the end that carries on', () => {
        render(<DiaryBand entry={entry} runsIn runsOn />)
        const band = screen.getByText(/Two for one week/)
        expect(band.textContent).toBe('‹ Two for one week ›')
        expect(band.className).toContain('rounded-l-none')
        expect(band.className).toContain('rounded-r-none')
    })

    it('keeps its rounded ends when it starts and stops inside the row', () => {
        render(<DiaryBand entry={entry} />)
        const band = screen.getByText('Two for one week')
        expect(band.textContent).toBe('Two for one week')
        expect(band.className).not.toContain('rounded-l-none')
        expect(band.className).not.toContain('rounded-r-none')
    })

    it('marks only the side that runs on', () => {
        render(<DiaryBand entry={entry} runsOn />)
        const band = screen.getByText(/Two for one week/)
        expect(band.textContent).toBe('Two for one week ›')
        expect(band.className).not.toContain('rounded-l-none')
        expect(band.className).toContain('rounded-r-none')
    })
})

describe('the size', () => {
    it('is the smaller one in the month', () => {
        render(<DiaryBand entry={entry} compact />)
        const band = screen.getByText('Two for one week')
        expect(band.className).toContain('text-[0.6875rem]')
        expect(band.className).not.toContain('text-xs')
    })

    it('is the ordinary one in the week', () => {
        render(<DiaryBand entry={entry} />)
        expect(screen.getByText('Two for one week').className).toContain('text-xs')
    })
})

describe('who can open it', () => {
    it('opens the entry for somebody who can change it', async () => {
        const onOpen = vi.fn()
        render(<DiaryBand entry={entry} canEdit onOpen={onOpen} />)
        await userEvent.click(screen.getByRole('button', { name: 'Two for one week' }))
        expect(onOpen).toHaveBeenCalledWith(entry)
    })

    it('is a label, not a button, for anybody else', () => {
        render(<DiaryBand entry={entry} onOpen={vi.fn()} />)
        expect(screen.queryByRole('button')).toBeNull()
        expect(screen.getByText('Two for one week')).toBeInTheDocument()
    })
})
