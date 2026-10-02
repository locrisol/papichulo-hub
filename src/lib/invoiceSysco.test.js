import { describe, it, expect } from 'vitest'
import {
    rowsOf, cellsOf, findHeading, columnsFrom, bucket, readPackSize, packItems,
    looksLikePackSize, paperDate, money, headField, footBlock, recognisesSysco,
    readSyscoInvoice, depositBox, shareOut, LINE_COLUMNS, mend,
} from '@/lib/invoiceSysco'

// **The two real documents, as the reader actually sees them.**
//
// The first version of this file was a document built to the shape of theirs,
// and the reader it tested refused the first real invoice it was given: the
// real page puts its column headings on three baselines, centres a wrapped
// description on its line so half of it comes before the code, keeps the goods
// total at the foot, and prints a VAT code close enough to each value to be
// read as part of it. None of that was in the made up one.
//
// So these rows are the real coordinates, read out of the real PDFs by the same
// engine the app uses: y down the page, x across it, the width, and the text.
//
// **Nothing that identifies the business is in here.** No address, no VAT
// number, and the account number is invented. Product codes, descriptions,
// prices and totals are kept, because the arithmetic is what is being pinned:
// the values add up to the goods total and the case counts add up to the header
// count, which are the two checks the import refuses without.

const INVOICE_ROWS = [
    [204.8, 40.5, 39.1, "ACCT No."],
    [204.8, 109.9, 14.7, "TSO"],
    [204.8, 151.1, 23.2, "LOAD"],
    [204.8, 190.9, 23.1, "DROP"],
    [204.8, 229.9, 21.3, "CASE"],
    [204.8, 264.8, 16.8, "UNIT"],
    [204.8, 298.9, 34.3, "ORD No."],
    [204.8, 356.6, 38.4, "INV. DATE"],
    [204.8, 418.1, 32.1, "INV. No."],
    [204.8, 471.8, 17.6, "TYPE"],
    [204.8, 514.5, 38.6, "PAGE No."],
    [216.0, 46.9, 26.1, "9900001"],
    [216.0, 102.0, 30.5, "AXAdmin"],
    [216.0, 155.3, 14.9, "7952"],
    [216.0, 200.6, 3.7, "0"],
    [216.0, 238.5, 3.7, "6"],
    [216.0, 271.1, 3.7, "0"],
    [216.0, 309.4, 12.9, "N/A"],
    [216.0, 357.8, 35.8, "23/08/2026"],
    [216.0, 418.9, 29.9, "45448455"],
    [216.0, 468.8, 23.9, "Invoice"],
    [216.0, 525.0, 17.7, "1 of 1"],
    [238.5, 339.8, 47.8, "30 Days End of"],
    [247.5, 39.8, 44.9, "TOTAL WGT"],
    [247.5, 105.8, 16.8, "50.08"],
    [247.5, 157.1, 44.2, "CURRENCY"],
    [247.5, 222.8, 12.1, "EUR"],
    [247.5, 283.9, 24.6, "TERMS"],
    [247.5, 339.8, 21.1, "Month"],
    [270.0, 350.6, 28.0, "QUANTITY"],
    [270.0, 545.6, 12.6, "VAT"],
    [275.3, 34.9, 24.4, "CODE"],
    [275.3, 145.9, 51.7, "DESCRIPTION"],
    [275.3, 290.6, 39.1, "PACK SIZE"],
    [275.3, 409.9, 22.8, "PRICE"],
    [275.3, 460.9, 30.5, "WEIGHT"],
    [275.3, 504.8, 25.5, "VALUE"],
    [279.0, 541.9, 20.0, "CODE"],
    [279.8, 346.1, 15.5, "CASE"],
    [279.8, 369.8, 12.2, "UNIT"],
    [297.0, 36.0, 34.3, "AMBIENT"],
    [315.8, 74.3, 182.1, "SANTA MARIA FLOUR TORTILLA WRAP LONG LIFE 12 INCH"],
    [320.3, 36.0, 22.4, "497870"],
    [320.3, 285.0, 29.5, "10X10 EA"],
    [320.3, 351.0, 3.7, "2"],
    [320.3, 372.8, 3.7, "0"],
    [320.3, 433.5, 16.8, "30.30"],
    [320.3, 516.0, 16.8, "60.60"],
    [320.3, 546.0, 3.7, "1"],
    [324.8, 74.3, 29.5, "10X10 EA"],
    [345.0, 36.0, 32.3, "CHILLED"],
    [362.3, 36.0, 22.4, "485073"],
    [362.3, 74.3, 88.1, "CHORIZO CUBES 1X500 GM"],
    [362.3, 285.0, 33.0, "4X500 GM"],
    [362.3, 351.0, 3.7, "1"],
    [362.3, 372.8, 3.7, "0"],
    [362.3, 433.5, 16.8, "27.99"],
    [362.3, 516.0, 16.8, "27.99"],
    [362.3, 546.0, 3.7, "1"],
    [381.0, 36.0, 30.6, "FROZEN"],
    [404.3, 36.0, 22.4, "492715"],
    [404.3, 74.3, 199.5, "MCCAIN SURECRISP SKIN ON 9X9MM THIN CUT FRIES 4X2.27KG"],
    [404.3, 285.0, 32.6, "4X2.27 KG"],
    [404.3, 351.0, 3.7, "2"],
    [404.3, 372.8, 3.7, "0"],
    [404.3, 433.5, 16.8, "18.42"],
    [404.3, 516.0, 16.8, "36.84"],
    [404.3, 546.0, 3.7, "1"],
    [422.3, 36.0, 25.0, "VG958Z"],
    [422.3, 74.3, 149.7, "SYSCO CLASSIC SWEET POTATO FRIES 4X2.5 KG"],
    [422.3, 285.0, 28.9, "4X2.5 KG"],
    [422.3, 351.0, 3.7, "1"],
    [422.3, 372.8, 3.7, "0"],
    [422.3, 433.5, 16.8, "37.60"],
    [422.3, 516.0, 16.8, "37.60"],
    [422.3, 546.0, 3.7, "1"],
    [606.0, 113.3, 86.5, "30 Days End of Month"],
    [640.5, 29.3, 34.4, "VAT CODE"],
    [641.3, 86.3, 36.7, "VAT RATE"],
    [641.3, 170.6, 67.7, "TAXABLE GOODS"],
    [641.3, 279.0, 15.4, "VAT"],
    [641.3, 333.4, 58.1, "GOODS TOTAL"],
    [641.3, 418.5, 15.4, "VAT"],
    [641.3, 465.8, 73.0, "AMOUNT PAYABLE"],
    [652.5, 385.5, 20.5, "163.03"],
    [652.5, 426.8, 13.1, "0.00"],
    [652.5, 537.8, 20.5, "163.03"],
    [653.3, 59.3, 4.5, "1"],
    [653.3, 122.3, 16.0, "0.00"],
    [653.3, 237.8, 25.1, "163.03"],
    [653.3, 287.3, 16.0, "0.00"],
    [666.0, 317.3, 232.6, "ALL GOODS SUPPLIED AND ACCEPTED SUBJECT TO OUR CURRENT TERMS"],
    [675.0, 317.3, 181.6, "AND CONDITIONS OF TRADING AVAILABLE ON REQUEST."],
]

