import { describe, it, expect } from 'vitest'
import { fmtMoney, fmtQty, fmtPct, num, namesList, round2, round4 } from '@/lib/format'

describe('fmtMoney', () => {
  it('formats a value over 1000 with a thousands separator and 2 decimals', () => {
    expect(fmtMoney(2355.11)).toBe('€2,355.11')
  })

  it('always shows exactly two decimals for whole numbers', () => {
    expect(fmtMoney(8)).toBe('€8.00')
  })

  it('pads a single decimal place to two', () => {
    expect(fmtMoney(10.2)).toBe('€10.20')
  })

  it('rounds to two decimal places', () => {
    expect(fmtMoney(1.005)).toBe('€1.01')
  })

  it('handles large values with multiple separators', () => {
    expect(fmtMoney(1234567.5)).toBe('€1,234,567.50')
  })

  it('formats zero correctly', () => {
    expect(fmtMoney(0)).toBe('€0.00')
  })

  it('returns an em dash for null', () => {
    expect(fmtMoney(null)).toBe('—')
  })

  it('returns an em dash for undefined', () => {
    expect(fmtMoney(undefined)).toBe('—')
  })

  it('returns an em dash for NaN', () => {
    expect(fmtMoney(NaN)).toBe('—')
  })
})

describe('fmtQty', () => {
  it('strips trailing zeros from a rounded decimal', () => {
    expect(fmtQty(11.799999)).toBe('11.8')
  })

  it('adds a thousands separator to large quantities', () => {
    expect(fmtQty(1200)).toBe('1,200')
  })

  it('leaves a plain integer unchanged', () => {
    expect(fmtQty(100)).toBe('100')
  })

  it('rounds to a maximum of three decimals', () => {
    expect(fmtQty(2.34567)).toBe('2.346')
  })

  it('shows no decimals when the value is whole', () => {
    expect(fmtQty(15.0)).toBe('15')
  })

  it('formats zero as 0', () => {
    expect(fmtQty(0)).toBe('0')
  })

  it('keeps up to three meaningful decimals', () => {
    expect(fmtQty(0.125)).toBe('0.125')
  })
})

// His rule of 21 October 2026: money to two decimals everywhere, a unit
// price too. Only what is shown; the price is kept to four.
describe('a unit price, shown as money', () => {
    it('is two decimals like any other money', () => {
        expect(fmtMoney(0.3033)).toBe('€0.30')
        expect(fmtMoney(2.5944)).toBe('€2.59')
        expect(fmtMoney(11.1458)).toBe('€11.15')
    })
})

describe('fmtPct', () => {
    it('prints one decimal by default', () => {
        expect(fmtPct(28.44)).toBe('28.4%')
        expect(fmtPct(0)).toBe('0.0%')
    })

    it('takes a different precision when a screen wants one', () => {
        expect(fmtPct(28.444, 2)).toBe('28.44%')
    })

    it('says nothing rather than NaN%', () => {
        expect(fmtPct(null)).toBe('—')
        expect(fmtPct(undefined)).toBe('—')
        expect(fmtPct(NaN)).toBe('—')
    })
})

describe('num', () => {
    it('takes what the database gives back', () => {
        expect(num('12.50')).toBe(12.5)
        expect(num(12.5)).toBe(12.5)
    })

    // The whole reason it exists: one NaN in a reduce loses the week's total.
    it('turns everything unusable into zero, never NaN', () => {
        expect(num(null)).toBe(0)
        expect(num(undefined)).toBe(0)
        expect(num('')).toBe(0)
        expect(num('not a number')).toBe(0)
    })
})

describe('namesList', () => {
    it('says names the way a sentence does', () => {
        expect(namesList(['Lime'])).toBe('Lime')
        expect(namesList(['Lime', 'Salt'])).toBe('Lime and Salt')
        expect(namesList(['Lime', 'Salt', 'Cream'])).toBe('Lime, Salt and Cream')
    })

    it('says nothing for nothing', () => {
        expect(namesList([])).toBe('')
        expect(namesList(undefined)).toBe('')
    })
})

describe('round2', () => {
  it('rounds to the cent', () => {
    expect(round2(2.345)).toBe(2.35)
    expect(round2(12.344)).toBe(12.34)
    expect(round2(7)).toBe(7)
  })

  it('takes what the database sends, which is often a string', () => {
    expect(round2('2.345')).toBe(2.35)
    expect(round2('19.999')).toBe(20)
  })

  it('turns nothing into zero', () => {
    expect(round2(null)).toBe(0)
    expect(round2(undefined)).toBe(0)
    expect(round2('')).toBe(0)
  })

  it('rounds a negative the same way', () => {
    expect(round2(-2.345)).toBe(-2.35)
    expect(round2(-12.344)).toBe(-12.34)
  })
})

describe('round4', () => {
  it('rounds to four places', () => {
    expect(round4(0.30335)).toBe(0.3034)
    expect(round4('2.34565')).toBe(2.3457)
    expect(round4(-6.48751)).toBe(-6.4875)
  })

  it('turns nothing into zero', () => {
    expect(round4(null)).toBe(0)
  })
})
