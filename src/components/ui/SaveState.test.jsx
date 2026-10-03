// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SaveState from './SaveState'

// Built from local parts rather than a Z string, so the time reads the same
// wherever the test is run.
const quarterPastTwo = new Date(2026, 9, 3, 14, 15)

describe('SaveState', () => {
    it('says how it saves before anything is typed', () => {
        render(<SaveState />)
        expect(screen.getByText('Saves as you type')).toBeInTheDocument()
    })

    it('takes its own words for that', () => {
        render(<SaveState idle="Saves as you leave each box" />)
        expect(screen.getByText('Saves as you leave each box')).toBeInTheDocument()
    })

    it('says it is saving', () => {
        render(<SaveState saving savedAt={quarterPastTwo} />)
        expect(screen.getByText('Saving')).toBeInTheDocument()
    })

    it('says when it last saved', () => {
        render(<SaveState savedAt={quarterPastTwo} />)
        expect(screen.getByText('Saved at 14:15')).toBeInTheDocument()
    })

    // The Report's copy kept saying "Saved at" after a failed write, with the
    // time of the last one that worked.
    it('says it is not saved, loudly, even with an earlier save on it', () => {
        render(<SaveState problem saving savedAt={quarterPastTwo} />)
        const line = screen.getByText('Not saved')
        expect(line.className).toContain('font-bold text-red-700')
        expect(screen.queryByText(/Saved at/)).toBeNull()
    })

    it('is announced, but only its own words', () => {
        render(<SaveState savedAt={quarterPastTwo}><span> · Sent 2 Oct</span></SaveState>)
        const live = screen.getByText('Saved at 14:15')
        expect(live).toHaveAttribute('aria-live', 'polite')
        expect(live).not.toHaveTextContent('Sent')
        expect(live.parentElement).toHaveTextContent('Saved at 14:15 · Sent 2 Oct')
    })

    it('is the small size the three screens already use', () => {
        render(<SaveState />)
        expect(screen.getByText('Saves as you type').parentElement.className).toContain('text-xs')
    })
})
