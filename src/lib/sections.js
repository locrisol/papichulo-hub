// Where stock is kept, and what colour that is.
//
// The order is the order the store is walked, which is why it is a list rather
// than alphabetical: a count that sends somebody from the freezer to the
// cleaning cupboard and back to the fridge is a count that takes twice as long.
//
// The colours were written out three times, once on each stock take screen, and
// have to be the same on all of them or the same shelf is blue in one place and
// green in another. They are here now, along with the dropdowns that show
// products outside the stock take, so a product reads the same wherever it
// appears.
//
// MIX is not a section. It is in here because in a list of products it is the
// other thing worth telling apart at a glance, and it has been amber everywhere
// in the app since the catalogue was built.

export const SECTION_ORDER = ['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']

// classes for anything drawn in the app; ink is the same colour as a value, for
// the places that cannot take a class, like the text of an option in a native
// dropdown.
export const SECTION_COLOURS = {
    'Freezer': {
        text: 'text-blue-700', bar: 'bg-blue-500', bg: 'bg-blue-50',
        border: 'border-blue-200', solid: 'bg-blue-600', ring: 'ring-blue-600',
        ink: '#1d4ed8',
    },
    'Cold Room': {
        text: 'text-green-700', bar: 'bg-green-500', bg: 'bg-green-50',
        border: 'border-green-200', solid: 'bg-green-600', ring: 'ring-green-600',
        ink: '#15803d',
    },
    'Dry': {
        text: 'text-amber-700', bar: 'bg-amber-500', bg: 'bg-amber-50',
        border: 'border-amber-200', solid: 'bg-amber-600', ring: 'ring-amber-600',
        // A clear orange rather than a burnt one. The darker amber it had was
        // close enough to Packaging's red that the two lines were hard to tell
        // apart down the side of a list.
        ink: '#d97706',
    },
    'Packaging': {
        text: 'text-red-700', bar: 'bg-red-500', bg: 'bg-red-50',
        border: 'border-red-200', solid: 'bg-red-600', ring: 'ring-red-600',
        ink: '#b91c1c',
    },
    'Cleaning': {
        text: 'text-purple-700', bar: 'bg-purple-500', bg: 'bg-purple-50',
        border: 'border-purple-200', solid: 'bg-purple-600', ring: 'ring-purple-600',
        ink: '#7e22ce',
    },
    'Other': {
        text: 'text-gray-700', bar: 'bg-gray-400', bg: 'bg-gray-50',
        border: 'border-gray-200', solid: 'bg-gray-600', ring: 'ring-gray-600',
        ink: '#374151',
    },
}

// Something we make ourselves, which is not kept anywhere in particular.
//
// Two ambers, because they do two jobs. ink is lettering, so it is dark enough
// to read as words on white. badge is the amber the catalogue has always filled
// its MIX pill with, bright with white lettering on it, and it is what anything
// drawing that pill should use.
export const MIX_COLOUR = { ink: '#a16207', badge: '#f59e0b', label: 'House-made (MIX)' }

// A drink, which is kept somewhere but is read as its own thing.
export const DRINK_COLOUR = { ink: '#0369a1', label: 'Drink' }

// The colour of the line down the side of a product's row.
//
// It says one thing and one thing only: where the product is kept. A
// house-made salsa lives in the cold room, so its line is green, even though
// the row itself is amber and the badge says MIX.
//
// That split is the point. The row colour and the badges already say what a
// thing is, so a line saying it again would be the third time, and the one
// question nothing was answering was where to walk to find it. A colour that
// means two things at once means neither.
export function productInk(product) {
    if (!product) return SECTION_COLOURS['Other'].ink
    return sectionColour(product.section).ink
}

export function sectionColour(section) {
    return SECTION_COLOURS[section] || SECTION_COLOURS['Other']
}

export function sectionRank(section) {
    const i = SECTION_ORDER.indexOf(section)
    return i === -1 ? SECTION_ORDER.length : i
}

// Products arranged for a dropdown: the house-made ones first, then each
// section in the order the store is walked.
//
// House-made first because on a recipe or a menu item they are what somebody is
// usually reaching for, and there are few of them against a few hundred of
// everything else.
export function forDropdown(products) {
    const mixes = (products || []).filter(p => p.is_mix)
    const rest = (products || []).filter(p => !p.is_mix)

    const grouped = {}
    for (const product of rest) {
        const section = product.section || 'Other'
        if (!grouped[section]) grouped[section] = []
        grouped[section].push(product)
    }

    const byName = (a, b) => a.name.localeCompare(b.name)

    const groups = Object.entries(grouped)
        .map(([section, items]) => ({
            label: section,
            ink: sectionColour(section).ink,
            items: items.slice().sort(byName),
        }))
        .sort((a, b) => sectionRank(a.label) - sectionRank(b.label))

    if (mixes.length > 0) {
        groups.unshift({
            label: MIX_COLOUR.label,
            ink: MIX_COLOUR.ink,
            items: mixes.slice().sort(byName),
        })
    }

    return groups
}
