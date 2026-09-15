// Company-first discovery: Companies House advanced search by SIC code.
// Returns candidate companies (not jobs) — enrichment then finds careers pages.

export type DiscoveredCompany = {
  name: string;
  companies_house_id: string;
  sic_codes: string[];
  hq_region?: string;
};

const DEFAULT_SICS = [
  "26110", "26120", "26200", "26301", "26309", "26400", "26511", "26512",
  "27110", "27120", "27200", "27310", "27320", "27330", "27400", "27900",
  "71121", "71122", "71129", "72190",
];

export async function discoverCompanies(opts: {
  sicCodes?: string[];
  location?: string;
  maxResults?: number;
}): Promise<DiscoveredCompany[]> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) throw new Error("COMPANIES_HOUSE_API_KEY not set");
  const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");

  const sics = opts.sicCodes ?? DEFAULT_SICS;
  const max = opts.maxResults ?? 200;
  const out: DiscoveredCompany[] = [];
  const seen = new Set<string>();

  for (const sic of sics) {
    if (out.length >= max) break;
    const url = new URL(
      "https://api.company-information.service.gov.uk/advanced-search/companies"
    );
    url.searchParams.set("sic_codes", sic);
    url.searchParams.set("company_status", "active");
    url.searchParams.set("size", "50");
    if (opts.location) url.searchParams.set("location", opts.location);

    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) continue;
    const data = (await res.json()) as {
      items?: {
        company_name: string;
        company_number: string;
        sic_codes?: string[];
        registered_office_address?: { locality?: string; region?: string };
      }[];
    };
    for (const c of data.items ?? []) {
      if (seen.has(c.company_number)) continue;
      seen.add(c.company_number);
      out.push({
        name: c.company_name,
        companies_house_id: c.company_number,
        sic_codes: c.sic_codes ?? [sic],
        hq_region:
          c.registered_office_address?.region ??
          c.registered_office_address?.locality,
      });
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return out;
}
