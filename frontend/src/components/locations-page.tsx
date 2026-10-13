"use client";

import { LoaderCircle, Plus, Store } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { AdminDialog } from "@/components/admin-dialog";
import { useAuth } from "@/components/auth-provider";
import { vi } from "@/i18n/vi";
import { ApiRequestError } from "@/lib/api";
import { fetchLocation, fetchLocations, saveLocation, type Location, type LocationPage, type LocationQuery, type LocationType, type LocationValues, type RecordStatus } from "@/lib/locations";

const copy = vi.locations;
const common = vi.admin;
const initialQuery: LocationQuery = { search: "", type: "", status: "all", page: 1, pageSize: 20 };

type DialogState = { kind: "create" } | { kind: "edit" | "deactivate"; location: Location };

function LocationForm({ location, onClose, onSaved, failureMessage }: {
  location?: Location;
  onClose: () => void;
  onSaved: (message: string) => void;
  failureMessage: (error: unknown) => string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<LocationValues | null>(null);

  async function save(values: LocationValues) {
    setBusy(true);
    setError("");
    try {
      await saveLocation(values, location?.id);
      onSaved(location ? copy.updated : copy.created);
    } catch (error: unknown) {
      setError(failureMessage(error));
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const values: LocationValues = {
      code: value("code"),
      name: value("name"),
      locationType: value("locationType") as LocationType,
      address: value("address") || null,
      district: value("district") || null,
      city: value("city") || null,
      isActive: value("isActive") === "true",
    };
    if (!values.code || !values.name) {
      setError(copy.requiredDetails);
      return;
    }
    setError("");
    if (location?.isActive && !values.isActive) setPending(values);
    else void save(values);
  }

  return (
    <AdminDialog titleId="location-dialog-title" busy={busy} onClose={onClose}>
      <h2 id="location-dialog-title">{pending ? copy.deactivateTitle : location ? copy.edit : copy.create}</h2>
      <form onSubmit={submit} className="admin-form">
        <fieldset disabled={busy} hidden={pending !== null} className="admin-fieldset">
          <div className="admin-form-grid">
            <div className="form-field">
              <label htmlFor="location-code">{copy.code}</label>
              <input id="location-code" name="code" required maxLength={30} defaultValue={location?.code ?? ""} autoFocus />
            </div>
            <div className="form-field">
              <label htmlFor="location-type">{copy.type}</label>
              <select id="location-type" name="locationType" defaultValue={location?.locationType ?? "STORE"} aria-describedby="warehouse-hint">
                <option value="STORE">{copy.types.STORE}</option>
                <option value="CENTRAL_WAREHOUSE">{copy.types.CENTRAL_WAREHOUSE}</option>
              </select>
            </div>
            <div className="form-field admin-span-full">
              <label htmlFor="location-name">{copy.name}</label>
              <input id="location-name" name="name" required maxLength={150} defaultValue={location?.name ?? ""} />
            </div>
            <div className="form-field admin-span-full">
              <label htmlFor="location-address">{copy.address} <span>{common.optional}</span></label>
              <textarea id="location-address" name="address" rows={2} maxLength={2000} defaultValue={location?.address ?? ""} />
            </div>
            <div className="form-field">
              <label htmlFor="location-district">{copy.district} <span>{common.optional}</span></label>
              <input id="location-district" name="district" maxLength={100} defaultValue={location?.district ?? ""} />
            </div>
            <div className="form-field">
              <label htmlFor="location-city">{copy.city} <span>{common.optional}</span></label>
              <input id="location-city" name="city" maxLength={100} defaultValue={location?.city ?? ""} />
            </div>
            <div className="form-field">
              <label htmlFor="location-status">{common.status}</label>
              <select id="location-status" name="isActive" defaultValue={location ? String(Boolean(location.isActive)) : "true"}>
                <option value="true">{common.active}</option>
                <option value="false">{common.inactive}</option>
              </select>
            </div>
          </div>
          <p className="field-hint" id="warehouse-hint">{copy.warehouseHint}</p>
        </fieldset>
        {pending && <p className="admin-dialog-description">{copy.deactivateDescription(location?.name ?? pending.name)}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="admin-form-actions">
          {pending ? (
            <>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => { setPending(null); setError(""); }}>{common.back}</button>
              <button type="button" className="danger-button" disabled={busy} onClick={() => { void save(pending); }}>{busy ? common.saving : common.deactivate}</button>
            </>
          ) : (
            <>
              <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{common.cancel}</button>
              <button type="submit" className="primary-button" disabled={busy}>{busy ? common.saving : location ? common.save : copy.create}</button>
            </>
          )}
        </div>
      </form>
    </AdminDialog>
  );
}

function DeactivateLocation({ location, onClose, onSaved, failureMessage }: {
  location: Location;
  onClose: () => void;
  onSaved: (message: string) => void;
  failureMessage: (error: unknown) => string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deactivate() {
    setBusy(true);
    setError("");
    try {
      await saveLocation({ isActive: false }, location.id);
      onSaved(copy.deactivated);
    } catch (error: unknown) {
      setError(failureMessage(error));
      setBusy(false);
    }
  }

  return (
    <AdminDialog titleId="deactivate-dialog-title" busy={busy} onClose={onClose}>
      <h2 id="deactivate-dialog-title">{copy.deactivateTitle}</h2>
      <p className="admin-dialog-description">{copy.deactivateDescription(location.name)}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="admin-form-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={onClose} autoFocus>{common.cancel}</button>
        <button type="button" className="danger-button" disabled={busy} onClick={() => { void deactivate(); }}>{busy ? common.saving : common.deactivate}</button>
      </div>
    </AdminDialog>
  );
}

export function LocationsPage() {
  const { retry } = useAuth();
  const [query, setQuery] = useState<LocationQuery>(initialQuery);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<LocationPage | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const failureMessage = useCallback((error: unknown) => {
    if (error instanceof ApiRequestError) {
      if (error.status === 401 || error.status === 403) {
        retry();
        return common.sessionExpired;
      }
      return error.message || common.requestFailed;
    }
    return common.requestFailed;
  }, [retry]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchLocations(query, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      const lastPage = Math.max(1, Math.ceil(result.total / query.pageSize));
      if (query.page > lastPage) setQuery({ ...query, page: lastPage });
      else setData(result);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setError(failureMessage(error));
    });
    return () => { controller.abort(); };
  }, [query, revision, failureMessage]);

  function refresh() {
    setError("");
    setData(null);
    setRevision((value) => value + 1);
  }

  function changeQuery(next: LocationQuery) {
    setError("");
    setData(null);
    setQuery(next);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    changeQuery({
      search: String(form.get("search") ?? "").trim(),
      type: String(form.get("type") ?? "") as LocationType | "",
      status: String(form.get("status") ?? "all") as RecordStatus,
      page: 1,
      pageSize: query.pageSize,
    });
  }

  function saved(message: string) {
    setDialog(null);
    setSuccess(message);
    refresh();
  }

  async function edit(location: Location) {
    setBusyId(location.id);
    setError("");
    setSuccess("");
    try {
      setDialog({ kind: "edit", location: await fetchLocation(location.id) });
    } catch (error: unknown) {
      setError(failureMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function activate(location: Location) {
    setBusyId(location.id);
    setError("");
    setSuccess("");
    try {
      await saveLocation({ isActive: true }, location.id);
      saved(copy.activated);
    } catch (error: unknown) {
      setError(failureMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / query.pageSize));

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{vi.shell.groups.operations}</p>
          <h1>{copy.title}</h1>
          <p className="page-description">{copy.description}</p>
        </div>
        <button type="button" className="primary-button" disabled={busyId !== null} onClick={() => { setSuccess(""); setDialog({ kind: "create" }); }}><Plus size={17} aria-hidden="true" />{copy.add}</button>
      </div>

      {success && <p className="form-success admin-notice" role="status">{success}</p>}
      {error && <div className="form-error admin-notice" role="alert"><p>{error}</p><button type="button" className="text-button" onClick={refresh}>{common.retry}</button></div>}

      <section className="admin-card" aria-label={copy.listLabel}>
        <form className="admin-filters" onSubmit={applyFilters}>
          <div className="form-field admin-search">
            <label htmlFor="locations-search">{common.search}</label>
            <input type="search" id="locations-search" name="search" placeholder={copy.searchPlaceholder} maxLength={150} />
          </div>
          <div className="form-field">
            <label htmlFor="locations-type">{copy.type}</label>
            <select id="locations-type" name="type" defaultValue="">
              <option value="">{copy.allTypes}</option>
              <option value="STORE">{copy.types.STORE}</option>
              <option value="CENTRAL_WAREHOUSE">{copy.types.CENTRAL_WAREHOUSE}</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="locations-status">{common.status}</label>
            <select id="locations-status" name="status" defaultValue="all">
              <option value="all">{common.allStatuses}</option>
              <option value="active">{common.active}</option>
              <option value="inactive">{common.inactive}</option>
            </select>
          </div>
          <button type="submit" className="secondary-button">{common.applyFilters}</button>
        </form>

        {!data && !error && <div className="admin-loading" role="status"><LoaderCircle size={22} className="loading-icon" aria-hidden="true" />{copy.loading}</div>}
        {data?.items.length === 0 && <div className="empty-state"><Store size={32} aria-hidden="true" /><h2>{copy.emptyTitle}</h2><p>{copy.emptyDescription}</p></div>}
        {data && data.items.length > 0 && (
          <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={copy.listLabel}>
            <table className="admin-table">
              <thead><tr><th scope="col">{copy.code}</th><th scope="col">{copy.name}</th><th scope="col">{copy.type}</th><th scope="col">{copy.city}</th><th scope="col">{common.status}</th><th scope="col">{common.actions}</th></tr></thead>
              <tbody>{data.items.map((location) => (
                <tr key={location.id}>
                  <td className="admin-code">{location.code}</td>
                  <th scope="row">{location.name}<span className="admin-cell-note">{[location.address, location.district].filter(Boolean).join(", ")}</span></th>
                  <td>{copy.types[location.locationType]}</td>
                  <td>{location.city || common.noValue}</td>
                  <td><span className={`record-status ${location.isActive ? "is-active" : "is-inactive"}`}>{location.isActive ? common.active : common.inactive}</span></td>
                  <td><div className="admin-row-actions">
                    <button type="button" className="text-button" disabled={busyId !== null} aria-label={common.editRecord(location.name)} onClick={() => { void edit(location); }}>{common.edit}</button>
                    <button type="button" className={`text-button${location.isActive ? " text-danger" : ""}`} disabled={busyId !== null} aria-label={location.isActive ? common.deactivateRecord(location.name) : common.activateRecord(location.name)} onClick={() => {
                      if (location.isActive) { setSuccess(""); setDialog({ kind: "deactivate", location }); }
                      else void activate(location);
                    }}>{busyId === location.id ? common.saving : location.isActive ? common.deactivate : common.activate}</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {data && <div className="admin-pagination">
          <p>{common.pagination(data.page, pages, data.total)}</p>
          <div><button type="button" className="secondary-button" disabled={query.page <= 1} onClick={() => changeQuery({ ...query, page: query.page - 1 })}>{common.previous}</button><button type="button" className="secondary-button" disabled={query.page >= pages} onClick={() => changeQuery({ ...query, page: query.page + 1 })}>{common.next}</button></div>
        </div>}
      </section>

      {dialog?.kind === "deactivate" ? <DeactivateLocation location={dialog.location} onClose={() => setDialog(null)} onSaved={saved} failureMessage={failureMessage} />
        : dialog && <LocationForm location={dialog.kind === "edit" ? dialog.location : undefined} onClose={() => setDialog(null)} onSaved={saved} failureMessage={failureMessage} />}
    </div>
  );
}
