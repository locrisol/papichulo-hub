import { describe, it, expect } from 'vitest'
import { fmtMoney, fmtQty } from './format'

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
