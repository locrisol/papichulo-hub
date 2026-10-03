import { describe, it, expect } from 'vitest'
import { callerProblem, emailProblem, inviteProblem, linkSite, cleanEmail } from '../../supabase/functions/invite-user/invite'

// The function runs with the service key, which skips every row level rule,
// so these are the only checks there are.

const good = { fullName: 'Maria Silva', email: ' Maria@PapiChulo.ie ', role: 'employee', restaurantId: 'pc' }

describe('who may give an account', () => {
    it('is an active super admin, and nobody else', () => {
        expect(callerProblem({ role: 'super_admin', is_active: true })).toBe('')
        expect(callerProblem({ role: 'owner', is_active: true })).toBe('Only a super admin can add an account')
        expect(callerProblem({ role: 'store_manager', is_active: true })).toBe('Only a super admin can add an account')
        expect(callerProblem({ role: 'super_admin', is_active: false })).toBe('Your account is deactivated')
        expect(callerProblem(null)).toBe('Not signed in')
    })
})

describe('what a request needs', () => {
    it('takes a name, an email, a role and a restaurant', () => {
        expect(inviteProblem(good)).toBe('')
        expect(cleanEmail(good.email)).toBe('maria@papichulo.ie')
    })

    it('says what is missing', () => {
        expect(inviteProblem({ ...good, fullName: ' ' })).toBe('Enter their name.')
        expect(inviteProblem({ ...good, email: 'maria' })).toBe('Enter a full email address.')
        expect(inviteProblem({ ...good, role: 'boss' })).toBe('Pick a role.')
        expect(inviteProblem({ ...good, restaurantId: null })).toBe('Pick a restaurant.')
    })

    // A super admin looks after both restaurants.
    it('lets a super admin have no restaurant', () => {
        expect(inviteProblem({ ...good, role: 'super_admin', restaurantId: null })).toBe('')
    })

    it('refuses an address nobody can receive mail at', () => {
        expect(emailProblem('dev@hub.test')).toMatch(/can never receive email/)
        expect(emailProblem('x@example.com')).toMatch(/can never receive email/)
    })

    it('links to somebody on the team only when that is safe', () => {
        const withPerson = { ...good, employeeId: 'e1' }
        expect(inviteProblem(withPerson, { id: 'e1', restaurant_id: 'pc', user_id: null })).toBe('')
        expect(inviteProblem(withPerson, null)).toBe('That person is not on the team list.')
        expect(inviteProblem(withPerson, { id: 'e1', restaurant_id: 'pc', user_id: 'u9' })).toBe('That person already has an account.')
        expect(inviteProblem(withPerson, { id: 'e1', restaurant_id: 'dl', user_id: null })).toBe('That person works at another restaurant.')
    })
})

describe('where the emailed link opens', () => {
    it('is the site the invite was sent from', () => {
        expect(linkSite('https://papichulo-hub.vercel.app/')).toBe('https://papichulo-hub.vercel.app')
        expect(linkSite('http://localhost:5173')).toBe('http://localhost:5173')
    })

    it('is nothing when that does not look like a site', () => {
        expect(linkSite('javascript:alert(1)')).toBe('')
        expect(linkSite('')).toBe('')
    })
})