const CREDIT_ROWS = [
    [204.8, 42.4, 39.1, "ACCT No."],
    [204.8, 102.0, 14.7, "TSO"],
    [204.8, 132.4, 23.2, "LOAD"],
    [204.8, 173.6, 23.1, "DROP"],
    [204.8, 214.1, 21.3, "CASE"],
    [204.8, 250.5, 16.8, "UNIT"],
    [204.8, 286.9, 34.3, "ORD No."],
    [204.8, 347.6, 38.4, "INV. DATE"],
    [204.8, 415.1, 32.1, "INV. No."],
    [204.8, 471.0, 17.6, "TYPE"],
    [204.8, 513.0, 38.6, "PAGE No."],
    [216.0, 48.8, 26.1, "9900001"],
    [216.0, 136.9, 14.5, "S138"],
    [216.0, 183.4, 3.7, "0"],
    [216.0, 221.6, 6.0, "-2"],
    [216.0, 256.9, 3.7, "0"],
    [216.0, 288.8, 29.9, "45480809"],
    [216.0, 348.8, 35.8, "27/08/2026"],
    [216.0, 413.3, 35.4, "C45485340"],
    [216.0, 469.9, 20.1, "Credit"],
    [216.0, 523.5, 17.7, "1 of 1"],
    [238.5, 339.8, 47.8, "30 Days End of"],
    [247.5, 39.8, 44.9, "TOTAL WGT"],
    [247.5, 105.8, 3.7, "2"],
    [247.5, 157.1, 44.2, "CURRENCY"],
    [247.5, 222.8, 12.1, "EUR"],
    [247.5, 283.9, 24.6, "TERMS"],
    [247.5, 339.8, 21.1, "Month"],
    [270.0, 350.6, 28.0, "QUANTITY"],
    [270.0, 545.6, 12.6, "VAT"],
    [275.3, 34.9, 24.4, "CODE"],
    [275.3, 145.9, 51.7, "DESCRIPTION"],
    [275.3, 290.6, 39.1, "PACK SIZE"],
    [275.3, 409.9, 22.8, "PRICE"],
    [275.3, 460.9, 30.5, "WEIGHT"],
    [275.3, 504.8, 25.5, "VALUE"],
    [279.0, 541.9, 20.0, "CODE"],
    [279.8, 346.1, 15.5, "CASE"],
    [279.8, 369.8, 12.2, "UNIT"],
    [297.0, 36.0, 34.3, "AMBIENT"],
    [314.3, 36.0, 22.4, "497365"],
    [314.3, 74.3, 63.2, "BAY LEAVES 1X1 KG"],
    [314.3, 285.0, 23.3, "1X1 KG"],
    [314.3, 351.0, 6.0, "-2"],
    [314.3, 372.8, 3.7, "0"],
    [314.3, 433.5, 16.8, "37.13"],
    [314.3, 513.8, 19.0, "-74.26"],
    [314.3, 546.0, 3.7, "1"],
    [606.0, 113.3, 86.5, "30 Days End of Month"],
    [640.5, 29.3, 34.4, "VAT CODE"],
    [641.3, 86.3, 36.7, "VAT RATE"],
    [641.3, 170.6, 67.7, "TAXABLE GOODS"],
    [641.3, 279.0, 15.4, "VAT"],
    [641.3, 333.4, 58.1, "GOODS TOTAL"],
    [641.3, 418.5, 15.4, "VAT"],
    [641.3, 465.8, 73.0, "AMOUNT PAYABLE"],
    [652.5, 387.0, 19.0, "-74.26"],
    [652.5, 426.8, 13.1, "0.00"],
    [652.5, 539.3, 19.0, "-74.26"],
    [653.3, 59.3, 4.5, "1"],
    [653.3, 122.3, 16.0, "0.00"],
    [653.3, 240.0, 23.3, "-74.26"],
    [653.3, 287.3, 16.0, "0.00"],
    [666.0, 317.3, 232.6, "ALL GOODS SUPPLIED AND ACCEPTED SUBJECT TO OUR CURRENT TERMS"],
    [675.0, 317.3, 181.6, "AND CONDITIONS OF TRADING AVAILABLE ON REQUEST."],
]

