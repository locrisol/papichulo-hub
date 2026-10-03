// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { fieldClass } from '@/lib/controlStyles'
import ProductSelect from './ProductSelect'

const products = [
    { id: 'p1', name: 'Chicken Breast', unit: 'KG', section: 'Cold Room' },
    { id: 'p2', name: 'Rice', unit: 'KG', section: 'Dry Store' },
]

// jsdom draws nothing, so it has no scrolling a row into view.
beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
})

describe('ProductSelect', () => {
    // 16px, so an iPhone does not zoom the page in when it is tapped.
    it('is the ordinary box unless the screen asks for another', () => {
        render(<ProductSelect value="" onChange={() => {}} products={products} />)
        expect(screen.getByRole('combobox').className).toBe(fieldClass)
    })

    // Inside a dialog the dialog listens for Escape as well. Marking the press
    // handled is what lets the first one close only the list.
    it('marks an Escape handled when it closes the list, and only then', () => {
        render(<ProductSelect value="" onChange={() => {}} products={products} />)
        const box = screen.getByRole('combobox')

        fireEvent.focus(box)
        expect(screen.getByRole('listbox')).toBeInTheDocument()
        const closing = fireEvent.keyDown(box, { key: 'Escape' })
        expect(closing).toBe(false)
        expect(screen.queryByRole('listbox')).toBeNull()

        const again = fireEvent.keyDown(box, { key: 'Escape' })
        expect(again).toBe(true)
    })

    it('has thumb height rows when asked for them', () => {
        render(<ProductSelect value="" onChange={() => {}} products={products} large />)
        fireEvent.focus(screen.getByRole('combobox'))
        expect(screen.getByRole('option', { name: /Rice/ }).className).toContain('py-2.5')
    })

    it('picks what is pressed', () => {
        const onChange = vi.fn()
        render(<ProductSelect value="" onChange={onChange} products={products} />)
        fireEvent.focus(screen.getByRole('combobox'))
        fireEvent.mouseDown(screen.getByRole('option', { name: /Rice/ }))
        expect(onChange).toHaveBeenCalledWith('p2')
    })
})
