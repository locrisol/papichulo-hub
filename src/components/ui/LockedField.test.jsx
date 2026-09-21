// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LockedField from './LockedField'

// A box in a form that is really being typed into, which is the only way to
// catch this: the bug was that every keystroke was fed back in as the value.
function Box({ start = '', label = 'Name', type = 'text' }) {
    const [value, setValue] = useState(start)
    return (
        <LockedField label={label} value={value}>
            <input
                type={type}
                aria-label={label}
                value={value}
                onChange={e => setValue(e.target.value)}
            />
        </LockedField>
    )
}

const typing = label => screen.queryByRole('textbox', { name: label })

describe('what is locked and what is not', () => {
    it('locks something that was already filled in when the form opened', () => {
        render(<Box start="Aoife" />)
        expect(screen.getByRole('textbox', { name: 'Name, locked' })).toBeDisabled()
    })

    it('leaves an empty box open', () => {
        render(<Box />)
        expect(typing('Name')).toBeEnabled()
    })

    it('shows the display value rather than the raw one when it is given', () => {
        render(
            <LockedField label="First day" value="2026-09-17" display="17 September 2026">
                <input aria-label="First day" readOnly value="2026-09-17" />
            </LockedField>,
        )
        expect(screen.getByRole('textbox', { name: 'First day, locked' }))
            .toHaveValue('17 September 2026')
    })
})

// His, on 21 September, typing into a brand new person. The field counted
// itself filled the moment anything was in it, so it shut on the first
// keystroke and there was no way to finish a word, never mind a date.
describe('a box being typed into is never taken away', () => {
    it('lets a name past its first letter', async () => {
        const me = userEvent.setup()
        render(<Box />)
        await me.type(typing('Name'), 'Leandro')
        expect(typing('Name')).toHaveValue('Leandro')
    })

    // A date box hands back a whole date as soon as all three of its parts
    // have anything in them, so typing "20032" towards 20/03/2000 arrives here
    // as the year 2 and reads as filled. Getting to the rest of the year has to
    // still be possible.
    it('lets a date of birth past a one figure year', () => {
        render(<Box label="Date of birth" type="date" />)
        const box = () => screen.getByLabelText('Date of birth')

        fireEvent.change(box(), { target: { value: '0002-03-20' } })
        expect(screen.queryByLabelText('Date of birth, locked')).toBeNull()

        fireEvent.change(box(), { target: { value: '2000-03-20' } })
        expect(screen.queryByLabelText('Date of birth, locked')).toBeNull()
        expect(box()).toHaveValue('2000-03-20')
    })

    it('stays open even after the box is emptied again', async () => {
        const me = userEvent.setup()
        render(<Box />)
        await me.type(typing('Name'), 'Le')
        await me.clear(typing('Name'))
        expect(typing('Name')).toBeEnabled()
    })
})

describe('opening a locked one', () => {
    it('hands the box over, with the cursor already in it', async () => {
        const me = userEvent.setup()
        render(<Box start="Aoife" />)

        await me.click(screen.getByRole('button', { name: 'Edit name' }))

        const box = typing('Name')
        expect(box).toBeEnabled()
        // Pressing Edit takes the Edit button away with it, and focus with it
        // unless somebody puts it back.
        expect(box).toHaveFocus()
    })

    it('does not lock again while it is being retyped', async () => {
        const me = userEvent.setup()
        render(<Box start="Aoife" />)
        await me.click(screen.getByRole('button', { name: 'Edit name' }))
        await me.clear(typing('Name'))
        await me.type(typing('Name'), 'Aoibhe')
        expect(typing('Name')).toHaveValue('Aoibhe')
    })
})
