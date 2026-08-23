import { describe, it, expect } from 'vitest'
import {
    isWorkingOn,
    employeeStatus,
    sortEmployees,
    nextSortOrder,
    moveEmployee,
    linkableUsers,
    employeeProblem,
    nextColour,
    POSITION_COLOURS,
} from './team'

const emp = (id, full_name, sort_order = 0, extra = {}) => ({ id, full_name, sort_order, ...extra })

describe('isWorkingOn', () => {
    it('is working between the two dates', () => {
        const e = emp('1', 'Ana', 0, { started_on: '2026-01-01', ended_on: '2026-12-31' })
        expect(isWorkingOn(e, '2026-06-01')).toBe(true)
    })

    it('is not working before they start or after they finish', () => {
        const e = emp('1', 'Ana', 0, { started_on: '2026-03-01', ended_on: '2026-06-30' })
        expect(isWorkingOn(e, '2026-02-28')).toBe(false)
        expect(isWorkingOn(e, '2026-07-01')).toBe(false)
    })

    it('counts the first and last day as worked', () => {
        const e = emp('1', 'Ana', 0, { started_on: '2026-03-01', ended_on: '2026-06-30' })
        expect(isWorkingOn(e, '2026-03-01')).toBe(true)
        expect(isWorkingOn(e, '2026-06-30')).toBe(true)
    })

    it('treats no start date as always having been here', () => {
        // The people already on the books when the list is first typed in.
        expect(isWorkingOn(emp('1', 'Ana'), '2020-01-01')).toBe(true)
    })

    it('treats no end date as still here', () => {
        const e = emp('1', 'Ana', 0, { started_on: '2026-01-01' })
        expect(isWorkingOn(e, '2099-01-01')).toBe(true)
    })
})

describe('employeeStatus', () => {
    const today = '2026-08-23'

    it('says working when there is nothing else to say', () => {
        expect(employeeStatus(emp('1', 'Ana'), today).state).toBe('working')
    })

    it('says starting for somebody who has not begun', () => {
        const s = employeeStatus(emp('1', 'Ana', 0, { started_on: '2026-09-01' }), today)
        expect(s.state).toBe('starting')
        expect(s.date).toBe('2026-09-01')
    })

    it('says left once the last day has passed', () => {
        const s = employeeStatus(emp('1', 'Ana', 0, { ended_on: '2026-08-22' }), today)
        expect(s.state).toBe('left')
    })

    it('still counts the last day itself as here, not gone', () => {
        const s = employeeStatus(emp('1', 'Ana', 0, { ended_on: today }), today)
        expect(s.state).toBe('leaving')
    })

    it('has a state of its own for somebody working out their notice', () => {
        // They still have to be rostered, and somebody has to be thinking about
        // replacing them. Neither working nor left says that.
        const s = employeeStatus(emp('1', 'Ana', 0, { ended_on: '2026-09-05' }), today)
        expect(s.state).toBe('leaving')
        expect(s.date).toBe('2026-09-05')
    })

    it('calls somebody who never started and already left, left', () => {
        const s = employeeStatus(
            emp('1', 'Ana', 0, { started_on: '2026-09-01', ended_on: '2026-08-01' }), today,
        )
        expect(s.state).toBe('left')
    })
})

describe('sortEmployees', () => {
    it('goes by the order the manager set', () => {
        const out = sortEmployees([emp('1', 'Ana', 2), emp('2', 'Bea', 0), emp('3', 'Cal', 1)])
        expect(out.map(e => e.full_name)).toEqual(['Bea', 'Cal', 'Ana'])
    })

    it('falls back to the name when nothing has been arranged', () => {
        const out = sortEmployees([emp('1', 'Cal'), emp('2', 'Ana'), emp('3', 'Bea')])
        expect(out.map(e => e.full_name)).toEqual(['Ana', 'Bea', 'Cal'])
    })

    it('leaves the list it was given alone', () => {
        const list = [emp('1', 'Cal', 2), emp('2', 'Ana', 0)]
        sortEmployees(list)
        expect(list.map(e => e.full_name)).toEqual(['Cal', 'Ana'])
    })

    it('copes with nothing at all', () => {
        expect(sortEmployees([])).toEqual([])
        expect(sortEmployees(null)).toEqual([])
    })
})

describe('nextSortOrder', () => {
    it('puts a new person at the end', () => {
        expect(nextSortOrder([emp('1', 'Ana', 0), emp('2', 'Bea', 4)])).toBe(5)
    })

    it('starts at nought on an empty list', () => {
        expect(nextSortOrder([])).toBe(0)
        expect(nextSortOrder(null)).toBe(0)
    })
})

