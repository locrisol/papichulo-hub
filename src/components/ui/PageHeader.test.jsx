// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PageHeader from './PageHeader'

describe('PageHeader', () => {
    // AppLayout already gives every page its h1, so a second one here would
    // be two headings saying the page's name at the same level.
    it('names the page under the header, not as a second h1', () => {
        render(<PageHeader title="Stock takes" />)
        expect(screen.getByRole('heading', { level: 2, name: 'Stock takes' })).toBeInTheDocument()
        expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    })

    it('has a line under the title only when there is one', () => {
        const { container, rerender } = render(<PageHeader title="Stock takes" />)
        expect(container.querySelector('p')).toBeNull()

        rerender(<PageHeader title="Stock takes" subtitle="Ranelagh · 3 open" />)
        expect(screen.getByText('Ranelagh · 3 open')).toBeInTheDocument()
    })

    it('puts the page\'s own buttons beside the title', () => {
        render(
            <PageHeader title="Stock takes">
                <button type="button">Start a stock take</button>
            </PageHeader>,
        )
        expect(screen.getByRole('button', { name: 'Start a stock take' })).toBeInTheDocument()
    })
})
