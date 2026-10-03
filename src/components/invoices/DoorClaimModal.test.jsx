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
        expect(screen.getByText('You are logging: 3 single items missing.')).toBeInTheDocument()
    })

    // The dot used to vanish as it was typed, so 1.5 became 15 single items
    // with nothing said. It stays now, and the note is refused until it is a
    // whole number.
    it('keeps a dot that is typed, and refuses part of an item', async () => {
        const onSave = open()
        await userEvent.selectOptions(screen.getByLabelText('Supplier'), 's1')
        await pick('Damaged')
        await userEvent.type(screen.getByLabelText('What it was'), 'Eggs')
        await userEvent.type(screen.getByLabelText('Single items'), '1.5')
        expect(screen.getByLabelText('Single items')).toHaveValue('1.5')
        await pick('Log problem')
        expect(screen.getByRole('alert')).toHaveTextContent('Enter whole numbers only')
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
        await userEvent.selectOptions(screen.getByLabelText('Supplier'), 's1')
        await pick('Short')
        await userEvent.type(screen.getByLabelText('What it was'), 'Chorizo')
        await pick('Log problem')
        expect(screen.getByRole('alert')).toHaveTextContent('Enter how many are missing.')
        expect(onSave).not.toHaveBeenCalled()
    })

    it('says it is logging a new one', () => {
        open()
        expect(screen.getByRole('dialog', { name: 'Log a delivery problem' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Log problem' })).toBeInTheDocument()
    })

    it('hands over the same note as before', async () => {
        const onSave = open()
        await userEvent.selectOptions(screen.getByLabelText('Supplier'), 's1')
        await pick('Short')
        await userEvent.type(screen.getByLabelText('What it was'), 'Chorizo')
        await userEvent.type(screen.getByLabelText('Single items'), '3')
        await userEvent.type(screen.getByLabelText('Docket number'), '45747318')
        await pick('Log problem')
        expect(onSave).toHaveBeenCalledWith({
            supplierId: 's1', kind: 'short', what: 'Chorizo', cases: '', units: '3', docket: '45747318', note: '',
        })
    })
})

// Three full cases typed for three single items could only be taken back and
// logged again.
describe('changing a note already logged', () => {
    const CHORIZO = {
        id: 'c9', supplier_id: 's1', kind: 'short', what: 'Chorizo', cases: 3, units: 0,
        docket_number: '45747318', note: null, invoice_line_id: null,
    }

    function change(claim, onSave = vi.fn(async () => null)) {
        render(<DoorClaimModal claim={claim} suppliers={SUPPLIERS} onClose={() => {}} onSave={onSave} />)
        return onSave
    }

    it('opens with what was logged, and saves the change', async () => {
        const onSave = change(CHORIZO)
        expect(screen.getByRole('dialog', { name: 'Edit delivery problem' })).toBeInTheDocument()
        expect(screen.getByLabelText('What it was')).toHaveValue('Chorizo')
        expect(screen.getByLabelText('Full cases')).toHaveValue('3')
        expect(screen.getByLabelText('Docket number')).toHaveValue('45747318')
        expect(screen.getByText('How many are missing?')).toBeInTheDocument()

        await userEvent.clear(screen.getByLabelText('Full cases'))
        await userEvent.type(screen.getByLabelText('Single items'), '3')
        await pick('Save changes')
        expect(onSave).toHaveBeenCalledWith({
            supplierId: 's1', kind: 'short', what: 'Chorizo', cases: '', units: '3', docket: '45747318', note: '',
        })
    })

    // On a line, the supplier and the docket are that delivery's.
    it('keeps the delivery as it is once it is on a line, and says how to change it', async () => {
        const onSave = change({ ...CHORIZO, invoice_line_id: 'l1' })
        expect(screen.getByLabelText('Supplier')).toBeDisabled()
        expect(screen.getByLabelText('Supplier')).toHaveValue('Sysco Ireland')
        expect(screen.getByLabelText('Docket number')).toBeDisabled()
        expect(screen.getByText('Press Not this line to change the delivery.')).toBeInTheDocument()
        // The money is worked out and shown before anything is saved.
        await pick('Next')
        expect(onSave).toHaveBeenCalled()
    })

    // Next saves nothing yet: the money is read back on the row first.
    it('says it is working the money out while Next is pressed, and saving otherwise', async () => {
        const waiting = () => new Promise(() => {})
        change({ ...CHORIZO, invoice_line_id: 'l1' }, vi.fn(waiting))
        await pick('Next')
        expect(screen.getByRole('button', { name: 'Calculating...' })).toBeDisabled()
    })

    it('says it is saving a change to one on no line', async () => {
        change(CHORIZO, vi.fn(() => new Promise(() => {})))
        await pick('Save changes')
        expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    })

    // Its price agreed is not kept, so only its words changed saves straight
    // away with the money it has.
    it('saves a price query on a line straight away while only its words change', async () => {
        const query = { ...CHORIZO, kind: 'price', invoice_line_id: 'l1' }
        change(query)
        await userEvent.type(screen.getByLabelText('Note'), 'Rang them')
        expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
        await userEvent.type(screen.getByLabelText('Single items'), '2')
        expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
    })

    // Its week's report has gone out, so the money stays (amountFixed).
    it('shows what was wrong and how many and does not offer them once the report has gone out', async () => {
        const onSave = vi.fn(async () => null)
        render(
            <DoorClaimModal
                claim={{ ...CHORIZO, invoice_line_id: 'l1' }}
                fixed
                suppliers={SUPPLIERS}
                onClose={() => {}}
                onSave={onSave}
            />,
        )
        expect(screen.getByLabelText('What was wrong')).toHaveValue('Short, 3 cases missing')
        expect(screen.getByLabelText('What was wrong')).toBeDisabled()
        expect(screen.getByText(/has been sent, so what was wrong and how many\s+can no longer be changed\./)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Damaged' })).toBeNull()
        expect(screen.queryByLabelText('Full cases')).toBeNull()
        await userEvent.type(screen.getByLabelText('Note'), 'Rang them')
        await pick('Save changes')
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ note: 'Rang them' }))
    })

    it('shows what was wrong with the change and stays open', async () => {
        change({ ...CHORIZO, invoice_line_id: 'l1' }, vi.fn(async () => 'That line only billed 1 case, less than the count on this problem.'))
        await pick('Next')
        expect(screen.getByRole('alert')).toHaveTextContent('That line only billed 1 case')
        expect(screen.getByRole('dialog', { name: 'Edit delivery problem' })).toBeInTheDocument()
    })
})
