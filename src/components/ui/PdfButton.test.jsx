// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PdfButton from './PdfButton'

// A PDF that is still being made, finished when the test says so.
function held() {
    let finish, fail
    const done = new Promise((resolve, reject) => { finish = resolve; fail = reject })
    return { make: vi.fn(() => done), finish, fail }
}

describe('PdfButton', () => {
    it('says it is busy and cannot be pressed again while the PDF is made', async () => {
        const pdf = held()
        render(<PdfButton make={pdf.make}>Download PDF</PdfButton>)

        await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
        const button = screen.getByRole('button', { name: 'Making PDF...' })
        expect(button).toBeDisabled()

        await userEvent.click(button)
        expect(pdf.make).toHaveBeenCalledOnce()

        pdf.finish()
        expect(await screen.findByRole('button', { name: 'Download PDF' })).toBeEnabled()
    })

    it('hands a failure to the page and is ready to try again', async () => {
        const pdf = held()
        const onError = vi.fn()
        render(<PdfButton make={pdf.make} onError={onError}>PDF</PdfButton>)

        await userEvent.click(screen.getByRole('button', { name: 'PDF' }))
        const problem = new Error('No pictures')
        pdf.fail(problem)

        await waitFor(() => expect(onError).toHaveBeenCalledWith(problem))
        expect(screen.getByRole('button', { name: 'PDF' })).toBeEnabled()
    })

    it('takes its own busy words and its look from the caller', async () => {
        const pdf = held()
        render(<PdfButton make={pdf.make} busyLabel="Printing..." className="my-look">Print</PdfButton>)

        expect(screen.getByRole('button', { name: 'Print' }).className).toBe('my-look')
        await userEvent.click(screen.getByRole('button', { name: 'Print' }))
        expect(screen.getByRole('button', { name: 'Printing...' })).toBeDisabled()
        pdf.finish()
        await screen.findByRole('button', { name: 'Print' })
    })
})
