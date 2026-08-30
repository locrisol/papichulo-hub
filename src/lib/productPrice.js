// What a supplier charges for a product, as arithmetic rather than as a screen.
//
// It lives here because two screens now ask the same questions. The prices page
// has always done it, and the product form does it too, so that adding a
// product and telling it who you buy it from is one job rather than three.
//
// A supplier sells the same thing in more than one way, so a price is either
// for a full case or for a loose unit:
//
//   case   the price of the case and how many units are in it, and the price
//          per unit is worked out from the two
//   loose  the price per unit typed straight in
//
// The price per unit is the number everything downstream reads, so it is worked
// out here on the way in and never typed on a case price. A units per case that
// was entered wrong quietly moves the cost of every dish the product goes into,
// which is why the form shows the division as you type.

export const EMPTY_PRICE = {
    supplier_id: '',
    purchase_type: 'case',
    supplier_code: '',
    price_per_case: '',
    units_per_case: '',
    price_per_unit: '',
}

// Has anybody actually filled this in?
//
// Only used where the price is optional. On the product form the whole block
// can be left alone, and leaving it alone must not be an error.
export function hasPrice(form) {
    return !!form?.supplier_id
}

export function priceProblem(form) {
    const errors = {}

    if (!form.supplier_id) {
        errors.supplier_id = 'Supplier is required'
    }

    if (form.purchase_type === 'case') {
        const perCase = parseFloat(form.price_per_case)
        const perPack = parseFloat(form.units_per_case)
        if (isNaN(perCase) || perCase <= 0) {
            errors.price_per_case = 'Price per case must be greater than 0'
        }
        if (isNaN(perPack) || perPack <= 0) {
            errors.units_per_case = 'Units per case must be greater than 0'
        }
    } else {
        const perUnit = parseFloat(form.price_per_unit)
        if (isNaN(perUnit) || perUnit <= 0) {
            errors.price_per_unit = 'Price must be greater than 0'
        }
    }

    return errors
}

// The row as the database wants it, minus what only the caller knows: which
// product it is against and which restaurant is buying.
export function pricePayload(form) {
    const payload = {
        supplier_id: form.supplier_id,
        purchase_type: form.purchase_type,
        supplier_code: form.supplier_code || null,
    }

    if (form.purchase_type === 'case') {
        const perCase = parseFloat(form.price_per_case)
        const perPack = parseFloat(form.units_per_case)
        payload.price_per_case = perCase
        payload.units_per_case = perPack
        payload.price_per_unit = perCase / perPack
    } else {
        payload.price_per_case = null
        payload.units_per_case = null
        payload.price_per_unit = parseFloat(form.price_per_unit)
    }

    return payload
}

// What the division comes to, for showing under the two boxes as they are
// typed. Nothing when there is not enough to divide.
export function perUnitPreview(form) {
    if (form?.purchase_type !== 'case') return null
    const perCase = parseFloat(form.price_per_case)
    const perPack = parseFloat(form.units_per_case)
    if (isNaN(perCase) || isNaN(perPack) || perPack <= 0) return null
    return perCase / perPack
}
