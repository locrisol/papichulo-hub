// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { goodNote, warningNote, urgentNote, infoNote } from '@/lib/controlStyles'
import Notice from './Notice'

describe('Notice', () => {
    it('says what it was given', () => {
        render(<Notice>Not brought back</Notice>)
        expect(screen.getByText('Not brought back')).toBeInTheDocument()
    })

    it('renders nothing at all when there is nothing to say', () => {
        const { container } = render(<Notice tone="good">{''}</Notice>)
        expect(container).toBeEmptyDOMElement()
    })

    it.each([
        ['good', goodNote],
        ['warn', warningNote],
        ['urgent', urgentNote],
        ['info', infoNote],
    ])('looks like the %s note', (tone, style) => {
        render(<Notice tone={tone}>x</Notice>)
        expect(screen.getByText('x').className).toContain(style)
    })

    // The answer to something just done is read out. A standing note on the
    // page is not, or it would be read every time the page loads.
    it.each(['good', 'warn'])('is announced when it is %s', tone => {
        render(<Notice tone={tone}>x</Notice>)
        expect(screen.getByRole('status')).toHaveTextContent('x')
    })

    it.each(['urgent', 'info'])('is not announced when it is %s', tone => {
        render(<Notice tone={tone}>x</Notice>)
        expect(screen.queryByRole('status')).toBeNull()
    })

    it('takes the margin from whoever is using it', () => {
        render(<Notice className="mb-4">x</Notice>)
        expect(screen.getByText('x').className).toContain('mb-4')
    })
})
