// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBanner from './ErrorBanner'

describe('ErrorBanner', () => {
    it('says what went wrong', () => {
        render(<ErrorBanner>Pick a category</ErrorBanner>)
        expect(screen.getByText('Pick a category')).toBeInTheDocument()
    })

    // Fifteen of the sixty five hand written ones had this and fifty did not,
    // so whether a screen reader was told about a failed save came down to
    // which file it happened in.
    it('is announced, wherever it is used', () => {
        render(<ErrorBanner>Pick a category</ErrorBanner>)
        expect(screen.getByRole('alert')).toHaveTextContent('Pick a category')
    })

    it('renders nothing at all when there is nothing to say', () => {
        const { container } = render(<ErrorBanner>{null}</ErrorBanner>)
        expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing for an empty string, which is what an unset error is', () => {
        const { container } = render(<ErrorBanner>{''}</ErrorBanner>)
        expect(container).toBeEmptyDOMElement()
    })

    it('takes the margin from whoever is using it', () => {
        render(<ErrorBanner className="mx-6 mb-4">x</ErrorBanner>)
        expect(screen.getByRole('alert').className).toContain('mx-6 mb-4')
    })
})
