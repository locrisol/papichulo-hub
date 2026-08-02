// Why something was thrown out.
//
// The value goes to the database and the label goes on screen. waste_logs has a
// check constraint on reason, so the values have to match these exactly.
export const REASONS = [
    { value: 'overproduction', label: 'Overproduction' },
    { value: 'spoilage', label: 'Spoilage' },
    { value: 'dropped', label: 'Dropped' },
    { value: 'expired', label: 'Expired' },
    { value: 'other', label: 'Other' },
]

export function reasonLabel(value) {
    return REASONS.find(r => r.value === value)?.label || value
}