// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// What the bar says about a report once it has been published.
//
// The mail is sent after the report is frozen, and when Gmail dropped the
// connection twice the manager was told once, on that page, and nowhere
// after. Every later look at it said Sent, and the only way to try again was
// to re-open it, which sent the owners a correction of a mail they never got.

const { default: PublishBar } = await import('./PublishBar')

function draw(report, more = {}) {
    const handlers = { onPublish: vi.fn(), onReopen: vi.fn(), onTest: vi.fn(), onSend: vi.fn() }
    render(
        <PublishBar report={report} blockers={[]} warnings={[]} canWrite busy={false} mailed={null} {...handlers} {...more} />,
    )
    return handlers
}

describe('a published report whose mail never went', () => {
    const report = { status: 'published', send_count: 1, sent_to: null, published_at: '2026-09-28T09:00:00Z' }

    it('says it was not sent', () => {
        draw(report)
        expect(screen.getByText('Published, not sent')).toBeInTheDocument()
        expect(screen.queryByText(/^Sent/)).not.toBeInTheDocument()
    })

    it('offers to send it, without re-opening it', () => {
        const { onSend, onReopen } = draw(report)
        fireEvent.click(screen.getByRole('button', { name: 'Send it' }))
        expect(onSend).toHaveBeenCalled()
        expect(onReopen).not.toHaveBeenCalled()
    })

    it('does not offer it twice while one is going', () => {
        draw(report, { busy: true })
        expect(screen.getByRole('button', { name: 'Sending' })).toBeDisabled()
    })
})

describe('a published report that went out', () => {
    it('says it was sent, and to whom', () => {
        draw({ status: 'published', send_count: 1, sent_to: ['owner@papichulo.ie'], published_at: '2026-09-28T09:00:00Z' })
        expect(screen.getByText(/^Sent, last on/)).toBeInTheDocument()
        expect(screen.getByText('It went to owner@papichulo.ie.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Send it' })).not.toBeInTheDocument()
    })

    // The database gives the time back in UTC. Cut to its first ten
    // characters, a report sent just after midnight in summer said the day
    // before. Built from local parts so it reads the same on any machine.
    it('says the day it was sent here', () => {
        const justAfterMidnight = new Date(2026, 8, 28, 0, 30).toISOString()
        draw({ status: 'published', send_count: 1, sent_to: ['owner@papichulo.ie'], published_at: justAfterMidnight })
        expect(screen.getByText('Sent, last on 28/09/2026')).toBeInTheDocument()
    })
})

describe('a report re-opened after a send that reached nobody', () => {
    it('does not call publishing it again a correction', () => {
        draw({ status: 'draft', send_count: 1, sent_to: null })
        expect(screen.getByRole('button', { name: 'Publish and send' })).toBeInTheDocument()
        expect(screen.queryByText(/marked as a correction/)).not.toBeInTheDocument()
    })

    it('still calls it a correction after one that went', () => {
        draw({ status: 'draft', send_count: 1, sent_to: ['owner@papichulo.ie'] })
        expect(screen.getByRole('button', { name: 'Publish again and re-send' })).toBeInTheDocument()
    })
})