// **An invoice with drinks on it**, which is most of them. Drinks under the
// deposit return scheme put a box of totals over the foot of the line table,
// with the container deposit in it, and the goods total at the foot includes
// that deposit while no line does. On a full page the box is printed on top of
// the last four lines, and the FROZEN band above the last one shares a baseline
// with a row of the box. Same rules as the two above: real coordinates, an
// invented account number, no address and no VAT number.
const DRS_INVOICE_ROWS = [
    [204.8, 40.5, 39.1, "ACCT No."],
    [204.8, 109.9, 14.7, "TSO"],
    [204.8, 151.1, 23.2, "LOAD"],
    [204.8, 190.9, 23.1, "DROP"],
    [204.8, 229.9, 21.3, "CASE"],
    [204.8, 264.8, 16.8, "UNIT"],
    [204.8, 298.9, 34.3, "ORD No."],
    [204.8, 356.6, 38.4, "INV. DATE"],
    [204.8, 418.1, 32.1, "INV. No."],
    [204.8, 471.8, 17.6, "TYPE"],
    [204.8, 514.5, 38.6, "PAGE No."],
    [216.0, 46.9, 26.1, "9900001"],
    [216.0, 102.0, 30.5, "AXAdmin"],
    [216.0, 155.3, 14.9, "4970"],
    [216.0, 200.6, 3.7, "0"],
    [216.0, 236.6, 7.5, "17"],
    [216.0, 269.3, 7.5, "20"],
    [216.0, 309.4, 12.9, "N/A"],
    [216.0, 357.8, 35.8, "24/09/2026"],
    [216.0, 418.9, 29.9, "45690932"],
    [216.0, 468.8, 23.9, "Invoice"],
    [216.0, 525.0, 17.7, "1 of 1"],
    [238.5, 339.8, 47.8, "30 Days End of"],
    [247.5, 39.8, 44.9, "TOTAL WGT"],
    [247.5, 105.8, 16.8, "126.1"],
    [247.5, 157.1, 44.2, "CURRENCY"],
    [247.5, 222.8, 12.1, "EUR"],
    [247.5, 283.9, 24.6, "TERMS"],
    [247.5, 339.8, 21.1, "Month"],
    [270.0, 350.6, 28.0, "QUANTITY"],
    [270.0, 545.6, 12.6, "VAT"],
    [275.3, 34.9, 24.4, "CODE"],
    [275.3, 145.9, 51.7, "DESCRIPTION"],
    [275.3, 290.6, 39.1, "PACK SIZE"],
    [275.3, 409.9, 22.8, "PRICE"],
    [275.3, 460.9, 30.5, "WEIGHT"],
    [275.3, 504.8, 25.5, "VALUE"],
    [279.0, 541.9, 20.0, "CODE"],
    [279.8, 346.1, 15.5, "CASE"],
    [279.8, 369.8, 12.2, "UNIT"],
    [297.0, 36.0, 32.3, "CHILLED"],
    [314.3, 36.0, 22.4, "483508"],
    [314.3, 74.3, 75.8, "GREEN PEPPERS 1X5 KG"],
    [314.3, 285.0, 23.3, "1X5 KG"],
    [314.3, 351.0, 3.7, "1"],
    [314.3, 372.8, 3.7, "0"],
    [314.3, 433.5, 16.8, "11.52"],
    [314.3, 516.0, 16.8, "11.52"],
    [314.3, 546.0, 3.7, "1"],
    [326.3, 36.0, 22.4, "483827"],
    [326.3, 74.3, 132.7, "HELLMANNS VEGAN MAYONNAISE 1X2 LT"],
    [326.3, 285.0, 19.4, "1X2 LT"],
    [326.3, 351.0, 3.7, "4"],
    [326.3, 372.8, 3.7, "0"],
    [326.3, 433.5, 16.8, "11.49"],
    [326.3, 516.0, 16.8, "45.96"],
    [326.3, 546.0, 3.7, "1"],
    [338.3, 36.0, 22.4, "494780"],
    [338.3, 74.3, 189.5, "BLOCK & BARREL PREMIUM GRATED RED CHEDDAR 1X2 KG"],
    [338.3, 285.0, 23.3, "1X2 KG"],
    [338.3, 351.0, 3.7, "0"],
    [338.3, 372.8, 3.7, "2"],
    [338.3, 433.5, 16.8, "13.25"],
    [338.3, 516.0, 16.8, "26.50"],
    [338.3, 546.0, 3.7, "1"],
    [350.3, 36.0, 22.4, "494786"],
    [350.3, 74.3, 196.9, "BLOCK & BARREL PREMIUM MONTEREY JACK GRATED 1X2 KG"],
    [350.3, 285.0, 23.3, "1X2 KG"],
    [350.3, 351.0, 3.7, "0"],
    [350.3, 372.8, 3.7, "2"],
    [350.3, 433.5, 16.8, "14.33"],
    [350.3, 516.0, 16.8, "28.66"],
    [350.3, 546.0, 3.7, "1"],
    [362.3, 36.0, 22.4, "494790"],
    [362.3, 74.3, 184.6, "BLOCK & BARREL PREMIUM MOZZARELLA GRATED 1X2 KG"],
    [362.3, 285.0, 23.3, "1X2 KG"],
    [362.3, 351.0, 3.7, "0"],
    [362.3, 372.8, 3.7, "2"],
    [362.3, 433.5, 16.8, "13.34"],
    [362.3, 516.0, 16.8, "26.68"],
    [362.3, 546.0, 3.7, "1"],
    [374.3, 36.0, 26.1, "5017388"],
    [374.3, 74.3, 108.6, "CORIANDER (FRESH HERB) 1X1 KG"],
    [374.3, 285.0, 23.3, "1X1 KG"],
    [374.3, 351.0, 3.7, "1"],
    [374.3, 372.8, 3.7, "0"],
    [374.3, 437.3, 13.1, "9.88"],
    [374.3, 519.8, 13.1, "9.88"],
    [374.3, 546.0, 3.7, "1"],
    [386.3, 36.0, 26.1, "5018533"],
    [386.3, 74.3, 125.3, "PARIS BROWN MUSHROOMS 1X2.27 KG"],
    [386.3, 285.0, 32.6, "1X2.27 KG"],
    [386.3, 351.0, 3.7, "1"],
    [386.3, 372.8, 3.7, "0"],
    [386.3, 437.3, 13.1, "8.39"],
    [386.3, 519.8, 13.1, "8.39"],
    [386.3, 546.0, 3.7, "1"],
    [398.3, 36.0, 26.1, "5018687"],
    [398.3, 74.3, 77.5, "WHITE CABBAGE 1X1 EA"],
    [398.3, 285.0, 22.0, "1X1 EA"],
    [398.3, 351.0, 3.7, "0"],
    [398.3, 372.8, 3.7, "4"],
    [398.3, 437.3, 13.1, "1.43"],
    [398.3, 519.8, 13.1, "5.72"],
    [398.3, 546.0, 3.7, "1"],
    [410.3, 36.0, 26.1, "5018756"],
    [410.3, 74.3, 66.3, "RED ONIONS 1X1 KG"],
    [410.3, 285.0, 27.0, "10X1 KG"],
    [410.3, 351.0, 3.7, "1"],
    [410.3, 372.8, 3.7, "0"],
    [410.3, 437.3, 13.1, "9.27"],
    [410.3, 519.8, 13.1, "9.27"],
    [410.3, 546.0, 3.7, "1"],
    [422.3, 36.0, 26.1, "5018776"],
    [422.3, 74.3, 117.9, "PORTABELLO MUSHROOMS 1X1.5 KG"],
    [422.3, 285.0, 28.9, "1X1.5 KG"],
    [422.3, 351.0, 3.7, "1"],
    [422.3, 372.8, 3.7, "0"],
    [422.3, 437.3, 13.1, "6.62"],
    [422.3, 519.8, 13.1, "6.62"],
    [422.3, 546.0, 3.7, "1"],
    [441.0, 36.0, 34.3, "AMBIENT"],
    [458.3, 36.0, 18.7, "33581"],
    [458.3, 74.3, 159.0, "SYSCO CLASSIC GROUND CINNAMON 1X450 GM"],
    [458.3, 285.0, 33.0, "1X450 GM"],
    [458.3, 351.0, 3.7, "0"],
    [458.3, 372.8, 3.7, "1"],
    [458.3, 437.3, 13.1, "6.11"],
    [458.3, 519.8, 13.1, "6.11"],
    [458.3, 546.0, 3.7, "1"],
    [470.3, 36.0, 18.7, "33585"],
    [470.3, 74.3, 140.6, "SYSCO CLASSIC PAPRIKA PEPPER 1X480 GM"],
    [470.3, 285.0, 33.0, "1X480 GM"],
    [470.3, 351.0, 3.7, "0"],
    [470.3, 372.8, 3.7, "4"],
    [470.3, 437.3, 13.1, "5.35"],
    [470.3, 516.0, 16.8, "21.40"],
    [470.3, 546.0, 3.7, "1"],
    [482.3, 36.0, 22.4, "483033"],
    [482.3, 74.3, 153.3, "DRS 15C MONSTER ULTRA ZERO CAN 24X500 ML"],
    [482.3, 285.0, 33.9, "24X500 ML"],
    [482.3, 351.0, 3.7, "1"],
    [482.3, 372.8, 3.7, "0"],
    [482.3, 433.5, 16.8, "30.00"],
    [482.3, 516.0, 16.8, "30.00"],
    [482.3, 546.0, 3.7, "5"],
    [494.3, 36.0, 22.4, "483149"],
    [494.3, 74.3, 125.8, "DRS 15C COCA-COLA CAN 24X330 ML"],
    [494.3, 285.0, 33.9, "24X330 ML"],
    [494.3, 351.0, 3.7, "2"],
    [494.3, 372.8, 3.7, "0"],
    [494.3, 433.5, 16.8, "17.61"],
    [494.3, 516.0, 16.8, "35.22"],
    [494.3, 546.0, 3.7, "5"],
    [506.3, 36.0, 22.4, "483157"],
    [506.3, 74.3, 119.9, "DRS 15C COKE ZERO CAN 24X330 ML"],
    [506.3, 285.0, 33.9, "24X330 ML"],
    [506.3, 351.0, 3.7, "2"],
    [506.3, 372.8, 3.7, "0"],
    [506.3, 433.5, 16.8, "15.23"],
    [506.3, 516.0, 16.8, "30.46"],
    [506.3, 546.0, 3.7, "5"],
    [524.3, 36.0, 22.4, "483172"],
    [524.3, 74.3, 193.4, "DRS 15C RIVERROCK STILL WATER PLASTIC BOTTLE 24X500 ML"],
    [524.3, 285.0, 33.9, "24X500 ML"],
    [524.3, 351.0, 3.7, "1"],
    [524.3, 372.8, 3.7, "0"],
    [524.3, 437.3, 13.1, "9.66"],
    [524.3, 519.8, 13.1, "9.66"],
    [524.3, 546.0, 3.7, "5"],
    [542.3, 36.0, 26.1, "5015842"],
    [542.3, 74.3, 80.3, "AVOCADOS RTE 1X18 EA"],
    [542.3, 285.0, 25.7, "1X18 EA"],
    [542.3, 351.0, 3.7, "2"],
    [542.3, 372.8, 3.7, "0"],
    [542.3, 433.5, 16.8, "23.29"],
    [542.3, 516.0, 16.8, "46.58"],
    [542.3, 546.0, 3.7, "1"],
    [549.8, 428.3, 22.8, "396.63"],
    [550.5, 289.5, 114.3, "SubTotal Goods Value Excl. DRS"],
    [554.3, 36.0, 26.1, "5017545"],
    [554.3, 74.3, 72.8, "SUNFLOWER OIL 1X5 LT"],
    [554.3, 285.0, 19.4, "1X5 LT"],
    [554.3, 351.0, 3.7, "0"],
    [554.3, 372.8, 3.7, "1"],
    [554.3, 433.5, 16.8, "11.64"],
    [554.3, 516.0, 16.8, "11.64"],
    [554.3, 546.0, 3.7, "1"],
    [562.5, 114.0, 55.3, "Return Deposits"],
    [562.5, 215.3, 60.5, "No of Containers"],
    [562.5, 289.5, 79.2, "Deposit per Container"],
    [562.5, 428.3, 49.4, "Total Deposits"],
    [566.3, 36.0, 26.1, "5018194"],
    [566.3, 74.3, 168.4, "SANTA MARIA HABANERO CHEESE SAUCE 1X970 GM"],
    [566.3, 285.0, 33.0, "1X970 GM"],
    [566.3, 351.0, 3.7, "0"],
    [566.3, 372.8, 3.7, "2"],
    [566.3, 433.5, 16.8, "10.53"],
    [566.3, 516.0, 16.8, "21.06"],
    [566.3, 546.0, 3.7, "1"],
    [573.8, 114.0, 77.5, "Deposit 150ML-500ML"],
    [573.8, 215.3, 22.8, "144.00"],
    [573.8, 289.5, 14.5, "0.15"],
    [573.8, 428.3, 18.6, "21.60"],
    [585.0, 36.0, 30.6, "FROZEN"],
    [585.0, 215.3, 22.8, "144.00"],
    [585.0, 428.3, 18.6, "21.60"],
    [585.8, 114.0, 83.0, "Total Return Containers"],
    [585.8, 289.5, 74.3, "Total Return Deposits"],
    [602.3, 36.0, 18.7, "33385"],
    [602.3, 74.3, 75.6, "DICED MANGO 1X1 KG"],
    [602.3, 285.0, 23.3, "1X1 KG"],
    [602.3, 351.0, 3.7, "0"],
    [602.3, 372.8, 3.7, "2"],
    [602.3, 437.3, 13.1, "2.65"],
    [602.3, 519.8, 13.1, "5.30"],
    [602.3, 546.0, 3.7, "1"],
    [606.0, 113.3, 86.5, "30 Days End of Month"],
    [640.5, 29.3, 34.4, "VAT CODE"],
    [641.3, 85.1, 36.7, "VAT RATE"],
    [641.3, 166.5, 67.7, "TAXABLE GOODS"],
    [641.3, 276.0, 15.4, "VAT"],
    [641.3, 333.4, 58.1, "GOODS TOTAL"],
    [641.3, 418.9, 15.4, "VAT"],
    [641.3, 466.1, 73.0, "AMOUNT PAYABLE"],
    [652.5, 385.5, 20.5, "418.23"],
    [652.5, 423.8, 16.8, "24.23"],
    [652.5, 537.8, 20.5, "442.46"],
    [653.3, 59.3, 4.5, "1"],
    [653.3, 120.0, 16.0, "0.00"],
    [653.3, 231.8, 25.1, "291.29"],
    [653.3, 287.3, 16.0, "0.00"],
    [665.3, 59.3, 4.5, "5"],
    [665.3, 115.5, 20.5, "23.00"],
    [665.3, 231.8, 25.1, "105.34"],
    [665.3, 282.8, 20.5, "24.23"],
    [666.0, 317.3, 232.6, "ALL GOODS SUPPLIED AND ACCEPTED SUBJECT TO OUR CURRENT TERMS"],
    [675.0, 317.3, 181.6, "AND CONDITIONS OF TRADING AVAILABLE ON REQUEST."],
]