describe('moveEmployee', () => {
    const list = [emp('a', 'Ana', 0), emp('b', 'Bea', 1), emp('c', 'Cal', 2)]

    it('swaps a person with the one above', () => {
        const changes = moveEmployee(list, 'c', 'up')
        expect(changes).toHaveLength(2)
        const byId = Object.fromEntries(changes.map(c => [c.id, c.sort_order]))
        expect(byId.c).toBe(1)
        expect(byId.b).toBe(2)
    })

    it('swaps a person with the one below', () => {
        const changes = moveEmployee(list, 'a', 'down')
        const byId = Object.fromEntries(changes.map(c => [c.id, c.sort_order]))
        expect(byId.a).toBe(1)
        expect(byId.b).toBe(0)
    })

    it('does nothing at the top or the bottom', () => {
        expect(moveEmployee(list, 'a', 'up')).toEqual([])
        expect(moveEmployee(list, 'c', 'down')).toEqual([])
    })

    it('does nothing for somebody who is not in the list', () => {
        expect(moveEmployee(list, 'nobody', 'up')).toEqual([])
    })

    it('only ever writes the two that moved', () => {
        const long = Array.from({ length: 12 }, (_, i) => emp(String(i), `P${i}`, i))
        expect(moveEmployee(long, '7', 'up')).toHaveLength(2)
    })

    it('still moves a list that has never been arranged', () => {
        // Everybody on nought, so the order comes from the names alone. Ana,
        // Bea, Cal, and moving Cal up has to put it above Bea.
        const flat = [emp('a', 'Ana'), emp('b', 'Bea'), emp('c', 'Cal')]
        const changes = moveEmployee(flat, 'c', 'up')
        const byId = Object.fromEntries(changes.map(c => [c.id, c.sort_order]))
        expect(byId.c).toBeLessThan(byId.b)
    })

    it('lands where you would expect after applying what it returned', () => {
        const changes = moveEmployee(list, 'c', 'up')
        const applied = list.map(e => {
            const change = changes.find(c => c.id === e.id)
            return change ? { ...e, sort_order: change.sort_order } : e
        })
        expect(sortEmployees(applied).map(e => e.full_name)).toEqual(['Ana', 'Cal', 'Bea'])
    })
})

describe('linkableUsers', () => {
    const users = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]

    it('leaves out an account already attached to somebody else', () => {
        const employees = [emp('e1', 'Ana', 0, { user_id: 'u2' })]
        expect(linkableUsers(users, employees).map(u => u.id)).toEqual(['u1', 'u3'])
    })

    it('keeps the account belonging to the person being edited', () => {
        const employees = [emp('e1', 'Ana', 0, { user_id: 'u2' })]
        expect(linkableUsers(users, employees, 'e1').map(u => u.id)).toEqual(['u1', 'u2', 'u3'])
    })

    it('ignores people with no account at all', () => {
        const employees = [emp('e1', 'Ana'), emp('e2', 'Bea', 0, { user_id: null })]
        expect(linkableUsers(users, employees)).toHaveLength(3)
    })
})

describe('employeeProblem', () => {
    it('wants a name', () => {
        expect(employeeProblem({ fullName: '   ' })).toMatch(/name/i)
    })

    it('will not let the last day come before the first', () => {
        expect(employeeProblem({
            fullName: 'Ana', startedOn: '2026-06-01', endedOn: '2026-05-01',
        })).toMatch(/before/i)
    })

    it('allows leaving on the day you started', () => {
        expect(employeeProblem({
            fullName: 'Ana', startedOn: '2026-06-01', endedOn: '2026-06-01',
        })).toBe(null)
    })

    it('is happy with a name and nothing else', () => {
        expect(employeeProblem({ fullName: 'Ana' })).toBe(null)
    })
})

describe('nextColour', () => {
    it('gives the first colour to the first position', () => {
        expect(nextColour([])).toBe(POSITION_COLOURS[0].value)
    })

    it('skips the ones already in use', () => {
        const used = POSITION_COLOURS.slice(0, 3).map(c => ({ colour: c.value }))
        expect(nextColour(used)).toBe(POSITION_COLOURS[3].value)
    })

    it('starts again once all eight are taken', () => {
        const used = POSITION_COLOURS.map(c => ({ colour: c.value }))
        expect(nextColour(used)).toBe(POSITION_COLOURS[0].value)
    })
})
