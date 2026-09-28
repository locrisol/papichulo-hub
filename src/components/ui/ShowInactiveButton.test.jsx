// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

let who = null
vi.mock('@/context/auth', () => ({ useAuth: () => ({ user: who }) }))

const { default: ShowInactiveButton } = await import('./ShowInactiveButton')

function asRole(role) {
    who = role ? { id: 'u1', role } : null
}

describe('ShowInactiveButton', () => {
    // The whole reason this component exists. He asked on 13 September that a
    // normal user not have this button anywhere, so the rule is here and not in
    // whichever page happens to remember it.
    it('is not there at all for an employee', () => {
        asRole('employee')
        const { container } = render(<ShowInactiveButton showing={false} onToggle={() => {}} />)
        expect(container).toBeEmptyDOMElement()
    })

    it('is not there for somebody with no role yet', () => {
        asRole(null)
        const { container } = render(<ShowInactiveButton showing={false} onToggle={() => {}} />)
        expect(container).toBeEmptyDOMElement()
    })

    it.each(['store_manager', 'owner', 'super_admin'])('is there for a %s', role => {
        asRole(role)
        render(<ShowInactiveButton showing={false} onToggle={() => {}} />)
        expect(screen.getByRole('button', { name: 'Show Inactive' })).toBeInTheDocument()
    })

    it('says how to turn it off once it is on', () => {
        asRole('owner')
        render(<ShowInactiveButton showing onToggle={() => {}} />)
        expect(screen.getByRole('button', { name: 'Hide Inactive' })).toBeInTheDocument()
    })

    it('says whether it is on, for anybody not reading the colour', () => {
        asRole('owner')
        render(<ShowInactiveButton showing onToggle={() => {}} />)
        expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    })

    it('tells the page when it is pressed', async () => {
        asRole('owner')
        const onToggle = vi.fn()
        render(<ShowInactiveButton showing={false} onToggle={onToggle} />)
        await userEvent.click(screen.getByRole('button'))
        expect(onToggle).toHaveBeenCalledOnce()
    })
})