// A credit note for an invoice with a drink on it. Its box prints the deposit
// with no minus sign, under a goods total that has one.
const DRS_CREDIT_ROWS = [
    [204.8, 42.4, 39.1, "ACCT No."],
    [204.8, 102.0, 14.7, "TSO"],
    [204.8, 132.4, 23.2, "LOAD"],
    [204.8, 173.6, 23.1, "DROP"],
    [204.8, 214.1, 21.3, "CASE"],
    [204.8, 250.5, 16.8, "UNIT"],
    [204.8, 286.9, 34.3, "ORD No."],
    [204.8, 347.6, 38.4, "INV. DATE"],
    [204.8, 415.1, 32.1, "INV. No."],
    [204.8, 471.0, 17.6, "TYPE"],
    [204.8, 513.0, 38.6, "PAGE No."],
    [216.0, 48.8, 26.1, "9900001"],
    [216.0, 136.9, 14.5, "S131"],
    [216.0, 183.4, 3.7, "0"],
    [216.0, 221.6, 6.0, "-7"],
    [216.0, 255.8, 6.0, "-1"],
    [216.0, 288.8, 29.9, "45612570"],
    [216.0, 348.8, 35.8, "15/09/2026"],
    [216.0, 413.3, 35.4, "C45627507"],
    [216.0, 469.9, 20.1, "Credit"],
    [216.0, 523.5, 17.7, "1 of 1"],
    [238.5, 339.8, 47.8, "30 Days End of"],
    [247.5, 39.8, 44.9, "TOTAL WGT"],
    [247.5, 105.8, 16.8, "68.38"],
    [247.5, 157.1, 44.2, "CURRENCY"],
    [247.5, 222.8, 12.1, "EUR"],
    [247.5, 283.9, 24.6, "TERMS"],
    [247.5, 339.8, 21.1, "Month"],
    [270.0, 350.6, 28.0, "QUANTITY"],
    [270.0, 545.6, 12.6, "VAT"],
    [275.3, 34.9, 24.4, "CODE"],
    [275.3, 145.9, 51.7, "DESCRIPTION"],
    [275.3, 290.6, 39.1, "PACK SIZE"],
    [275.3, 409.9, 22.8, "PRICE"],
    [275.3, 460.9, 30.5, "WEIGHT"],
    [275.3, 504.8, 25.5, "VALUE"],
    [279.0, 541.9, 20.0, "CODE"],
    [279.8, 346.1, 15.5, "CASE"],
    [279.8, 369.8, 12.2, "UNIT"],
    [297.0, 36.0, 34.3, "AMBIENT"],
    [314.3, 36.0, 22.4, "483156"],
    [314.3, 74.3, 153.8, "DRS 15C COKE ZERO PLASTIC BOTTLE 24X500 ML"],
    [314.3, 285.0, 33.9, "24X500 ML"],
    [314.3, 351.0, 6.0, "-1"],
    [314.3, 372.8, 3.7, "0"],
    [314.3, 433.5, 16.8, "24.40"],
    [314.3, 513.8, 19.0, "-24.40"],
    [314.3, 546.0, 3.7, "5"],
    [333.0, 36.0, 32.3, "CHILLED"],
    [350.3, 36.0, 26.1, "5015724"],
    [350.3, 74.3, 148.9, "BALLYGARVEY EGGS MIXED GRADE A 1X15 DZ"],
    [350.3, 225.0, 36.8, "(180 EGGS)"],
    [350.3, 285.0, 25.4, "1X15 DZ"],
    [350.3, 351.0, 6.0, "-1"],
    [350.3, 372.8, 3.7, "0"],
    [350.3, 433.5, 16.8, "41.12"],
    [350.3, 513.8, 19.0, "-41.12"],
    [350.3, 546.0, 3.7, "1"],
    [362.3, 36.0, 26.1, "5016504"],
    [362.3, 74.3, 80.9, "MEDIUM ONION 1X19 KG"],
    [362.3, 285.0, 27.0, "1X19 KG"],
    [362.3, 351.0, 6.0, "-1"],
    [362.3, 372.8, 3.7, "0"],
    [362.3, 433.5, 16.8, "11.00"],
    [362.3, 513.8, 19.0, "-11.00"],
    [362.3, 546.0, 3.7, "1"],
    [374.3, 36.0, 26.1, "5018533"],
    [374.3, 74.3, 125.3, "PARIS BROWN MUSHROOMS 1X2.27 KG"],
    [374.3, 285.0, 32.6, "1X2.27 KG"],
    [374.3, 351.0, 6.0, "-1"],
    [374.3, 372.8, 3.7, "0"],
    [374.3, 437.3, 13.1, "8.39"],
    [374.3, 517.5, 15.3, "-8.39"],
    [374.3, 546.0, 3.7, "1"],
    [386.3, 36.0, 26.1, "5018754"],
    [386.3, 74.3, 70.0, "RED ONIONS 1X10 KG"],
    [386.3, 285.0, 27.0, "1X10 KG"],
    [386.3, 351.0, 6.0, "-1"],
    [386.3, 372.8, 3.7, "0"],
    [386.3, 437.3, 13.1, "8.00"],
    [386.3, 517.5, 15.3, "-8.00"],
    [386.3, 546.0, 3.7, "1"],
    [398.3, 36.0, 26.1, "5018758"],
    [398.3, 74.3, 75.8, "GREEN PEPPERS 1X5 KG"],
    [398.3, 285.0, 23.3, "1X5 KG"],
    [398.3, 351.0, 6.0, "-1"],
    [398.3, 372.8, 3.7, "0"],
    [398.3, 433.5, 16.8, "12.50"],
    [398.3, 513.8, 19.0, "-12.50"],
    [398.3, 546.0, 3.7, "1"],
    [410.3, 36.0, 26.1, "5018776"],
    [410.3, 74.3, 117.9, "PORTABELLO MUSHROOMS 1X1.5 KG"],
    [410.3, 285.0, 28.9, "1X1.5 KG"],
    [410.3, 351.0, 6.0, "-1"],
    [410.3, 372.8, 3.7, "0"],
    [410.3, 437.3, 13.1, "6.62"],
    [410.3, 517.5, 15.3, "-6.62"],
    [410.3, 546.0, 3.7, "1"],
    [422.3, 36.0, 26.1, "5018831"],
    [422.3, 74.3, 93.1, "HABANERO CHILLI 1X500 GM"],
    [422.3, 285.0, 33.0, "1X500 GM"],
    [422.3, 351.0, 3.7, "0"],
    [422.3, 372.8, 6.0, "-1"],
    [422.3, 437.3, 13.1, "7.93"],
    [422.3, 517.5, 15.3, "-7.93"],
    [422.3, 546.0, 3.7, "1"],
    [549.8, 428.3, 25.3, "-119.96"],
    [550.5, 289.5, 114.3, "SubTotal Goods Value Excl. DRS"],
    [562.5, 114.0, 55.3, "Return Deposits"],
    [562.5, 215.3, 60.5, "No of Containers"],
    [562.5, 289.5, 79.2, "Deposit per Container"],
    [562.5, 428.3, 49.4, "Total Deposits"],
    [573.8, 114.0, 77.5, "Deposit 150ML-500ML"],
    [573.8, 215.3, 18.6, "24.00"],
    [573.8, 289.5, 14.5, "0.15"],
    [573.8, 428.3, 14.5, "3.60"],
    [585.0, 215.3, 18.6, "24.00"],
    [585.0, 428.3, 14.5, "3.60"],
    [585.8, 114.0, 83.0, "Total Return Containers"],
    [585.8, 289.5, 74.3, "Total Return Deposits"],
    [606.0, 113.3, 86.5, "30 Days End of Month"],
    [640.5, 29.3, 34.4, "VAT CODE"],
    [641.3, 86.3, 36.7, "VAT RATE"],
    [641.3, 170.6, 67.7, "TAXABLE GOODS"],
    [641.3, 279.0, 15.4, "VAT"],
    [641.3, 333.4, 58.1, "GOODS TOTAL"],
    [641.3, 418.5, 15.4, "VAT"],
    [641.3, 465.8, 73.0, "AMOUNT PAYABLE"],
    [652.5, 383.3, 22.8, "-123.56"],
    [652.5, 424.5, 15.3, "-5.61"],
    [652.5, 535.5, 22.8, "-129.17"],
    [653.3, 59.3, 4.5, "5"],
    [653.3, 117.8, 20.5, "23.00"],
    [653.3, 240.0, 23.3, "-24.40"],
    [653.3, 287.3, 16.0, "5.61"],
    [665.3, 59.3, 4.5, "1"],
    [665.3, 122.3, 16.0, "0.00"],
    [665.3, 240.0, 23.3, "-95.56"],
    [665.3, 287.3, 16.0, "0.00"],
    [666.0, 317.3, 232.6, "ALL GOODS SUPPLIED AND ACCEPTED SUBJECT TO OUR CURRENT TERMS"],
    [675.0, 317.3, 181.6, "AND CONDITIONS OF TRADING AVAILABLE ON REQUEST."],
]

