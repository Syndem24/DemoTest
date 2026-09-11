import { useEffect, useState } from 'react'
import {
  composePhilippinesAddress,
  fetchBarangays,
  fetchCitiesMunicipalities,
  fetchProvinces,
  fetchRegions,
  type PsgcPlace,
} from '../phPsgcApi'

type Props = {
  formId: string
  address: string
  phoneNumber: string
  addressError?: string
  phoneError?: string
  onAddressChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onAddressBlur?: () => void
  onPhoneBlur?: () => void
  filterPhone: (value: string) => string
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export function PhilippinesAddressFields({
  formId,
  address,
  phoneNumber,
  addressError,
  phoneError,
  onAddressChange,
  onPhoneChange,
  onAddressBlur,
  onPhoneBlur,
  filterPhone,
}: Props) {
  const id = formId
  const [regions, setRegions] = useState<PsgcPlace[]>([])
  const [provinces, setProvinces] = useState<PsgcPlace[]>([])
  const [cities, setCities] = useState<PsgcPlace[]>([])
  const [barangays, setBarangays] = useState<PsgcPlace[]>([])
  const [regionCode, setRegionCode] = useState('')
  const [provinceCode, setProvinceCode] = useState('')
  const [cityCode, setCityCode] = useState('')
  const [barangayCode, setBarangayCode] = useState('')
  const [street, setStreet] = useState('')
  const [noProvince, setNoProvince] = useState(false)
  const [regionsState, setRegionsState] = useState<LoadState>('idle')
  const [cascadeState, setCascadeState] = useState<LoadState>('idle')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    setRegionsState('loading')
    fetchRegions()
      .then((rows) => {
        if (cancelled) return
        setRegions(rows)
        setRegionsState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setRegionsState('error')
        setLoadError(err instanceof Error ? err.message : 'Could not load Philippine locations.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const regionName = regions.find((r) => r.code === regionCode)?.name ?? ''
  const provinceName = noProvince
    ? ''
    : provinces.find((p) => p.code === provinceCode)?.name ?? ''
  const cityName = cities.find((c) => c.code === cityCode)?.name ?? ''
  const barangayName = barangays.find((b) => b.code === barangayCode)?.name ?? ''

  useEffect(() => {
    const composed = composePhilippinesAddress({
      street,
      barangay: barangayName,
      city: cityName,
      province: provinceName,
      region: regionName,
    })
    if (composed !== address) onAddressChange(composed)
    // Intentionally sync composed address when selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [street, barangayName, cityName, provinceName, regionName])

  const onRegionChange = async (code: string) => {
    setRegionCode(code)
    setProvinceCode('')
    setCityCode('')
    setBarangayCode('')
    setProvinces([])
    setCities([])
    setBarangays([])
    setNoProvince(false)
    if (!code) return
    setCascadeState('loading')
    setLoadError('')
    try {
      const nextProvinces = await fetchProvinces(code)
      setProvinces(nextProvinces)
      if (nextProvinces.length === 0) {
        setNoProvince(true)
        const nextCities = await fetchCitiesMunicipalities({
          regionCode: code,
          provinceCode: '',
          regionHasNoProvinces: true,
        })
        setCities(nextCities)
      }
      setCascadeState('ready')
    } catch (err) {
      setCascadeState('error')
      setLoadError(err instanceof Error ? err.message : 'Could not load provinces or cities.')
    }
  }

  const onProvinceChange = async (code: string) => {
    setProvinceCode(code)
    setCityCode('')
    setBarangayCode('')
    setCities([])
    setBarangays([])
    if (!code) return
    setCascadeState('loading')
    setLoadError('')
    try {
      const nextCities = await fetchCitiesMunicipalities({
        regionCode,
        provinceCode: code,
        regionHasNoProvinces: false,
      })
      setCities(nextCities)
      setCascadeState('ready')
    } catch (err) {
      setCascadeState('error')
      setLoadError(err instanceof Error ? err.message : 'Could not load cities.')
    }
  }

  const onCityChange = async (code: string) => {
    setCityCode(code)
    setBarangayCode('')
    setBarangays([])
    if (!code) return
    setCascadeState('loading')
    setLoadError('')
    try {
      setBarangays(await fetchBarangays(code))
      setCascadeState('ready')
    } catch (err) {
      setCascadeState('error')
      setLoadError(err instanceof Error ? err.message : 'Could not load barangays.')
    }
  }

  const busy = regionsState === 'loading' || cascadeState === 'loading'
  const apiFailed = regionsState === 'error'

  return (
    <div className="sc-grid sc-span-2">
      <div className="sc-field">
        <label htmlFor={`${id}-region`}>Region</label>
        <select
          id={`${id}-region`}
          value={regionCode}
          disabled={apiFailed || regionsState !== 'ready'}
          onChange={(event) => void onRegionChange(event.target.value)}
        >
          <option value="">{busy && regionsState === 'loading' ? 'Loading regions…' : 'Select region'}</option>
          {regions.map((row) => (
            <option key={row.code} value={row.code}>
              {row.name}
            </option>
          ))}
        </select>
        <div className="sc-field-meta" />
      </div>

      <div className="sc-field">
        <label htmlFor={`${id}-province`}>Province</label>
        <select
          id={`${id}-province`}
          value={noProvince ? '__NONE__' : provinceCode}
          disabled={!regionCode || noProvince || busy}
          onChange={(event) => void onProvinceChange(event.target.value)}
        >
          {noProvince ? (
            <option value="__NONE__">Not applicable (e.g. NCR)</option>
          ) : (
            <>
              <option value="">{regionCode ? 'Select province' : 'Select region first'}</option>
              {provinces.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </>
          )}
        </select>
        <div className="sc-field-meta" />
      </div>

      <div className="sc-field">
        <label htmlFor={`${id}-city`}>City / Municipality</label>
        <select
          id={`${id}-city`}
          value={cityCode}
          disabled={(!provinceCode && !noProvince) || busy}
          onChange={(event) => void onCityChange(event.target.value)}
        >
          <option value="">
            {regionCode || provinceCode ? 'Select city / municipality' : 'Select province first'}
          </option>
          {cities.map((row) => (
            <option key={row.code} value={row.code}>
              {row.name}
            </option>
          ))}
        </select>
        <div className="sc-field-meta" />
      </div>

      <div className="sc-field">
        <label htmlFor={`${id}-barangay`}>Barangay</label>
        <select
          id={`${id}-barangay`}
          value={barangayCode}
          disabled={!cityCode || busy}
          onChange={(event) => setBarangayCode(event.target.value)}
        >
          <option value="">{cityCode ? 'Select barangay' : 'Select city first'}</option>
          {barangays.map((row) => (
            <option key={row.code} value={row.code}>
              {row.name}
            </option>
          ))}
        </select>
        <div className="sc-field-meta" />
      </div>

      <div className="sc-field sc-span-2">
        <label htmlFor={`${id}-street`}>Street / building</label>
        <input
          id={`${id}-street`}
          type="text"
          value={street}
          placeholder="e.g. Unit 12, MCity Properties Building, A.S. Fortuna St."
          autoComplete="street-address"
          aria-invalid={Boolean(addressError)}
          aria-describedby={addressError ? `${id}-address-error` : undefined}
          onChange={(event) => setStreet(event.target.value)}
          onBlur={onAddressBlur}
        />
        <div className="sc-field-meta">
          {addressError ? (
            <p id={`${id}-address-error`} className="sc-error" role="alert">
              {addressError}
            </p>
          ) : (
            <p className="sc-hint">
              Uses PSA PSGC data via psgc.gitlab.io. Preview: {address || '—'}
            </p>
          )}
        </div>
      </div>

      <div className="sc-field">
        <label htmlFor={`${id}-phone`}>Phone</label>
        <input
          id={`${id}-phone`}
          type="tel"
          value={phoneNumber}
          inputMode="tel"
          autoComplete="tel"
          placeholder="e.g. +63 917 123 4567"
          data-mori-filter="phone"
          aria-invalid={Boolean(phoneError)}
          aria-describedby={phoneError ? `${id}-phone-error` : undefined}
          onChange={(event) => onPhoneChange(filterPhone(event.target.value))}
          onBlur={onPhoneBlur}
        />
        <div className="sc-field-meta">
          {phoneError ? (
            <p id={`${id}-phone-error`} className="sc-error" role="alert">
              {phoneError}
            </p>
          ) : null}
        </div>
      </div>

      {apiFailed || loadError ? (
        <div className="sc-field sc-span-2">
          <label htmlFor={`${id}-manual-address`}>Address (manual fallback)</label>
          <textarea
            id={`${id}-manual-address`}
            value={address}
            rows={3}
            placeholder="Street, barangay, city, province"
            aria-invalid={Boolean(addressError)}
            onChange={(event) => onAddressChange(event.target.value)}
            onBlur={onAddressBlur}
          />
          <div className="sc-field-meta">
            <p className="sc-error" role="alert">
              {loadError || 'Philippine address list unavailable. Enter the full address manually.'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
