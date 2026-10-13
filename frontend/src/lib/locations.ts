import { apiRequest } from "@/lib/api";

export type LocationType = "STORE" | "CENTRAL_WAREHOUSE";
export type RecordStatus = "all" | "active" | "inactive";

export type Location = {
  id: string;
  code: string;
  name: string;
  locationType: LocationType;
  address: string | null;
  district: string | null;
  city: string | null;
  isActive: boolean | null;
  createdAt: string;
  updatedAt: string;
};

export type LocationValues = Pick<Location, "code" | "name" | "locationType" | "address" | "district" | "city"> & {
  isActive: boolean;
};

export type LocationQuery = { search: string; type: LocationType | ""; status: RecordStatus; page: number; pageSize: number };
export type LocationPage = { items: Location[]; total: number; page: number; pageSize: number };

export function fetchLocations(query: LocationQuery, signal?: AbortSignal): Promise<LocationPage> {
  const params = new URLSearchParams({
    status: query.status,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.search) params.set("search", query.search);
  if (query.type) params.set("type", query.type);
  return apiRequest(`/locations?${params}`, { signal });
}

export function fetchLocation(id: string): Promise<Location> {
  return apiRequest(`/locations/${encodeURIComponent(id)}`);
}

export function saveLocation(values: LocationValues | Partial<LocationValues>, id?: string): Promise<Location> {
  return apiRequest(id ? `/locations/${encodeURIComponent(id)}` : "/locations", {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}