function fromRows(rows, page = 1) {
    return rows.map(([y, x, width, str]) => ({ page, str, x, y, width, height: 8 }))
}

const REAL_INVOICE = fromRows(INVOICE_ROWS)
const REAL_CREDIT = fromRows(CREDIT_ROWS)
const DRS_INVOICE = fromRows(DRS_INVOICE_ROWS)
const DRS_CREDIT = fromRows(DRS_CREDIT_ROWS)

// The same document with its rows changed, for the cases one real invoice does
// not happen to contain.
function edited(rows, change) {
    return fromRows(change(rows.map(r => [...r])))
}

// A made up page for the tests further down, where what matters is one idea at
// a time rather than the whole layout.
const CHAR = 5.2

function at(x, text, y, page = 1) {
    return { page, str: text, x, y, width: String(text).length * CHAR, height: 8 }
}

// Figures are printed right aligned against the end of their column, which is
// what puts them under a heading that starts further left.
function rightAt(edge, text, y, page = 1) {
    const width = String(text).length * CHAR
    return { page, str: text, x: edge - width, y, width, height: 8 }
}

const COL = { code: 40, description: 90, pack: 250, cases: 350, units: 390, price: 446, value: 525 }

function headingRow(y, page = 1) {
    return [
        at(COL.code, 'CODE', y, page),
        at(COL.description, 'DESCRIPTION', y, page),
        at(COL.pack, 'PACK SIZE', y, page),
        at(330, 'CASE', y, page),
        at(370, 'UNIT', y, page),
        at(420, 'PRICE', y, page),
        at(480, 'VALUE', y, page),
    ]
}

function lineRow(y, { code, description, pack, cases, units, price, value }, page = 1) {
    return [
        at(COL.code, code, y, page),
        at(COL.description, description, y, page),
        ...(pack ? [at(COL.pack, pack, y, page)] : []),
        rightAt(COL.cases, cases, y, page),
        rightAt(COL.units, units, y, page),
        rightAt(COL.price, price, y, page),
        rightAt(COL.value, value, y, page),
    ]
}

// The block at the top of a made up page, and the total at its foot with the
// figure under the words, the way the real one prints it.
function topBlock({ number, date, account, type, order, cases }) {
    const spots = [
        [40, 'INV. No.', number],
        [110, 'INV. DATE', date],
        [190, 'ACCT No.', account],
        [260, 'TYPE', type],
        [320, 'ORD No.', order],
        [390, 'CASE', cases],
    ]
    return [
        ...spots.map(([x, label]) => at(x, label, 100)),
        ...spots.map(([x, , value]) => at(x, value, 112)),
    ]
}

// The whole foot, the way the real one is laid out: the VAT by code on the
// left, then the goods, the VAT and the amount payable. Everything at a VAT
// rate of nothing, so what is payable is the goods.
function foot(y, total, page = 1) {
    const titles = [
        [29, 'VAT CODE'], [86, 'VAT RATE'], [170, 'TAXABLE GOODS'], [279, 'VAT'],
        [333, 'GOODS TOTAL'], [418, 'VAT'], [466, 'AMOUNT PAYABLE'],
    ]
    return [
        ...titles.map(([x, title]) => at(x, title, y, page)),
        at(59, '1', y + 11, page),
        rightAt(137, '0.00', y + 11, page),
        rightAt(262, total, y + 11, page),
        rightAt(303, '0.00', y + 11, page),
        rightAt(406, total, y + 11, page),
        rightAt(440, '0.00', y + 11, page),
        rightAt(558, total, y + 11, page),
    ]
}

describe('putting a page back into rows', () => {
    it('groups whatever sits on the same baseline', () => {
        const rows = rowsOf([at(90, 'b', 100), at(40, 'a', 100), at(40, 'c', 120)])
        expect(rows).toHaveLength(2)
        expect(rows[0].items.map(i => i.str)).toEqual(['a', 'b'])
    })

    it('does not run two pages together', () => {
        const rows = rowsOf([at(40, 'a', 100, 1), at(40, 'b', 100, 2)])
        expect(rows).toHaveLength(2)
    })
})

describe('joining lettering that is touching', () => {
    it('makes one cell of a run broken into pieces', () => {
        const row = rowsOf([at(40, 'FLOUR', 100), at(40 + 5 * CHAR + 2, 'TORTILLA', 100)])[0]
        expect(cellsOf(row).map(c => c.text)).toEqual(['FLOUR TORTILLA'])
    })

    it('leaves a column gutter alone', () => {
        const row = rowsOf([at(40, 'a', 100), at(200, 'b', 100)])[0]
        expect(cellsOf(row)).toHaveLength(2)
    })
})

describe('finding a heading', () => {
    it('reads one written in two pieces', () => {
        const row = rowsOf([at(40, 'PACK', 100), at(200, 'SIZE', 100)])[0]
        const spot = findHeading(cellsOf(row), 'PACK SIZE')
        expect(spot).not.toBeNull()
        expect(spot.endIndex).toBe(1)
    })

    it('says nothing when it is not there', () => {
        const row = rowsOf([at(40, 'CODE', 100)])[0]
        expect(findHeading(cellsOf(row), 'PACK SIZE')).toBeNull()
    })
})

describe('the columns', () => {
    const cells = cellsOf(rowsOf(headingRow(200))[0])
    const columns = columnsFrom(cells)

    it('comes off the headings, in order', () => {
        expect(columns.map(c => c.name)).toEqual(LINE_COLUMNS)
    })

    it('runs to the edges at both ends', () => {
        expect(columns[0].from).toBe(-Infinity)
        expect(columns[columns.length - 1].to).toBe(Infinity)
    })

    it('is nothing at all when a heading is missing', () => {
        const short = cellsOf(rowsOf([at(40, 'CODE', 200), at(90, 'DESCRIPTION', 200)])[0])
        expect(columnsFrom(short)).toBeNull()
    })

    // Figures are right aligned and headings are left aligned, so a value sits
    // well to the right of the word above it. Bucketing on the middle of a cell
    // is what makes that land in the right place.
    it('puts a right aligned figure under its own heading', () => {
        const row = rowsOf(lineRow(228, {
            code: '497870', description: 'FLOUR TORTILLA', pack: '4X2.5 KG',
            cases: '2', units: '0', price: '30.30', value: '60.60',
        }))[0]
        const held = bucket(cellsOf(row), columns)
        expect(held.CODE.map(c => c.text)).toEqual(['497870'])
        expect(held.CASE.map(c => c.text)).toEqual(['2'])
        expect(held.PRICE.map(c => c.text)).toEqual(['30.30'])
        expect(held.VALUE.map(c => c.text)).toEqual(['60.60'])
    })
})

