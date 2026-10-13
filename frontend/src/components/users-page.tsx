"use client";

import { LoaderCircle, Plus, Users } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminDialog } from '@/components/admin-dialog';
import { useAuth } from '@/components/auth-provider';
import { vi } from '@/i18n/vi';
import { ApiRequestError } from '@/lib/api';
import type { UserRole } from '@/lib/auth';
import type { Location, RecordStatus } from '@/lib/locations';
import { fetchStoreOptions, fetchUser, fetchUsers, saveUser, type ManagedUser, type UserPage, type UserQuery, type UserValues } from '@/lib/users';

const copy = vi.users;
const common = vi.admin;
const roles: UserRole[] = ['ADMIN', 'STORE_MANAGER', 'STAFF'];
type FailureMessage = (error: unknown) => string;
type DialogState = { kind: 'create' } | { kind: 'edit' | 'deactivate'; user: ManagedUser };

function UserForm({ user, ownId, onClose, onSaved, failureMessage }: {
  user?: ManagedUser; ownId: string; onClose: () => void;
  onSaved: (message: string) => void; failureMessage: FailureMessage;
}) {
  const [role, setRole] = useState<UserRole>(user?.role ?? 'STAFF');
  const [storeId, setStoreId] = useState(user?.locationId ?? '');
  const [stores, setStores] = useState<Location[] | null>(null);
  const [storeError, setStoreError] = useState('');
  const [storeRevision, setStoreRevision] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<UserValues | null>(null);
  const isSelf = user?.id === ownId;

  useEffect(() => {
    const controller = new AbortController();
    void fetchStoreOptions(controller.signal).then((items) => {
      if (!controller.signal.aborted) setStores(items);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setStoreError(failureMessage(error));
    });
    return () => controller.abort();
  }, [storeRevision, failureMessage]);

  async function save(values: UserValues) {
    setBusy(true); setError('');
    try {
      await saveUser(values, user?.id);
      onSaved(user ? copy.updated : copy.created);
    } catch (error: unknown) { setError(failureMessage(error)); setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    const values: UserValues = {
      fullName: value('fullName'), email: value('email'), role,
      locationId: role === 'ADMIN' ? null : storeId || null,
      isActive: isSelf || value('isActive') === 'true',
    };
    if (role !== 'ADMIN' && !storeId) { setError(copy.storeRequired); return; }
    if (!user) {
      values.username = value('username');
      values.password = String(form.get('password') ?? '');
      if ([...values.password].length < 8 || new TextEncoder().encode(values.password).length > 72) {
        setError(copy.passwordInvalid); return;
      }
    }
    setError('');
    if (user?.isActive && !values.isActive) setPending(values);
    else void save(values);
  }

  const existingUnavailable = user?.location && stores && !stores.some((store) => store.id === user.locationId);
  return (
    <AdminDialog titleId="user-dialog-title" busy={busy} onClose={onClose}>
      <h2 id="user-dialog-title">{pending ? copy.deactivateTitle : user ? copy.edit : copy.create}</h2>
      <form className="admin-form" onSubmit={submit}>
        <fieldset className="admin-fieldset" disabled={busy} hidden={pending !== null}>
          <div className="admin-form-grid">
            <div className="form-field admin-span-full">
              <label htmlFor="user-name">{copy.fullName}</label>
              <input id="user-name" name="fullName" required maxLength={150} defaultValue={user?.fullName ?? ''} autoFocus />
            </div>
            <div className="form-field">
              <label htmlFor="user-username">{copy.username}</label>
              <input id="user-username" name="username" required maxLength={100} defaultValue={user?.username ?? ''} disabled={!!user} autoComplete="off" aria-describedby="username-hint" />
            </div>
            <div className="form-field">
              <label htmlFor="user-email">{copy.email}</label>
              <input id="user-email" name="email" type="email" required maxLength={255} defaultValue={user?.email ?? ''} autoComplete="off" />
            </div>
            <div className="form-field">
              <label htmlFor="user-role">{copy.role}</label>
              <select id="user-role" value={role} disabled={isSelf} onChange={(event) => { setRole(event.target.value as UserRole); setStoreId(''); }}>
                {roles.map((value) => <option key={value} value={value}>{copy.roles[value]}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="user-store">{copy.store}</label>
              <select id="user-store" required={role !== 'ADMIN'} disabled={role === 'ADMIN' || stores === null} value={role === 'ADMIN' ? '' : storeId} onChange={(event) => setStoreId(event.target.value)} aria-describedby="user-store-hint">
                <option value="">{role === 'ADMIN' ? copy.noStore : stores === null ? copy.loadingStores : copy.selectStore}</option>
                {stores?.map((store) => <option key={store.id} value={store.id}>{store.code} — {store.name}</option>)}
                {existingUnavailable && <option value={user.locationId ?? ''} disabled>{user.location?.name}{copy.unavailableStore}</option>}
              </select>
            </div>
            {!user && <div className="form-field admin-span-full">
              <label htmlFor="user-password">{copy.password}</label>
              <input id="user-password" name="password" type="password" required autoComplete="new-password" aria-describedby="user-password-hint" />
              <p className="field-hint" id="user-password-hint">{copy.passwordHint}</p>
            </div>}
            <div className="form-field">
              <label htmlFor="user-status">{common.status}</label>
              <select id="user-status" name="isActive" defaultValue={user ? String(Boolean(user.isActive)) : 'true'} disabled={isSelf}>
                <option value="true">{common.active}</option><option value="false">{common.inactive}</option>
              </select>
            </div>
          </div>
          <p className="field-hint" id="username-hint">{copy.usernameHint}</p>
          <p className="field-hint" id="user-store-hint">{isSelf ? copy.ownHint : copy.storeHint}</p>
          {role !== 'ADMIN' && stores?.length === 0 && <p className="field-hint">{copy.noStores}</p>}
          {storeError && <div className="form-error" role="alert">{storeError}<button className="text-button" type="button" onClick={() => { setStoreError(''); setStores(null); setStoreRevision((n) => n + 1); }}>{common.retry}</button></div>}
        </fieldset>
        {pending && <p className="admin-dialog-description">{copy.deactivateDescription(user?.fullName ?? pending.fullName)}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="admin-form-actions">
          {pending ? <>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => { setPending(null); setError(''); }}>{common.back}</button>
            <button className="danger-button" type="button" disabled={busy} onClick={() => { void save(pending); }}>{busy ? common.saving : common.deactivate}</button>
          </> : <>
            <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>{common.cancel}</button>
            <button className="primary-button" type="submit" disabled={busy || (role !== 'ADMIN' && stores === null)}>{busy ? common.saving : user ? common.save : copy.create}</button>
          </>}
        </div>
      </form>
    </AdminDialog>
  );
}

function DeactivateUser({ user, onClose, onSaved, failureMessage }: {
  user: ManagedUser; onClose: () => void; onSaved: (message: string) => void; failureMessage: FailureMessage;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function deactivate() {
    setBusy(true); setError('');
    try { await saveUser({ isActive: false }, user.id); onSaved(copy.deactivated); }
    catch (error: unknown) { setError(failureMessage(error)); setBusy(false); }
  }
  return <AdminDialog titleId="user-deactivate-title" busy={busy} onClose={onClose}>
    <h2 id="user-deactivate-title">{copy.deactivateTitle}</h2>
    <p className="admin-dialog-description">{copy.deactivateDescription(user.fullName)}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-form-actions">
      <button className="secondary-button" type="button" disabled={busy} onClick={onClose} autoFocus>{common.cancel}</button>
      <button className="danger-button" type="button" disabled={busy} onClick={() => { void deactivate(); }}>{busy ? common.saving : common.deactivate}</button>
    </div>
  </AdminDialog>;
}

export function UsersPage() {
  const { user: currentUser, retry, refresh: refreshAccount } = useAuth();
  const [query, setQuery] = useState<UserQuery>({ search: '', role: '', status: 'all', page: 1, pageSize: 20 });
  const [data, setData] = useState<UserPage | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const failureMessage = useCallback((error: unknown) => {
    if (error instanceof ApiRequestError) {
      if (error.status === 401 || error.status === 403) { retry(); return common.sessionExpired; }
      return error.message || common.requestFailed;
    }
    return common.requestFailed;
  }, [retry]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchUsers(query, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      const lastPage = Math.max(1, Math.ceil(result.total / query.pageSize));
      if (query.page > lastPage) setQuery({ ...query, page: lastPage });
      else setData(result);
    }).catch((error: unknown) => { if (!controller.signal.aborted) setError(failureMessage(error)); });
    return () => controller.abort();
  }, [query, revision, failureMessage]);

  function refresh() { setError(''); setData(null); setRevision((n) => n + 1); }
  function changeQuery(next: UserQuery) { setError(''); setData(null); setQuery(next); }
  function saved(message: string) {
    if (dialog?.kind === 'edit' && dialog.user.id === currentUser?.id) refreshAccount();
    setDialog(null); setSuccess(message); refresh();
  }
  async function edit(user: ManagedUser) {
    setBusyId(user.id); setError(''); setSuccess('');
    try { setDialog({ kind: 'edit', user: await fetchUser(user.id) }); }
    catch (error: unknown) { setError(failureMessage(error)); }
    finally { setBusyId(null); }
  }
  async function activate(user: ManagedUser) {
    setBusyId(user.id); setError(''); setSuccess('');
    try { await saveUser({ isActive: true }, user.id); saved(copy.activated); }
    catch (error: unknown) { setError(failureMessage(error)); }
    finally { setBusyId(null); }
  }
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    changeQuery({ search: String(form.get('search') ?? '').trim(), role: String(form.get('role') ?? '') as UserRole | '', status: String(form.get('status') ?? 'all') as RecordStatus, page: 1, pageSize: query.pageSize });
  }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / query.pageSize));
  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">{vi.shell.groups.operations}</p><h1>{copy.title}</h1><p className="page-description">{copy.description}</p></div>
      <button className="primary-button" type="button" disabled={busyId !== null} onClick={() => { setSuccess(''); setDialog({ kind: 'create' }); }}><Plus size={17} aria-hidden="true" />{copy.add}</button>
    </div>
    {success && <p className="form-success admin-notice" role="status">{success}</p>}
    {error && <div className="form-error admin-notice" role="alert"><p>{error}</p><button className="text-button" type="button" onClick={refresh}>{common.retry}</button></div>}
    <section className="admin-card" aria-label={copy.listLabel}>
      <form className="admin-filters" onSubmit={applyFilters}>
        <div className="form-field admin-search"><label htmlFor="users-search">{common.search}</label><input id="users-search" name="search" type="search" maxLength={150} placeholder={copy.searchPlaceholder} /></div>
        <div className="form-field"><label htmlFor="users-role">{copy.role}</label><select id="users-role" name="role" defaultValue=""><option value="">{copy.allRoles}</option>{roles.map((role) => <option key={role} value={role}>{copy.roles[role]}</option>)}</select></div>
        <div className="form-field"><label htmlFor="users-status">{common.status}</label><select id="users-status" name="status" defaultValue="all"><option value="all">{common.allStatuses}</option><option value="active">{common.active}</option><option value="inactive">{common.inactive}</option></select></div>
        <button className="secondary-button" type="submit">{common.applyFilters}</button>
      </form>
      {!data && !error && <div className="admin-loading" role="status"><LoaderCircle size={22} className="loading-icon" aria-hidden="true" />{copy.loading}</div>}
      {data?.items.length === 0 && <div className="empty-state"><Users size={32} aria-hidden="true" /><h2>{copy.emptyTitle}</h2><p>{copy.emptyDescription}</p></div>}
      {!!data?.items.length && <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={copy.listLabel}>
        <table className="admin-table"><thead><tr><th scope="col">{copy.fullName}</th><th scope="col">{copy.username}</th><th scope="col">{copy.email}</th><th scope="col">{copy.role}</th><th scope="col">{copy.store}</th><th scope="col">{common.status}</th><th scope="col">{common.actions}</th></tr></thead>
          <tbody>{data.items.map((user) => <tr key={user.id}>
            <th scope="row">{user.fullName}</th><td>{user.username}</td><td>{user.email}</td><td>{copy.roles[user.role]}</td><td>{user.location?.name ?? copy.noStore}</td>
            <td><span className={`record-status ${user.isActive ? 'is-active' : 'is-inactive'}`}>{user.isActive ? common.active : common.inactive}</span></td>
            <td><div className="admin-row-actions">
              <button className="text-button" type="button" disabled={busyId !== null} aria-label={common.editRecord(user.fullName)} onClick={() => { void edit(user); }}>{common.edit}</button>
              <button className={`text-button${user.isActive ? ' text-danger' : ''}`} type="button" disabled={busyId !== null || user.id === currentUser?.id} title={user.id === currentUser?.id ? copy.ownHint : undefined} aria-label={user.isActive ? common.deactivateRecord(user.fullName) : common.activateRecord(user.fullName)} onClick={() => {
                if (user.isActive) { setSuccess(''); setDialog({ kind: 'deactivate', user }); } else void activate(user);
              }}>{busyId === user.id ? common.saving : user.isActive ? common.deactivate : common.activate}</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {data && <div className="admin-pagination"><p>{common.pagination(data.page, pages, data.total)}</p><div>
        <button className="secondary-button" type="button" disabled={query.page <= 1} onClick={() => changeQuery({ ...query, page: query.page - 1 })}>{common.previous}</button>
        <button className="secondary-button" type="button" disabled={query.page >= pages} onClick={() => changeQuery({ ...query, page: query.page + 1 })}>{common.next}</button>
      </div></div>}
    </section>
    {dialog?.kind === 'deactivate' ? <DeactivateUser user={dialog.user} onClose={() => setDialog(null)} onSaved={saved} failureMessage={failureMessage} />
      : dialog && <UserForm user={dialog.kind === 'edit' ? dialog.user : undefined} ownId={currentUser?.id ?? ''} onClose={() => setDialog(null)} onSaved={saved} failureMessage={failureMessage} />}
  </div>;
}
