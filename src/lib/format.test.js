import { describe, it, expect } from 'vitest'
import { fmtMoney, fmtQty, fmtUnitCost, fmtPct, num } from '@/lib/format'

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

describe('fmtUnitCost', () => {
    it('keeps four decimals, because two would cost real money', () => {
        // A tortilla at 0.3033 rounded to 0.30 is eleven cent light on a dish
        // using thirty of them.
        expect(fmtUnitCost(0.3033)).toBe('€0.3033')
        expect(fmtUnitCost(6.4875)).toBe('€6.4875')
    })

    it('separates thousands, which a hand written toFixed does not', () => {
        expect(fmtUnitCost(1234.5)).toBe('€1,234.5000')
    })

    it('gives a dash for nothing rather than €NaN', () => {
        expect(fmtUnitCost(null)).toBe('—')
        expect(fmtUnitCost(undefined)).toBe('—')
    })

    it('puts the minus before the euro sign, like fmtMoney', () => {
        expect(fmtUnitCost(-2.5)).toBe('-€2.5000')
    })

    it('does not sign a zero that only rounds to nothing', () => {
        expect(fmtUnitCost(-0.000001)).toBe('€0.0000')
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
