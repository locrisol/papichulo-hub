import { describe, it, expect } from 'vitest'
import { cleanNumberInput, numberField } from './numberInput'

describe('cleanNumberInput', () => {
    it('keeps a plain figure', () => {
        expect(cleanNumberInput('109.04')).toBe('109.04')
    })

    it('drops letters and symbols as they are typed', () => {
        expect(cleanNumberInput('1a2b3')).toBe('123')
        expect(cleanNumberInput('€109.04')).toBe('109.04')
        expect(cleanNumberInput('12,50')).toBe('1250')
    })

    it('allows one decimal point and no more', () => {
        expect(cleanNumberInput('12.3.4')).toBe('12.34')
        expect(cleanNumberInput('1.2.3.4')).toBe('1.234')
    })

    it('lets a number be typed one character at a time', () => {
        // The half typed states have to survive or the box fights you.
        expect(cleanNumberInput('1')).toBe('1')
        expect(cleanNumberInput('1.')).toBe('1.')
        expect(cleanNumberInput('1.0')).toBe('1.0')
        expect(cleanNumberInput('.')).toBe('.')
        expect(cleanNumberInput('.5')).toBe('.5')
    })

    // Empty and zero are different things and have to stay different: nothing
    // entered is not the same as the till taking nothing.
    it('keeps empty as empty and zero as zero', () => {
        expect(cleanNumberInput('')).toBe('')
        expect(cleanNumberInput(null)).toBe('')
        expect(cleanNumberInput('0')).toBe('0')
    })

    it('drops the decimal point entirely for a whole number', () => {
        expect(cleanNumberInput('12.5', { whole: true })).toBe('125')
        expect(cleanNumberInput('3', { whole: true })).toBe('3')
    })

    it('refuses a minus sign, since none of these can be negative', () => {
        expect(cleanNumberInput('-5')).toBe('5')
    })
})

describe('numberField', () => {
    it('is a text box, so it has no arrows and ignores the scroll wheel', () => {
        const props = numberField({ value: '1', onChange: () => {} })
        expect(props.type).toBe('text')
    })

    it('still opens the number keypad on a phone', () => {
        expect(numberField({ value: '', onChange: () => {} }).inputMode).toBe('decimal')
        expect(numberField({ value: '', onChange: () => {}, whole: true }).inputMode).toBe('numeric')
    })

    it('hands the caller the cleaned value rather than the event', () => {
        let got = null
        const props = numberField({ value: '', onChange: v => { got = v } })
        props.onChange({ target: { value: '1a2.3.4' } })
        expect(got).toBe('12.34')
    })

    it('never hands an input a value of undefined', () => {
        // React switches an input from controlled to uncontrolled if it does,
        // and warns about it in the console.
        expect(numberField({ value: undefined, onChange: () => {} }).value).toBe('')
    })
})

describe('capping the decimal places', () => {
    it('lets a money box take two and no more', () => {
        expect(cleanNumberInput('8.450', { decimals: 2 })).toBe('8.45')
        expect(cleanNumberInput('2.47', { decimals: 2 })).toBe('2.47')
    })

    it('does not get in the way while the number is still being typed', () => {
        expect(cleanNumberInput('8', { decimals: 2 })).toBe('8')
        expect(cleanNumberInput('8.', { decimals: 2 })).toBe('8.')
        expect(cleanNumberInput('8.4', { decimals: 2 })).toBe('8.4')
    })

    it('caps a rating at one place', () => {
        expect(cleanNumberInput('4.65', { decimals: 1 })).toBe('4.6')
    })

    it('leaves a box with no cap alone, for a price held to four places', () => {
        expect(cleanNumberInput('1.2345')).toBe('1.2345')
    })
})

describe('numberField', () => {
    it('selects what is in the box when it is focused', () => {
        const field = numberField({ value: '0', onChange: () => {} })
        let selected = false
        field.onFocus({ target: { select: () => { selected = true } } })
        expect(selected).toBe(true)
    })

    // The bug this exists for: a box reading 0, clicked into, typed 25, and
    // saved as 250.
    it('passes the cap through to the cleaning', () => {
        let got = null
        const field = numberField({ value: '', onChange: v => { got = v }, decimals: 2 })
        field.onChange({ target: { value: '8.450' } })
        expect(got).toBe('8.45')
    })
})