describe('pack sizes', () => {
    it.each([
        ['4X2.5 KG', { count: 4, size: 2.5, unit: 'KG', total: 10 }],
        ['1X10 KG', { count: 1, size: 10, unit: 'KG', total: 10 }],
        ['6X1 LTR', { count: 6, size: 1, unit: 'Litre', total: 6 }],
        ['2X6X330ML', { count: 12, size: 0.33, unit: 'Litre', total: 3.96 }],
        ['500G', { count: 1, size: 0.5, unit: 'KG', total: 0.5 }],
    ])('reads %s', (text, expected) => {
        expect(readPackSize(text)).toEqual({ ...expected, printed: text })
    })

    // Both numbers come back because the invoice cannot say which one belongs
    // in units_per_case: ten is right for something counted in kilos and four
    // is right for something counted in bags.
    it('keeps the count and the total apart', () => {
        const pack = readPackSize('4X2.5 KG')
        expect(pack.count).toBe(4)
        expect(pack.total).toBe(10)
    })

    it('treats a bare number as a count with no unit', () => {
        expect(readPackSize('24')).toEqual({
            count: 24, size: null, unit: null, total: 24, printed: '24',
        })
    })

    it.each(['EACH', '', 'FLOUR TORTILLA'])('says nothing for %s', text => {
        expect(readPackSize(text)).toBeNull()
    })

    // One item out of the case, the way the UNIT column on their paper counts
    // it: a bag of a 4X500 GM case, a can of a 24X330 ML one.
    it.each([
        ['4X500 GM', 4],
        ['24X330 ML', 24],
        ['10X10 EA', 10],
        ['1X10 EA', 10],
        ['24', 24],
        ['1X5 KG', 1],
        ['1X2 LT', 1],
        ['1X500 GM', 1],
    ])('counts the items in %s', (text, items) => {
        expect(packItems(text)).toBe(items)
    })

    // Six of four, or four of six, or twenty four loose: nothing says which.
    it.each(['6X4', 'FLOUR TORTILLA', '', null])('will not guess the items in %s', text => {
        expect(packItems(text)).toBeNull()
    })

    it('can tell a pack size from a product name', () => {
        expect(looksLikePackSize('4X2.5 KG')).toBe(true)
        expect(looksLikePackSize('FLOUR TORTILLA 12IN')).toBe(false)
    })
})

describe('dates and money on the paper', () => {
    it('reads the day first date the PDF uses', () => {
        expect(paperDate('23/08/2026')).toBe('2026-08-23')
    })

    // The portal writes the same date the other way round, which is why the two
    // do not share a reader.
    it('refuses the format the portal uses', () => {
        expect(paperDate('2026-08-23')).toBeNull()
    })

    it.each([['163.03', 163.03], ['-74.26', -74.26], ['1,234.56', 1234.56], ['0.00', 0]])(
        'reads %s', (text, value) => expect(money(text)).toBe(value),
    )

    it('says nothing for N/A', () => {
        expect(money('N/A')).toBeNull()
    })
})

describe('the block at the top of the real invoice', () => {
    const rows = rowsOf(REAL_INVOICE)

    // Printed as a little table, titles on one line and values under them, so
    // looking beside a title first would find the next title along.
    it('takes each value from under its title', () => {
        expect(headField(rows, 'INV. No.')).toBe('45448455')
        expect(headField(rows, 'ACCT No.')).toBe('9900001')
        expect(headField(rows, 'INV. DATE')).toBe('23/08/2026')
        expect(headField(rows, 'TYPE')).toBe('Invoice')
    })

    // CASE is a title in both the block at the top and the table below it, and
    // they mean different things.
    it('stops above the line table so the two CASE columns cannot be confused', () => {
        expect(headField(rows, 'CASE', 270)).toBe('6')
    })

    // The first version looked for it at the top, where it is not.
    it('finds the totals at the foot, under their titles', () => {
        expect(footBlock(rows)).toEqual({
            goodsTotal: 163.03,
            vat: 0,
            payable: 163.03,
            codes: [{ code: '1', rate: 0, taxable: 163.03, vat: 0 }],
        })
    })
})

describe('reading the real invoice', () => {
    const read = readSyscoInvoice(REAL_INVOICE)

    // What the import said about it before: not a document the Hub can read.
    // The headings are on three baselines and the reader wanted them on one.
    it('knows it is one of theirs', () => {
        expect(recognisesSysco(REAL_INVOICE)).toBe(true)
    })

    it('reads the header', () => {
        expect(read).toMatchObject({
            kind: 'invoice',
            number: '45448455',
            date: '2026-08-23',
            accountNo: '9900001',
            orderReference: null,
            headCases: 6,
            goodsTotal: 163.03,
        })
    })

    it('reads every line, in order', () => {
        expect(read.lines.map(l => l.code)).toEqual(['497870', '485073', '492715', 'VG958Z'])
        expect(read.lines.map(l => l.line_no)).toEqual([1, 2, 3, 4])
    })

    // Half of it is above the code and half below, on rows with nothing else on
    // them. Read top to bottom, the first half was dropped and the description
    // came out as "10X10 EA".
    it('keeps both halves of a description that wraps round its code', () => {
        expect(read.lines[0].description)
            .toBe('SANTA MARIA FLOUR TORTILLA WRAP LONG LIFE 12 INCH 10X10 EA')
    })

    it('reads each line whole', () => {
        expect(read.lines[1]).toMatchObject({
            code: '485073',
            description: 'CHORIZO CUBES 1X500 GM',
            pack_size: '4X500 GM',
            cases: 1,
            units: 0,
            price_per_case: 27.99,
            value: 27.99,
            storage: 'chilled',
        })
    })

    // The VAT code sits a few points to the right of each value. Without a
    // column of its own it was read as part of the value, and 60.60 with a 1
    // after it is 60.601.
    it('keeps the VAT code out of the value', () => {
        expect(read.lines.map(l => l.value)).toEqual([60.6, 27.99, 36.84, 37.6])
    })

    it('carries each band down the lines under it', () => {
        expect(read.lines.map(l => l.storage)).toEqual(['ambient', 'chilled', 'frozen', 'frozen'])
    })

    it('reads the pack sizes it prints', () => {
        expect(read.lines.map(l => l.pack?.total)).toEqual([100, 2, 9.08, 10])
        // Ten packs of ten, counted rather than weighed.
        expect(read.lines[0].pack).toMatchObject({ count: 10, size: 10, unit: 'Units' })
    })

    // The two checks, which are the whole reason this can be trusted without
    // anybody reading the paper beside the screen.
    it('adds the values up to the goods total', () => {
        expect(read.checks.values).toEqual({ expected: 163.03, got: 163.03, ok: true })
    })

    it('adds the case counts up to the header count', () => {
        expect(read.checks.cases).toEqual({ expected: 6, got: 6, ok: true })
    })

    it('has nothing to complain about', () => {
        expect(read.checks.ok).toBe(true)
        expect(read.problems).toEqual([])
    })

    // The box sits inside the table's frame on every page and is not a line.
    it('does not attach the payment terms box to a line', () => {
        expect(read.lines.some(l => l.description.includes('30 Days'))).toBe(false)
    })
})

describe('reading the real credit note', () => {
    const read = readSyscoInvoice(REAL_CREDIT)

    // The same reader. The layout is identical and the only difference is that
    // everything is negative, so a second flow would be two ways to be wrong.
    it('is the same reader and knows which kind it is', () => {
        expect(read.kind).toBe('credit')
        expect(read.number).toBe('C45485340')
    })

    // The exact key that pairs a credit to its invoice. Invoices carry no order
    // reference and credits carry the invoice.
    it('keeps the invoice it credits', () => {
        expect(read.orderReference).toBe('45480809')
    })

    it('is negative all the way down', () => {
        expect(read.goodsTotal).toBe(-74.26)
        expect(read.headCases).toBe(-2)
        expect(read.lines).toEqual([
            expect.objectContaining({
                code: '497365', description: 'BAY LEAVES 1X1 KG', pack_size: '1X1 KG',
                cases: -2, price_per_case: 37.13, value: -74.26, storage: 'ambient',
            }),
        ])
    })

    it('passes both checks with the signs on', () => {
        expect(read.checks.ok).toBe(true)
    })
})

