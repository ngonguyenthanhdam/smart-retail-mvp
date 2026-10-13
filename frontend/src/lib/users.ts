import { apiRequest } from '@/lib/api';
import type { UserRole } from '@/lib/auth';
import { fetchLocations, type Location, type RecordStatus } from '@/lib/locations';

export type ManagedUser = {
  id: string; username: string; email: string; fullName: string; role: UserRole;
  locationId: string | null; isActive: boolean | null; createdAt: string; updatedAt: string;
  location: Pick<Location, 'id' | 'code' | 'name' | 'locationType' | 'isActive'> | null;
};
export type UserValues = {
  fullName: string; email: string; role: UserRole; locationId: string | null; isActive: boolean;
  username?: string; password?: string;
};
export type UserQuery = { search: string; role: UserRole | ''; status: RecordStatus; page: number; pageSize: number };
export type UserPage = { items: ManagedUser[]; total: number; page: number; pageSize: number };

export function fetchUsers(query: UserQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({ status: query.status, page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set('search', query.search);
  if (query.role) params.set('role', query.role);
  return apiRequest<UserPage>(`/users?${params}`, { signal });
}
export const fetchUser = (id: string) => apiRequest<ManagedUser>(`/users/${id}`);
export function saveUser(values: Partial<UserValues>, id?: string) {
  return apiRequest<ManagedUser>(id ? `/users/${id}` : '/users', {
    method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
  });
}
export async function fetchStoreOptions(signal: AbortSignal): Promise<Location[]> {
  const stores: Location[] = [];
  for (let page = 1; ; page++) {
    const result = await fetchLocations({ search: '', type: 'STORE', status: 'active', page, pageSize: 100 }, signal);
    stores.push(...result.items);
    if (page * result.pageSize >= result.total || !result.items.length) return stores;
  }
}
