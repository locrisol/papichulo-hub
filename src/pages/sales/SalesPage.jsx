import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney } from '../../lib/format'

const VARIANCE_WARN_THRESHOLD = 10
const CATEGORIES = ['Expense', 'Refund', 'Other']

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

// Parse a money input string to a number, treating blank as 0.
function num(v) {
  if (v === '' || v == null) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

export default function SalesPage() {
  const { user } = useAuth()
  const { activeRestaurant } = useRestaurant()

  const [saleDate, setSaleDate] = useState(todayISO())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [recordId, setRecordId] = useState(null)
  const [isClosed, setIsClosed] = useState(false)

  const [platforms, setPlatforms] = useState([])

  const [grossSales, setGrossSales] = useState('')
  const [netSales, setNetSales] = useState('')
  const [cashSales, setCashSales] = useState('')
  const [cardSales, setCardSales] = useState('')
  const [kioskSales, setKioskSales] = useState('')
  const [staffFood, setStaffFood] = useState('')

  const [startFloat, setStartFloat] = useState('200')
  const [endFloat, setEndFloat] = useState('200')
  const [cashBanked, setCashBanked] = useState('')

  const [platformSales, setPlatformSales] = useState({})

  const [pettyEntries, setPettyEntries] = useState([])
  const [pcCategory, setPcCategory] = useState('Expense')
  const [pcReason, setPcReason] = useState('')
  const [pcAmount, setPcAmount] = useState('')

  useEffect(() => {
    if (activeRestaurant) loadDay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRestaurant, saleDate])

  async function loadDay() {
    setLoading(true)
    setError('')
    setSuccess('')

    const { data: plats, error: pErr } = await supabase
      .from('sales_platforms')
      .select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .eq('is_active', true)

    if (pErr) { setError(pErr.message); setLoading(false); return }
    const sortedPlats = (plats || []).sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    )
    setPlatforms(sortedPlats)

    const { data: rec, error: rErr } = await supabase
      .from('sales_records')
      .select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .eq('sale_date', saleDate)
      .maybeSingle()

    if (rErr) { setError(rErr.message); setLoading(false); return }

    if (rec) {
      setRecordId(rec.id)
      setIsClosed(rec.is_closed || false)
      setGrossSales(rec.gross_sales ?? '')
      setNetSales(rec.net_sales ?? '')
      setCashSales(rec.cash_sales ?? '')
      setCardSales(rec.card_sales ?? '')
      setKioskSales(rec.kiosk_sales ?? '')
      setStaffFood(rec.staff_food ?? '')
      setStartFloat(rec.start_float ?? '200')
      setEndFloat(rec.end_float ?? '200')
      setCashBanked(rec.cash_banked ?? '')
      const ps = {}
      if (rec.platform_sales && typeof rec.platform_sales === 'object') {
        for (const [k, v] of Object.entries(rec.platform_sales)) ps[k] = String(v)
      }
      setPlatformSales(ps)
    } else {
      setRecordId(null)
      setIsClosed(false)
      setGrossSales(''); setNetSales(''); setCashSales(''); setCardSales('')
      setKioskSales(''); setStaffFood(''); setStartFloat('200'); setEndFloat('200')
      setCashBanked(''); setPlatformSales({})
    }

    const { data: petty, error: pcErr } = await supabase
      .from('petty_cash_entries')
      .select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .eq('entry_date', saleDate)
      .order('created_at', { ascending: true })

    if (pcErr) { setError(pcErr.message); setLoading(false); return }
    setPettyEntries(petty || [])

    setLoading(false)
  }

  function bucketPlatforms(bucket) {
    return platforms.filter(p => p.bucket === bucket)
  }
  function bucketTotal(bucket) {
    return bucketPlatforms(bucket).reduce((sum, p) => sum + num(platformSales[p.name]), 0)
  }
  const onlineTotal = bucketTotal('online_platform')
  const cateringTotal = bucketTotal('catering')
  const pettyTotal = pettyEntries.reduce((s, e) => s + Number(e.amount || 0), 0)

  const salesVariance =
    num(cashSales) + num(cardSales) + num(kioskSales) + onlineTotal + cateringTotal - num(grossSales)

  const cashVariance =
    num(endFloat) - (num(startFloat) + num(cashSales) - pettyTotal - num(cashBanked))

  const salesVarianceWarn = Math.abs(salesVariance) > VARIANCE_WARN_THRESHOLD
  const cashVarianceWarn = Math.abs(cashVariance) > VARIANCE_WARN_THRESHOLD

  function setPlatformAmount(name, value) {
    setPlatformSales(prev => ({ ...prev, [name]: value }))
  }

  function shiftDate(days) {
    const d = new Date(saleDate)
    d.setDate(d.getDate() + days)
    setSaleDate(d.toISOString().split('T')[0])
  }

  async function addPetty(e) {
    e.preventDefault()
    setError('')
    const amount = parseFloat(pcAmount)
    if (isNaN(amount) || amount < 0) { setError('Petty cash amount must be a positive number'); return }
    const reason = pcReason.trim()
    if (!reason) { setError('Petty cash reason is required'); return }

    const { error: e1 } = await supabase
      .from('petty_cash_entries')
      .insert({
        restaurant_id: activeRestaurant.id,
        entry_date: saleDate,
        amount,
        reason,
        category: pcCategory,
        created_by: user.id,
      })
    if (e1) { setError(e1.message); return }
    setPcReason(''); setPcAmount(''); setPcCategory('Expense')
    const { data } = await supabase
      .from('petty_cash_entries')
      .select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .eq('entry_date', saleDate)
      .order('created_at', { ascending: true })
    setPettyEntries(data || [])
  }

  async function deletePetty(id) {
    const { error: e1 } = await supabase.from('petty_cash_entries').delete().eq('id', id)
    if (e1) { setError(e1.message); return }
    setPettyEntries(prev => prev.filter(e => e.id !== id))
  }

  async function handleSave() {
    setError(''); setSuccess('')

    if (recordId) {
      const ok = window.confirm(`A sales record already exists for ${saleDate}. Overwrite it?`)
      if (!ok) return
    }

    setSaving(true)

    const ps = {}
    for (const p of platforms) {
      const v = num(platformSales[p.name])
      if (v !== 0) ps[p.name] = v
    }

    const payload = isClosed
      ? {
          restaurant_id: activeRestaurant.id,
          sale_date: saleDate,
          is_closed: true,
          gross_sales: 0, net_sales: 0, cash_sales: 0, card_sales: 0, kiosk_sales: 0,
          online_sales: 0, catering_sales: 0, platform_sales: {},
          start_float: num(startFloat), end_float: num(endFloat), cash_banked: 0,
          staff_food: 0, instore_variance: 0,
          upload_method: 'manual',
          created_by: user.id,
        }
      : {
          restaurant_id: activeRestaurant.id,
          sale_date: saleDate,
          is_closed: false,
          gross_sales: num(grossSales),
          net_sales: num(netSales),
          cash_sales: num(cashSales),
          card_sales: num(cardSales),
          kiosk_sales: num(kioskSales),
          online_sales: onlineTotal,
          catering_sales: cateringTotal,
          platform_sales: ps,
          start_float: num(startFloat),
          end_float: num(endFloat),
          cash_banked: num(cashBanked),
          staff_food: num(staffFood),
          instore_variance: salesVariance,
          upload_method: 'manual',
          created_by: user.id,
        }

    let resErr
    if (recordId) {
      const { error: e1 } = await supabase.from('sales_records').update(payload).eq('id', recordId)
      resErr = e1
    } else {
      const { error: e1 } = await supabase.from('sales_records').insert(payload)
      resErr = e1
    }

    setSaving(false)
    if (resErr) { setError(resErr.message); return }
    setSuccess(isClosed ? `${saleDate} marked as closed.` : `Sales for ${saleDate} saved.`)
    loadDay()
  }

  const fieldCls =
    'w-full border border-border rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-accent bg-white'
  const labelCls = 'text-xs text-gray-500 mb-1 block'

  if (loading) {
    return <div className="max-w-2xl"><p className="text-sm text-gray-400">Loading...</p></div>
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Daily sales</h2>
        <p className="text-sm text-gray-500 mt-1">{activeRestaurant?.name} · one record per day</p>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{success}</div>}

      {/* Date */}
      <div className="bg-white rounded-xl border border-border p-4 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => shiftDate(-1)} className="px-2 py-1.5 border border-border rounded-lg text-gray-600 hover:bg-gray-50" aria-label="Previous day">‹</button>
            <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            <button type="button" onClick={() => shiftDate(1)} className="px-2 py-1.5 border border-border rounded-lg text-gray-600 hover:bg-gray-50" aria-label="Next day">›</button>
            <button type="button" onClick={() => setSaleDate(todayISO())} className="ml-1 px-3 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium">Today</button>
          </div>
          {recordId && <span className="text-xs text-amber-600 font-medium">Existing record</span>}
        </div>
      </div>

      {/* Store closed toggle */}
      <div className="bg-white rounded-xl border border-border p-4 mb-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isClosed}
            onChange={e => setIsClosed(e.target.checked)}
            className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
          />
          <div>
            <span className="text-sm font-medium text-gray-900">Store was closed this day</span>
            <p className="text-xs text-gray-500 mt-0.5">
              Marks the day as not trading. Closed days are excluded from daily averages.
            </p>
          </div>
        </label>
      </div>

      {!isClosed && (
        <>
          {/* Sales figures */}
          <div className="bg-white rounded-xl border border-border p-5 mb-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Sales figures</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Gross sales</label><input type="number" step="0.01" inputMode="decimal" value={grossSales} onChange={e => setGrossSales(e.target.value)} className={fieldCls} placeholder="0.00" /></div>
              <div><label className={labelCls}>Net sales</label><input type="number" step="0.01" inputMode="decimal" value={netSales} onChange={e => setNetSales(e.target.value)} className={fieldCls} placeholder="0.00" /></div>
            </div>
          </div>

          {/* Payment methods */}
          <div className="bg-white rounded-xl border border-border p-5 mb-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment methods</h3>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={labelCls}>Cash</label><input type="number" step="0.01" inputMode="decimal" value={cashSales} onChange={e => setCashSales(e.target.value)} className={fieldCls} placeholder="0.00" /></div>
              <div><label className={labelCls}>Card</label><input type="number" step="0.01" inputMode="decimal" value={cardSales} onChange={e => setCardSales(e.target.value)} className={fieldCls} placeholder="0.00" /></div>
              <div><label className={labelCls}>Kiosk</label><input type="number" step="0.01" inputMode="decimal" value={kioskSales} onChange={e => setKioskSales(e.target.value)} className={fieldCls} placeholder="0.00" /></div>
            </div>
          </div>

          <PlatformBucket
            title="Online Platform"
            total={onlineTotal}
            platforms={bucketPlatforms('online_platform')}
            platformSales={platformSales}
            setPlatformAmount={setPlatformAmount}
            fieldCls={fieldCls}
            labelCls={labelCls}
          />

          <PlatformBucket
            title="Catering"
            total={cateringTotal}
            platforms={bucketPlatforms('catering')}
            platformSales={platformSales}
            setPlatformAmount={setPlatformAmount}
            fieldCls={fieldCls}
            labelCls={labelCls}
          />

          {/* Cash drawer + petty cash */}
          <div className="bg-white rounded-xl border border-border p-5 mb-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Cash drawer</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div><label className={labelCls}>Start float</label><input type="number" step="0.01" inputMode="decimal" value={startFloat} onChange={e => setStartFloat(e.target.value)} className={fieldCls} /></div>
              <div><label className={labelCls}>End float</label><input type="number" step="0.01" inputMode="decimal" value={endFloat} onChange={e => setEndFloat(e.target.value)} className={fieldCls} /></div>
              <div><label className={labelCls}>Cash banked</label><input type="number" step="0.01" inputMode="decimal" value={cashBanked} onChange={e => setCashBanked(e.target.value)} className={fieldCls} placeholder="0.00" /></div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">Petty cash (cash out)</span>
                <span className="text-xs text-gray-500">total: <span className="font-semibold text-gray-900">{fmtMoney(pettyTotal)}</span></span>
              </div>

              {pettyEntries.length > 0 && (
                <div className="mb-2 divide-y divide-border">
                  {pettyEntries.map(e => (
                    <div key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className="w-20 text-gray-500 text-xs">{e.category || 'Other'}</span>
                      <span className="flex-1 text-gray-700">{e.reason}</span>
                      <span className="text-gray-900">{fmtMoney(e.amount)}</span>
                      <button onClick={() => deletePetty(e.id)} className="text-gray-400 hover:text-red-600 text-base leading-none px-1" aria-label="Delete entry">×</button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={addPetty} className="flex gap-2 items-center">
                <select value={pcCategory} onChange={e => setPcCategory(e.target.value)} className="w-24 border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent bg-white">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="text" value={pcReason} onChange={e => setPcReason(e.target.value)} placeholder="Reason" className="flex-1 border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent bg-white" />
                <input type="number" step="0.01" min="0" inputMode="decimal" value={pcAmount} onChange={e => setPcAmount(e.target.value)} placeholder="Amount" className="w-20 border border-border rounded-md px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-accent bg-white" />
                <button type="submit" className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-md hover:bg-orange-600 transition-colors">Add</button>
              </form>
            </div>
          </div>

          {/* Staff food */}
          <div className="bg-white rounded-xl border border-border p-5 mb-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Staff food</label><input type="number" step="0.01" inputMode="decimal" value={staffFood} onChange={e => setStaffFood(e.target.value)} className={fieldCls} placeholder="0.00" /></div>
            </div>
          </div>

          {/* Variances */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={`rounded-xl p-4 ${salesVarianceWarn ? 'bg-red-50' : 'bg-green-50'}`}>
              <div className={`text-xs mb-1 ${salesVarianceWarn ? 'text-red-600' : 'text-green-700'}`}>Sales reconciliation</div>
              <div className={`text-xl font-semibold ${salesVarianceWarn ? 'text-red-700' : 'text-green-700'}`}>{fmtMoney(salesVariance)}</div>
              <div className={`text-xs mt-1 ${salesVarianceWarn ? 'text-red-600' : 'text-green-700'}`}>
                {salesVarianceWarn ? `Over €${VARIANCE_WARN_THRESHOLD} — check figures` : 'tenders − gross'}
              </div>
            </div>
            <div className={`rounded-xl p-4 ${cashVarianceWarn ? 'bg-red-50' : 'bg-amber-50'}`}>
              <div className={`text-xs mb-1 ${cashVarianceWarn ? 'text-red-600' : 'text-amber-700'}`}>Cash drawer variance</div>
              <div className={`text-xl font-semibold ${cashVarianceWarn ? 'text-red-700' : 'text-amber-700'}`}>{fmtMoney(cashVariance)}</div>
              <div className={`text-xs mt-1 ${cashVarianceWarn ? 'text-red-600' : 'text-amber-700'}`}>
                {cashVarianceWarn ? `Over €${VARIANCE_WARN_THRESHOLD} — count again` : 'end − (start + cash − petty − banked)'}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
          {saving
            ? 'Saving...'
            : isClosed
              ? (recordId ? 'Update as closed' : 'Mark day closed')
              : (recordId ? 'Update day' : 'Save day')}
        </button>
      </div>
    </div>
  )
}

function PlatformBucket({ title, total, platforms, platformSales, setPlatformAmount, fieldCls, labelCls }) {
  return (
    <div className="bg-white rounded-xl border border-border p-5 mb-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-accent">{title}</h3>
        <span className="text-sm text-gray-500">bucket total: <span className="font-semibold text-gray-900">{fmtMoney(total)}</span></span>
      </div>
      {platforms.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No active platforms in this bucket. Add them in Restaurant settings.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {platforms.map(p => (
            <div key={p.id}>
              <label className={labelCls}>{p.name}</label>
              <input
                type="number" step="0.01" inputMode="decimal"
                value={platformSales[p.name] ?? ''}
                onChange={e => setPlatformAmount(p.name, e.target.value)}
                className={fieldCls}
                placeholder="0.00"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
