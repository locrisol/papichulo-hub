// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DoorClaimModal from './DoorClaimModal'

// The Chorizo of 2 October: a case of four bags ordered, one came. The owner
// was not sure whether the boxes meant what was missing or what came, and
// typed 3 single items. Nothing on the form said which.

const SUPPLIERS = [{ id: 's1', name: 'Sysco Ireland' }]

function open(onSave = vi.fn(async () => null)) {
    render(<DoorClaimModal suppliers={SUPPLIERS} onClose={() => {}} onSave={onSave} />)
    return onSave
}

const pick = name => userEvent.click(screen.getByRole('button', { name }))

describe('the note taken at the door', () => {
    // The number means something different for each reason, so there is
    // nothing to type until the reason says what it is.
    it('asks how many only once it knows what was wrong', async () => {
        open()
        expect(screen.queryByLabelText('Full cases')).toBeNull()
        expect(screen.queryByLabelText('Single items')).toBeNull()
        await pick('Short')
        expect(screen.getByLabelText('Full cases')).toBeInTheDocument()
        expect(screen.getByLabelText('Single items')).toBeInTheDocument()
    })

    it('asks the question of the reason picked, with a worked line under it', async () => {
        open()
        await pick('Short')
        expect(screen.getByText('How many are missing?')).toBeInTheDocument()
        expect(screen.getByText(/Count what did not come, not what did\./)).toBeInTheDocument()
        expect(screen.getByText('It did not all turn up')).toBeInTheDocument()

        await pick('Price query')
        expect(screen.getByText('How many were charged the wrong price?')).toBeInTheDocument()
        expect(screen.queryByText('How many are missing?')).toBeNull()
    })

    // Loose means kilos everywhere else in the Hub.
    it('says what a single item is, and never calls it loose', async () => {
        open()
        await pick('Short')
        expect(screen.getByText('One bag, tin, bottle or tray out of a case. Not kilos.')).toBeInTheDocument()
        expect(screen.queryByText(/loose/i)).toBeNull()
    })

    // What it was is somebody's own words, often a sentence of its own, so it
    // is not pasted into this one.
    it('reads the claim back as it is typed', async () => {
        open()
        await pick('Short')
        await userEvent.type(screen.getByLabelText('What it was'), 'Chicken breast, the two trays on the bottom.')
        await userEvent.type(screen.getByLabelText('Single items'), '3')
        expect(screen.getByText('You are claiming: 3 single items missing.')).toBeInTheDocument()
    })

    // The dot used to vanish as it was typed, so 1.5 became 15 single items
    // with nothing said. It stays now, and the note is refused until it is a
    // whole number.
    it('keeps a dot that is typed, and refuses part of an item', async () => {
        const onSave = open()
        await userEvent.selectOptions(screen.getByLabelText('Who delivered it'), 's1')
        await pick('Damaged')
        await userEvent.type(screen.getByLabelText('What it was'), 'Eggs')
        await userEvent.type(screen.getByLabelText('Single items'), '1.5')
        expect(screen.getByLabelText('Single items')).toHaveValue('1.5')
        await pick('Log it')
        expect(screen.getByRole('alert')).toHaveTextContent('Count whole ones only')
        expect(onSave).not.toHaveBeenCalled()
    })

    // On a phone the boxes sat under ten two line buttons and the box for what
    // it was, far from the reason that gives them their meaning.
    it('puts the question and the boxes straight after the reasons, before what it was', async () => {
        open()
        await pick('Short')
        const question = screen.getByText('How many are missing?')
        const what = screen.getByLabelText('What it was')
        const units = screen.getByLabelText('Single items')
        const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
        expect(before(question, units)).toBe(true)
        expect(before(units, what)).toBe(true)
    })

    it('names the reason when the number is missing', async () => {
        const onSave = open()
        await userEvent.selectOptions(screen.getByLabelText('Who delivered it'), 's1')
        await pick('Short')
        await userEvent.type(screen.getByLabelText('What it was'), 'Chorizo')
        await pick('Log it')
        expect(screen.getByRole('alert')).toHaveTextContent('Say how many are missing.')
        expect(onSave).not.toHaveBeenCalled()
    })

    it('hands over the same note as before', async () => {
        const onSave = open()
        await userEvent.selectOptions(screen.getByLabelText('Who delivered it'), 's1')
        await pick('Short')
        await userEvent.type(screen.getByLabelText('What it was'), 'Chorizo')
        await userEvent.type(screen.getByLabelText('Single items'), '3')
        await userEvent.type(screen.getByLabelText('Docket number'), '45747318')
        await pick('Log it')
        expect(onSave).toHaveBeenCalledWith({
            supplierId: 's1', kind: 'short', what: 'Chorizo', cases: '', units: '3', docket: '45747318', note: '',
        })
    })
})
