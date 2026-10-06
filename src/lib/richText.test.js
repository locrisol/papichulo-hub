// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseRich, serializeRich, richPlain, richEditorHtml, richFromDom } from '@/lib/richText'

const box = html => {
    const el = document.createElement('div')
    el.innerHTML = html
    return el
}

describe('formatted comments', () => {
    it('reads the marks it knows and keeps the words', () => {
        const stored = 'Fan <b>still noisy</b>, <span data-c="red">engineer Thursday</span><br>2 &lt; 3'
        expect(richPlain(stored)).toBe('Fan still noisy, engineer Thursday\n2 < 3')
        expect(serializeRich(parseRich(stored))).toBe(stored)
    })

    it('reads anything else as words, never as a mark', () => {
        expect(richPlain('<a href="x">link</a>')).toBe('<a href="x">link</a>')
        expect(serializeRich(parseRich('<script>x</script>'))).toBe('&lt;script&gt;x&lt;/script&gt;')
        expect(richPlain('<span data-c="purple">x</span>')).toBe('<span data-c="purple">x</span>')
    })

    it('shows the marks in the editing box as they will look', () => {
        expect(richEditorHtml('<span data-c="green">ok</span>'))
            .toBe('<span data-c="green" style="color:#1F7A4C">ok</span>')
    })

    // Each browser writes bold, colour and size its own way.
    it('reads back what a browser wrote, whichever way it wrote it', () => {
        expect(richFromDom(box('<strong>a</strong><span style="font-weight: bold">b</span>'))).toBe('<b>a</b><b>b</b>')
        expect(richFromDom(box('<font color="#b91c1c">red</font>'))).toBe('<span data-c="red">red</span>')
        expect(richFromDom(box('<span style="color: rgb(31, 122, 76)">green</span>'))).toBe('<span data-c="green">green</span>')
        expect(richFromDom(box('<font size="5">big</font><font size="3">same</font>'))).toBe('<span data-s="big">big</span>same')
        expect(richFromDom(box('one<div>two</div><div><br></div>'))).toBe('one<br>two')
        expect(richFromDom(box('one<div><br></div><div>three</div>'))).toBe('one<br><br>three')
    })

    it('drops what is not one of its marks and keeps the words', () => {
        expect(richFromDom(box('<a href="https://x">site</a> <img src="x"> <i>it</i> <font color="#123456">c</font>')))
            .toBe('site  it c')
    })
})

describe('a space the editing box puts in', () => {
    it('is saved as an ordinary space', () => {
        expect(richFromDom(box('a&nbsp;b'))).toBe('a b')
    })
})