describe('the deposit box over a full page', () => {
    const read = readSyscoInvoice(DRS_INVOICE)

    // Twelve of the first thirty seven real documents were refused before
    // this, every one of them with drinks on it.
    it('adds the lines up against the goods less the container deposit', () => {
        expect(read.goodsTotal).toBe(418.23)
        expect(read.deposits).toBe(21.6)
        expect(read.checks.values).toEqual({ expected: 396.63, got: 396.63, ok: true })
        expect(read.checks.ok).toBe(true)
        expect(read.lines).toHaveLength(20)
    })

    // What it did before: "Return Deposits SANTA MARIA HABANERO CHEESE SAUCE"
    // and "DICED MANGO 1X1 KG 30 Days End of Month".
    it('keeps the words in the box out of the descriptions under it', () => {
        expect(read.lines.slice(-2).map(l => l.description)).toEqual([
            'SANTA MARIA HABANERO CHEESE SAUCE 1X970 GM',
            'DICED MANGO 1X1 KG',
        ])
        expect(read.lines.some(l => /deposit|days/i.test(l.description))).toBe(false)
    })

    // FROZEN is printed on exactly the same baseline as a row of the box, and
    // the mango under it was filed as ambient.
    it('finds the band that shares a line with the box', () => {
        expect(read.lines.slice(-2).map(l => l.storage)).toEqual(['ambient', 'frozen'])
    })

    // The box's own figures sit in the price and pack size columns, right
    // between the lines. None of them may end up on one.
    it('leaves the figures of the lines under the box as printed', () => {
        expect(read.lines.slice(-4).map(l => [l.pack_size, l.cases, l.units, l.price_per_case, l.value])).toEqual([
            ['1X18 EA', 2, 0, 23.29, 46.58],
            ['1X5 LT', 0, 1, 11.64, 11.64],
            ['1X970 GM', 0, 2, 10.53, 21.06],
            ['1X1 KG', 0, 2, 2.65, 5.3],
        ])
    })

    it('knows where the box is and what the deposit came to', () => {
        expect(depositBox(DRS_INVOICE)).toMatchObject({ page: 1, left: 114, deposits: 21.6 })
        expect(depositBox(REAL_INVOICE)).toBeNull()
    })

    // A box whose total cannot be read is refused rather than taken as no
    // deposit, which would have closed the sum wrongly on a different invoice.
    it('refuses it when the deposit total cannot be read', () => {
        const blank = edited(DRS_INVOICE_ROWS, rows => rows.filter(r => !(r[0] === 585.0 && r[3] === '21.60')))
        const refused = readSyscoInvoice(blank)

        expect(refused.deposits).toBeNull()
        expect(refused.checks.values.ok).toBe(false)
    })

    it('does not change a document with no box on it', () => {
        expect(readSyscoInvoice(REAL_INVOICE).deposits).toBe(0)
    })
})

describe('a credit note with a deposit on it', () => {
    const read = readSyscoInvoice(DRS_CREDIT)

    // Printed as 3.60 under a goods total of -123.56. The containers come back
    // with everything else.
    it('takes the deposit as money coming back', () => {
        expect(read.kind).toBe('credit')
        expect(read.orderReference).toBe('45612570')
        expect(read.goodsTotal).toBe(-123.56)
        expect(read.deposits).toBe(-3.6)
        expect(read.checks.values).toEqual({ expected: -119.96, got: -119.96, ok: true })
        expect(read.checks.ok).toBe(true)
    })

    it('reads a description that arrives in two pieces on one line', () => {
        expect(read.lines[1].description).toBe('BALLYGARVEY EGGS MIXED GRADE A 1X15 DZ (180 EGGS)')
    })

    // Its VAT is printed without a minus sign too, under taxable goods with
    // one. What comes back is what the drink cost, VAT and deposit included.
    it('gives back the VAT and the deposit on the drink it credits', () => {
        expect(read.payable).toBe(-129.17)
        expect(read.vat).toBe(-5.61)
        expect(read.lines[0]).toMatchObject({ value: -24.4, vat: -5.61, deposit: -3.6 })
        expect(read.lines.slice(1).every(l => l.vat === 0 && l.deposit === 0)).toBe(true)
        expect(read.checks.payable.ok).toBe(true)
    })
})

describe('what a document charges', () => {
    const read = readSyscoInvoice(DRS_INVOICE)

    // Decided on 24 September: an invoice costs what it charges, VAT and
    // deposit included, the way the ones typed in by hand always did.
    it('reads the VAT and the amount payable at the foot', () => {
        expect(read.vat).toBe(24.23)
        expect(read.payable).toBe(442.46)
    })

    // VAT code 5 is the drinks at 23%. The deposit is fifteen cents a container
    // and the pack says how many are in a case, so the shares are exact.
    it('puts the VAT and the deposit on the lines that owe them', () => {
        const drinks = read.lines.filter(l => l.vat_code === '5')
        expect(drinks.map(l => [l.code, l.vat, l.deposit])).toEqual([
            ['483033', 6.9, 3.6],
            ['483149', 8.1, 7.2],
            ['483157', 7.01, 7.2],
            ['483172', 2.22, 3.6],
        ])
        expect(read.lines.filter(l => l.vat_code === '1').every(l => l.vat === 0 && l.deposit === 0)).toBe(true)
    })

    it('comes to the amount payable to the cent', () => {
        expect(read.checks.payable).toEqual({ expected: 442.46, got: 442.46, codes: true, ok: true })
        expect(read.checks.ok).toBe(true)
    })

    // The totals would still agree with a code misread, and the VAT would sit on
    // the wrong line, possibly in the wrong category. So the lines under each
    // code have to add up to what the table says was taxable at it.
    it('refuses it when a line is under the wrong VAT code', () => {
        const wrong = edited(DRS_INVOICE_ROWS, rows => rows.map(r => (
            r[0] === 482.3 && r[1] === 546.0 ? [r[0], r[1], r[2], '1'] : r
        )))
        const refused = readSyscoInvoice(wrong)
        expect(refused.checks.payable.codes).toBe(false)
        expect(refused.checks.ok).toBe(false)
    })

    // The figures are right aligned in boxes wider than their titles, so a
    // short amount starts to the right of where its title ends. Reading "under
    // the title" missed every amount payable under a hundred euro.
    it('reads an amount under a hundred at the foot', () => {
        const small = edited(INVOICE_ROWS, rows => rows.map(r => (
            r[3] === '163.03' && r[0] > 640 ? [r[0], r[1] + 4, r[2] - 4, '63.03'] : r
        )))
        expect(footBlock(rowsOf(small))).toMatchObject({ goodsTotal: 63.03, payable: 63.03 })
    })
})

describe('sharing money out to the cent', () => {
    it('adds up to exactly what was shared', () => {
        const shares = shareOut(24.23, [30, 35.22, 30.46, 9.66])
        expect(shares).toEqual([6.9, 8.1, 7.01, 2.22])
        expect(Math.round(shares.reduce((t, s) => t + s, 0) * 100)).toBe(2423)
    })

    it('gives the odd cent to the biggest remainder', () => {
        expect(shareOut(0.1, [1, 1, 1])).toEqual([0.04, 0.03, 0.03])
    })

    it('keeps the sign of a credit', () => {
        expect(shareOut(-3.6, [24])).toEqual([-3.6])
    })

    it('shares evenly when there is nothing to go by, and nothing to nobody', () => {
        expect(shareOut(1, [0, 0])).toEqual([0.5, 0.5])
        expect(shareOut(5, [])).toEqual([])
    })
})

describe('when the real invoice does not add up', () => {
    // A parser that half works is worse than one that stops: half a document in
    // the food cost looks exactly like a quiet week.
    it('fails the value check and says both figures', () => {
        const wrong = edited(INVOICE_ROWS, rows => rows.map(r => (
            r[3] === '163.03' && r[0] > 640 && r[1] > 380 && r[1] < 400 ? [r[0], r[1], r[2], '170.00'] : r
        )))
        const read = readSyscoInvoice(wrong)

        expect(read.checks.values).toEqual({ expected: 170, got: 163.03, ok: false })
        expect(read.checks.ok).toBe(false)
        expect(read.problems).toContainEqual(
            expect.objectContaining({ why: 'values', expected: 170, got: 163.03 }),
        )
    })

    it('fails the case check on its own', () => {
        const wrong = edited(INVOICE_ROWS, rows => rows.map(r => (
            r[3] === '6' && r[0] < 220 ? [r[0], r[1], r[2], '7'] : r
        )))
        const read = readSyscoInvoice(wrong)

        expect(read.checks.cases.ok).toBe(false)
        expect(read.checks.values.ok).toBe(true)
        expect(read.checks.ok).toBe(false)
    })

    // A line the reader dropped is exactly the case the two checks exist for.
    it('refuses it when a line goes missing', () => {
        const short = edited(INVOICE_ROWS, rows => rows.filter(r => r[0] !== 362.3))
        expect(readSyscoInvoice(short).checks.ok).toBe(false)
    })
})

