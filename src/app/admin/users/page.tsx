"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import "@/styles/pages/admin-users.css";
import { ADMIN_LINKS, DashboardHeader } from "@/components/dashboard-header";
import { Icon } from "@/components/icon";
import { api, errorMessage } from "@/lib/client/api";
import { useProfile, useRoleGuard } from "@/lib/client/hooks";
import type { Page, Role, UserRow } from "@/lib/client/types";

const ROLE_FILTERS: { label: string; role: Role | "" }[] = [
  { label: "All", role: "" },
  { label: "Admins", role: "Admin" },
  { label: "MatAdmins", role: "MatAdmin" },
  { label: "Passengers", role: "Passenger" },
];

const emptyForm = { name: "", email: "", password: "", role: "MatAdmin" as "MatAdmin" | "Admin" };

export default function ManageUsersPage() {
  const ready = useRoleGuard("Admin");
  const profile = useProfile(ready);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const fetchUsers = useCallback(() => {
    const params = new URLSearchParams({ q: debounced, limit: "100" });
    if (role) params.set("role", role);
    return api<Page<"users", UserRow>>(`/api/admin/users?${params}`);
  }, [debounced, role]);

  const apply = (res: Page<"users", UserRow>) => {
    setUsers(res.users);
    setTotal(res.total);
    setError(false);
  };

  const load = async () => {
    try {
      apply(await fetchUsers());
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    if (!ready) return;
    fetchUsers()
      .then(apply)
      .catch(() => setError(true));
  }, [ready, fetchUsers]);

  async function toggleBlock(user: UserRow) {
    const block = !user.disabled;
    if (!confirm(`Are you sure you want to ${block ? "block" : "unblock"} ${user.name}?`)) return;
    try {
      await api(`/api/admin/users/${user.id}`, { method: "PUT", body: { disabled: block } });
      await load();
    } catch (err) {
      alert(`Error updating user: ${errorMessage(err)}`);
    }
  }

  async function remove(user: UserRow) {
    if (!confirm(`Permanently delete ${user.name}? This action cannot be undone.`)) return;
    try {
      await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
      setUsers((list) => list?.filter((u) => u.id !== user.id) ?? null);
      setTotal((t) => t - 1);
    } catch (err) {
      alert(`Error deleting user: ${errorMessage(err)}`);
    }
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/admin/users", { method: "POST", body: form });
      closeModal();
      await load();
    } catch (err) {
      alert(`Error creating user: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const closeModal = () => {
    setModalOpen(false);
    setForm(emptyForm);
    setShowPassword(false);
  };

  return (
    <div className="page-admin-users">
      <title>Manage Users · MatConnect</title>
      <div className="page-wrapper">
        <DashboardHeader links={ADMIN_LINKS} active="/admin/users" profile={profile} fallbackName="Admin" />

        <main className="dashboard-container">
          <div className="panel">
            <div className="card-header">
              <h3>System Users{users ? ` (${total})` : ""}</h3>
              <div className="header-controls">
                <div className="search-bar">
                  <Icon name="search" />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search users"
                  />
                </div>
                <div className="filter-buttons">
                  {ROLE_FILTERS.map((f) => (
                    <button key={f.label} className={role === f.role ? "active" : undefined} onClick={() => setRole(f.role)}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
                  <Icon name="add" /> Add User
                </button>
              </div>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {error ? (
                    <tr>
                      <td colSpan={5} className="error-message">
                        Could not load users.
                      </td>
                    </tr>
                  ) : !users ? (
                    <tr>
                      <td colSpan={5}>Loading users...</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No users found.</td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.name}</td>
                        <td>{user.email}</td>
                        <td>
                          <span className={`badge-role role-${user.role.toLowerCase()}`}>{user.role}</span>
                        </td>
                        <td>
                          <span className={`badge ${user.disabled ? "badge-danger" : "badge-success"}`}>
                            {user.disabled ? "Blocked" : "Active"}
                          </span>
                        </td>
                        <td className="actions-cell">
                          <button className="btn-action btn-block" onClick={() => toggleBlock(user)}>
                            {user.disabled ? "Unblock" : "Block"}
                          </button>
                          <button className="btn-action btn-delete" onClick={() => remove(user)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="add-user-title">
            <header className="modal-header">
              <h3 id="add-user-title">Add New User</h3>
              <button className="icon-button" onClick={closeModal} aria-label="Close">
                <Icon name="close" />
              </button>
            </header>
            <form onSubmit={createUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="user-name-input">Full Name</label>
                  <input id="user-name-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="user-email-input">Email Address</label>
                  <input
                    id="user-email-input"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="user-password-input">Password</label>
                  <div className="password-wrapper">
                    <input
                      id="user-password-input"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                    <button
                      type="button"
                      className="icon-button password-toggle-btn"
                      title={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((s) => !s)}
                    >
                      <Icon name={showPassword ? "visibility_off" : "visibility"} />
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="user-role-select">Role</label>
                  <select
                    id="user-role-select"
                    className="form-select"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}
                  >
                    <option value="MatAdmin">Matatu Admin</option>
                    <option value="Admin">System Admin</option>
                  </select>
                </div>
              </div>
              <footer className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save User"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
