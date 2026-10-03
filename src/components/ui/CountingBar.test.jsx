// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithRouter } from '@/test/helpers'
import CountingBar from './CountingBar'

function strip(container) {
    return container.querySelector('.bg-accent')
}

describe('CountingBar', () => {
    it('has a back arrow that says where it goes', () => {
        renderWithRouter(<CountingBar backTo="/checklists" backLabel="Back to checklists" title="Opening" progress={0} />)
        expect(screen.getByRole('button', { name: 'Back to checklists' })).toBeInTheDocument()
    })

    // AppLayout already has the page's h1.
    it('names what is being worked through as an h2', () => {
        renderWithRouter(<CountingBar backTo="/checklists" backLabel="Back" title="Opening" subtitle="3 of 12 done" />)
        expect(screen.getByRole('heading', { level: 2, name: 'Opening' })).toBeInTheDocument()
        expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
        expect(screen.getByText('3 of 12 done')).toBeInTheDocument()
    })

    it('shows how far through it is', () => {
        const { container } = renderWithRouter(<CountingBar backTo="/" backLabel="Back" title="x" progress={0.25} />)
        expect(strip(container).style.width).toBe('25%')
    })

    it.each([
        [1.4, '100%'],
        [-0.2, '0%'],
        [Number.NaN, '0%'],
    ])('never draws the strip past either end (%s)', (progress, width) => {
        const { container } = renderWithRouter(<CountingBar backTo="/" backLabel="Back" title="x" progress={progress} />)
        expect(strip(container).style.width).toBe(width)
    })

    it('has no strip when there is nothing to measure', () => {
        const { container } = renderWithRouter(<CountingBar backTo="/" backLabel="Back" title="x" />)
        expect(strip(container)).toBeNull()
    })

    it('puts its actions and a second line inside the bar', () => {
        renderWithRouter(
            <CountingBar backTo="/" backLabel="Back" title="x" actions={<button type="button">Review</button>}>
                <input aria-label="Find a product" />
            </CountingBar>,
        )
        expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Find a product' })).toBeInTheDocument()
    })
})