describe('the awkward parts a real page can have', () => {
    // DESCRIPTION is centred over a wide column and CODE sits at the far left,
    // so halfway between the two headings is well to the right of where a
    // description starts. A short one sat entirely on the code's side.
    it('keeps a short description as a description, not a code', () => {
        const eggs = edited(INVOICE_ROWS, rows => rows.map(r => (
            r[3] === 'CHORIZO CUBES 1X500 GM' ? [r[0], r[1], 20, 'EGGS'] : r
        )))
        const read = readSyscoInvoice(eggs)
        expect(read.lines[1]).toMatchObject({ code: '485073', description: 'EGGS' })
    })

    // A single word wrapped onto its own row looks exactly like a code.
    it('keeps a one word second line with its description', () => {
        const wrapped = edited(INVOICE_ROWS, rows => [...rows, [366.8, 74.3, 30, 'DICED']])
        const read = readSyscoInvoice(wrapped)
        expect(read.lines[1].description).toBe('CHORIZO CUBES 1X500 GM DICED')
        expect(read.lines).toHaveLength(4)
    })

    // The amendment box is printed on every page with an empty square beside
    // it. Whether it is ticked is not in the text, so it is not read at all.
    it('pays no attention to the amendment box', () => {
        const read = readSyscoInvoice([...REAL_INVOICE, ...fromRows([[790, 480, 50, 'AMENDMENT']])])
        expect(read.checks.ok).toBe(true)
        expect(read).not.toHaveProperty('amended')
    })

    it('is nothing at all for a file that is not one of theirs', () => {
        expect(readSyscoInvoice(fromRows([[100, 40, 90, 'A letter from the bank']]))).toBeNull()
        expect(recognisesSysco(fromRows([[100, 40, 90, 'Some other paperwork']]))).toBe(false)
    })
})

describe('the awkward parts, one at a time', () => {
    // A long description finishing a point or two short of the pack size beside
    // it, which is closer than two words of the description are to each other.
    // Merged on the gap alone the two become one cell, the pack size stops
    // looking like a pack size, and both are lost at once.
    it('does not join a long description to the pack size beside it', () => {
        const tight = [
            ...topBlock({
                number: '45448455', date: '23/08/2026', account: '9900001',
                type: 'Invoice', order: 'N/A', cases: '1',
            }),
            ...headingRow(200),
            at(COL.code, '497870', 228),
            at(COL.description, 'CHICKEN BREAST DICED SKINLESS XL', 228),
            at(258, '2X5 KG', 228),
            rightAt(COL.cases, '1', 228),
            rightAt(COL.units, '0', 228),
            rightAt(COL.price, '10.00', 228),
            rightAt(COL.value, '10.00', 228),
            ...foot(320, '10.00'),
        ]
        const read = readSyscoInvoice(tight)

        expect(read.lines[0].pack_size).toBe('2X5 KG')
        expect(read.lines[0].description).toBe('CHICKEN BREAST DICED SKINLESS XL')
        expect(read.lines[0].pack.total).toBe(10)
    })

    // Some lines print a word in the unit column rather than a figure. It is
    // not a quantity and it is not thrown away either: nothing read off the
    // paper disappears without showing up somewhere on screen.
    it('keeps a word that sits in a number column instead of a figure', () => {
        const worded = [
            ...topBlock({
                number: '45448455', date: '23/08/2026', account: '9900001',
                type: 'Invoice', order: 'N/A', cases: '1',
            }),
            ...headingRow(200),
            at(COL.code, '497870', 228),
            at(COL.description, 'CHICKEN', 228),
            at(COL.pack, '2X5 KG', 228),
            rightAt(COL.cases, '1', 228),
            rightAt(COL.units, 'EA', 228),
            rightAt(COL.price, '10.00', 228),
            rightAt(COL.value, '10.00', 228),
            ...foot(320, '10.00'),
        ]
        const read = readSyscoInvoice(worded)

        expect(read.lines[0].cases).toBe(1)
        expect(read.lines[0].units).toBe(0)
        expect(read.lines[0].description).toBe('CHICKEN EA')
    })

    // The headings repeat on every page and the total is only on the last.
    it('reads a second page and keeps counting the lines', () => {
        const twoPages = [
            ...topBlock({
                number: '45448455', date: '23/08/2026', account: '9900001',
                type: 'Invoice', order: 'N/A', cases: '3',
            }),
            ...headingRow(200),
            at(COL.code, 'AMBIENT', 214),
            ...lineRow(228, {
                code: '497870', description: 'FLOUR TORTILLA 12IN', pack: '4X2.5 KG',
                cases: '2', units: '0', price: '30.30', value: '60.60',
            }),
            ...headingRow(200, 2),
            ...lineRow(228, {
                code: '448921', description: 'FRIES 7MM', pack: '4X2.5 KG',
                cases: '1', units: '0', price: '14.00', value: '14.00',
            }, 2),
            ...foot(320, '74.60', 2),
        ]
        const read = readSyscoInvoice(twoPages)

        expect(read.pages).toBe(2)
        expect(read.lines.map(l => l.line_no)).toEqual([1, 2])
        // The band carries across the page break with the lines under it.
        expect(read.lines.map(l => l.storage)).toEqual(['ambient', 'ambient'])
        expect(read.checks.ok).toBe(true)
    })

    // Both are on the second page of a real two page invoice. Baking parchment
    // was filed as frozen, because NON FOOD was not a band the reader knew and
    // FROZEN from the page before carried on.
    it('knows a band carried over a page, and that NON FOOD is not somewhere to keep things', () => {
        const twoPages = [
            ...topBlock({
                number: '45607444', date: '13/09/2026', account: '9900001',
                type: 'Invoice', order: 'N/A', cases: '1',
            }),
            ...headingRow(200),
            at(COL.code, 'FROZEN', 214),
            ...lineRow(228, {
                code: '492397', description: 'CORN CHIPS FOR FRYING WHITE 3X1 KG', pack: '3X1 KG',
                cases: '1', units: '0', price: '19.82', value: '19.82',
            }),
            ...headingRow(200, 2),
            at(COL.code, 'FROZEN continued...', 214, 2),
            ...lineRow(228, {
                code: '5019667', description: 'SANTA MARIA GUACAMOLE 1X1 KG', pack: '6X1 KG',
                cases: '0', units: '1', price: '56.22', value: '56.22',
            }, 2),
            at(COL.code, 'NON FOOD', 246, 2),
            ...lineRow(260, {
                code: '497193', description: 'PREMIER BAKING PARCHMENT 450MMX50M 1X1 EA', pack: '1X1 EA',
                cases: '0', units: '1', price: '8.34', value: '8.34',
            }, 2),
            ...foot(320, '84.38', 2),
        ]
        const read = readSyscoInvoice(twoPages)

        expect(read.lines.map(l => l.storage)).toEqual(['frozen', 'frozen', null])
        expect(read.lines.map(l => l.description)).toEqual([
            'CORN CHIPS FOR FRYING WHITE 3X1 KG',
            'SANTA MARIA GUACAMOLE 1X1 KG',
            'PREMIER BAKING PARCHMENT 450MMX50M 1X1 EA',
        ])
        expect(read.checks.ok).toBe(true)
    })
})

// Sysco's system turns a curly apostrophe into the three characters of its
// bytes, and then prints the lot in capitals.
describe('garbled text from the supplier', () => {
    it('puts a curly apostrophe back as a plain one', () => {
        expect(mend('BROWN KRAFT LEAKPROOF FOOD CONTAINER 26OZ NO.1 (9X50Â€™S)'))
            .toBe("BROWN KRAFT LEAKPROOF FOOD CONTAINER 26OZ NO.1 (9X50'S)")
        expect(mend('KID€™S')).toBe('KID€™S')
        expect(mend('MUMâ€™S')).toBe("MUM'S")
    })

    it('puts curly quotes and dashes back as plain ones', () => {
        expect(mend('Â€œHOTÂ€ SAUCE Â€“ 1L')).toBe('"HOT" SAUCE - 1L')
    })

    it('leaves ordinary text alone', () => {
        expect(mend('SANTA MARIA FLOUR TORTILLA 12"')).toBe('SANTA MARIA FLOUR TORTILLA 12"')
    })
})
