import { employeeStatus } from './team'

// What is missing from somebody's record.
//
// A team list fills up a person at a time, in a hurry, usually on the day
// somebody starts. Things get left. Most of them go unnoticed until the thing
// that needed them is the thing that cannot be answered: the roster cannot
// check the under 18 rules without a date of birth, labour cost cannot count
// somebody with no rate, and an inspector asking about food safety is not the
// moment to find out nobody wrote it down.
//
// Two rules kept throughout, because a list that cries wolf is a list nobody
// opens twice:
//
//   Nothing is reported that is genuinely optional. Almost nobody here has a
//   Hub account and that is by design, so a missing one is not a gap.
//
//   Nothing is reported that does not apply. A citizen has no permission expiry
//   to record, so asking for one would put an amber line against half the team
//   for no reason at all.

// The permissions that come with an expiry date. A citizen, an EU national or
// somebody on Stamp 4 has none, so there is nothing to chase.
const EXPIRING_PERMISSIONS = ['stamp1', 'stamp1g', 'stamp2', 'stamp2a']

export function gapsFor(employee, today) {
    if (!employee) return []

    // Somebody who has left is history rather than a job to do. Their record
    // stays as it is, holes and all, because that is what it was.
    if (employeeStatus(employee, today)?.state === 'left') return []

    const gaps = []
    const add = (field, text) => gaps.push({ field, text })

    if (!employee.started_on) add('started_on', 'No first day')
    if (!employee.position_id) add('position_id', 'No position')
    if (employee.hourly_rate === null || employee.hourly_rate === undefined) {
        add('hourly_rate', 'No hourly rate')
    }

    // Without this the roster cannot apply the under 18 rules, and it fails
    // quietly: it does not know they are under 18, so it says nothing.
    if (!employee.date_of_birth) add('date_of_birth', 'No date of birth')

    if (!employee.work_permission) {
        add('work_permission', 'Permission to work not recorded')
    } else if (EXPIRING_PERMISSIONS.includes(employee.work_permission)
        && !employee.work_permission_expires) {
        add('work_permission_expires', 'Permission has no expiry date')
    }

    if (!employee.food_safety_level) {
        add('food_safety_level', 'No food safety training recorded')
    } else if (!employee.food_safety_expires) {
        add('food_safety_expires', 'Food safety has no expiry date')
    }

    return gaps
}

// Everybody with something missing, worst first.
//
// Sorted by how much is missing rather than by name, because this is a list to
// work down and the person with five holes in their record is the one to open
// first.
export function teamGaps(employees, today) {
    return (employees || [])
        .map(employee => ({ employee, gaps: gapsFor(employee, today) }))
        .filter(row => row.gaps.length > 0)
        .sort((a, b) =>
            (b.gaps.length - a.gaps.length)
            || a.employee.full_name.localeCompare(b.employee.full_name))
}

export function countGaps(rows) {
    return (rows || []).reduce((total, row) => total + row.gaps.length, 0)
}
