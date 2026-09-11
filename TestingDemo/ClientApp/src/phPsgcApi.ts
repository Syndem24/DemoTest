export type PsgcPlace = {
  code: string
  name: string
}

const BASE = 'https://psgc.gitlab.io/api'

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`PSGC request failed (${response.status}).`)
  }
  return (await response.json()) as T
}

function mapPlaces(rows: Array<{ code?: string; name?: string }> | null | undefined): PsgcPlace[] {
  return (rows ?? [])
    .map((row) => ({
      code: String(row.code ?? '').trim(),
      name: String(row.name ?? '').trim(),
    }))
    .filter((row) => row.code && row.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

export async function fetchRegions(): Promise<PsgcPlace[]> {
  return mapPlaces(await fetchJson<Array<{ code: string; name: string }>>('/regions.json'))
}

export async function fetchProvinces(regionCode: string): Promise<PsgcPlace[]> {
  if (!regionCode) return []
  return mapPlaces(
    await fetchJson<Array<{ code: string; name: string }>>(`/regions/${regionCode}/provinces.json`)
  )
}

export async function fetchCitiesMunicipalities(options: {
  regionCode: string
  provinceCode: string
  regionHasNoProvinces: boolean
}): Promise<PsgcPlace[]> {
  const { regionCode, provinceCode, regionHasNoProvinces } = options
  if (regionHasNoProvinces) {
    if (!regionCode) return []
    return mapPlaces(
      await fetchJson<Array<{ code: string; name: string }>>(
        `/regions/${regionCode}/cities-municipalities.json`
      )
    )
  }
  if (!provinceCode) return []
  return mapPlaces(
    await fetchJson<Array<{ code: string; name: string }>>(
      `/provinces/${provinceCode}/cities-municipalities.json`
    )
  )
}

export async function fetchBarangays(cityCode: string): Promise<PsgcPlace[]> {
  if (!cityCode) return []
  return mapPlaces(
    await fetchJson<Array<{ code: string; name: string }>>(
      `/cities-municipalities/${cityCode}/barangays.json`
    )
  )
}

export function composePhilippinesAddress(parts: {
  street: string
  barangay: string
  city: string
  province: string
  region: string
}): string {
  const chunks = [
    parts.street.trim(),
    parts.barangay.trim(),
    parts.city.trim(),
    parts.province.trim(),
    parts.region.trim(),
    'Philippines',
  ].filter(Boolean)
  return chunks.join(', ')
}
