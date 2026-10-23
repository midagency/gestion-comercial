"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import {
  getCompany,
  updateCompany,
  listBranches,
  createBranch,
  listSettingsWarehouses,
  createSettingsWarehouse,
  listUsers,
  createUser,
  updateUser,
  listRoles,
  createRole,
  listPermissions,
} from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  Plus,
  Building2,
  MapPin,
  Users,
  Package,
  Printer,
  Shield,
  UserPlus,
} from "lucide-react";

type TabId = "company" | "locations" | "users" | "roles";

const PERM_LABELS: Record<string, string> = {
  "sales.view": "Ver ventas",
  "sales.create": "Crear ventas",
  "sales.confirm": "Confirmar ventas",
  "purchases.view": "Ver compras",
  "purchases.create": "Crear compras",
  "inventory.view": "Ver inventario",
  "inventory.move": "Movimientos stock",
  "pos.use": "Usar POS",
  "treasury.view": "Ver caja",
  "treasury.manage": "Gestionar caja",
  "reports.view": "Ver reportes",
  "partners.manage": "Clientes/proveedores",
  "products.manage": "Productos",
  "settings.manage": "Configuración",
  "users.manage": "Usuarios",
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();

  const [tab, setTab] = useState<TabId>("company");

  // Company
  const [companyForm, setCompanyForm] = useState({
    name: "",
    legal_name: "",
    tax_id: "",
    currency_code: "ARS",
    country_code: "AR",
    province: "",
    city: "",
    postal_code: "",
    address: "",
    email: "",
    phone: "",
  });

  // Branch / warehouse modals
  const [showBranch, setShowBranch] = useState(false);
  const [branchForm, setBranchForm] = useState({
    name: "",
    code: "",
    city: "",
    address: "",
    is_main: false,
  });
  const [showWh, setShowWh] = useState(false);
  const [whForm, setWhForm] = useState({
    name: "",
    code: "",
    branch_id: "",
    is_main: false,
  });

  // User modal
  const [showUser, setShowUser] = useState(false);
  const [userForm, setUserForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    role_id: "",
  });

  // Role modal
  const [showRole, setShowRole] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [rolePerms, setRolePerms] = useState<string[]>([]);

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ["company"],
    queryFn: getCompany,
  });

  useEffect(() => {
    if (company) {
      setCompanyForm({
        name: company.name || "",
        legal_name: company.legal_name || "",
        tax_id: company.tax_id || "",
        currency_code: company.currency_code || "ARS",
        country_code: company.country_code || "AR",
        province: company.province || "",
        city: company.city || "",
        postal_code: company.postal_code || "",
        address: company.address || "",
        email: company.email || "",
        phone: company.phone || "",
      });
    }
  }, [company]);

  const { data: branches, isLoading: branchesLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: listBranches,
    enabled: tab === "locations" || tab === "users",
  });

  const { data: warehouses, isLoading: whLoading } = useQuery({
    queryKey: ["settings-warehouses"],
    queryFn: listSettingsWarehouses,
    enabled: tab === "locations",
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
    enabled: tab === "users",
  });

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
    enabled: tab === "users" || tab === "roles",
  });

  const { data: permissions } = useQuery({
    queryKey: ["permissions"],
    queryFn: listPermissions,
    enabled: tab === "roles" || showRole,
  });

  
  const permList: string[] = Array.isArray(permissions)
    ? permissions
    : permissions?.permissions ||
      permissions?.items ||
      Object.keys(PERM_LABELS);

  const saveCompany = useMutation({
    mutationFn: updateCompany,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company"] });
      success("Empresa actualizada");
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al guardar";
      toastError("Error", String(msg));
    },
  });

  const addBranch = useMutation({
    mutationFn: createBranch,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      success("Sucursal creada");
      setShowBranch(false);
      setBranchForm({ name: "", code: "", city: "", address: "", is_main: false });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error";
      toastError("Error", String(msg));
    },
  });

  const addWh = useMutation({
    mutationFn: createSettingsWarehouse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings-warehouses"] });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      success("Almacén creado");
      setShowWh(false);
      setWhForm({ name: "", code: "", branch_id: "", is_main: false });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error";
      toastError("Error", String(msg));
    },
  });

  const addUser = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      success("Usuario creado");
      setShowUser(false);
      setUserForm({
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        role_id: "",
      });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al crear usuario";
      toastError("Error", String(msg));
    },
  });

  const toggleUser = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateUser(id, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      success("Usuario actualizado");
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error";
      toastError("Error", String(msg));
    },
  });

  const addRole = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      success("Rol creado");
      setShowRole(false);
      setRoleName("");
      setRoleDesc("");
      setRolePerms([]);
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error";
      toastError("Error", String(msg));
    },
  });

  const remitoMut = useMutation({
    mutationFn: async ({
      action,
      id,
    }: {
      action: "confirm" | "deliver";
      id: string;
    }) => {
      if (action === "confirm") return(id);
      return(id);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["delivery-notes"] });
      success(
        vars.action === "confirm" ? "Remito confirmado" : "Remito entregado"
      );
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error";
      toastError("Error", String(msg));
    },
  });

  const tabs: { id: TabId; label: string; icon: typeof Building2 }[] = [
    { id: "company", label: "Empresa", icon: Building2 },
    { id: "locations", label: "Sucursales y almacenes", icon: MapPin },
    { id: "users", label: "Usuarios", icon: Users },
    { id: "roles", label: "Roles", icon: Shield },
    ];

  const branchList = Array.isArray(branches) ? branches : branches?.items || [];
  const whList = Array.isArray(warehouses) ? warehouses : warehouses?.items || [];
  const userList = Array.isArray(users) ? users : users?.items || [];
  const roleList = Array.isArray(roles) ? roles : roles?.items || [];

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
          <p className="mt-1 text-sm text-slate-500">
            Empresa, ubicaciones, usuarios y roles
          </p>
        </div>
        {tab === "locations" && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowBranch(true)}>
              <Plus className="h-4 w-4" /> Sucursal
            </Button>
            <Button onClick={() => setShowWh(true)}>
              <Plus className="h-4 w-4" /> Almacén
            </Button>
          </div>
        )}
        {tab === "users" && (
          <Button onClick={() => setShowUser(true)}>
            <UserPlus className="h-4 w-4" /> Nuevo usuario
          </Button>
        )}
        {tab === "roles" && (
          <Button onClick={() => setShowRole(true)}>
            <Plus className="h-4 w-4" /> Nuevo rol
          </Button>
        )}
      </div>

      <div className="mt-6 flex gap-1 rounded-lg bg-slate-100 p-1 w-full overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== EMPRESA ===== */}
      {tab === "company" && (
        <div className="mt-6 max-w-2xl">
          {companyLoading && <PageLoader />}
          {!companyLoading && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">
                Datos de la empresa
              </h2>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!companyForm.name.trim()) {
                    toastError("El nombre es obligatorio");
                    return;
                  }
                  saveCompany.mutate({
                    name: companyForm.name.trim(),
                    legal_name: companyForm.legal_name.trim() || undefined,
                    tax_id: companyForm.tax_id.trim() || undefined,
                    currency_code: companyForm.currency_code,
                    country_code: companyForm.country_code,
                    province: companyForm.province.trim() || undefined,
                    city: companyForm.city.trim() || undefined,
                    postal_code: companyForm.postal_code.trim() || undefined,
                    address: companyForm.address.trim() || undefined,
                    email: companyForm.email.trim() || undefined,
                    phone: companyForm.phone.trim() || undefined,
                  });
                }}
              >
                <Input
                  label="Nombre comercial *"
                  value={companyForm.name}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, name: e.target.value })
                  }
                  className="sm:col-span-2"
                  required
                />
                <Input
                  label="Razón social"
                  value={companyForm.legal_name}
                  onChange={(e) =>
                    setCompanyForm({
                      ...companyForm,
                      legal_name: e.target.value,
                    })
                  }
                  className="sm:col-span-2"
                />
                <Input
                  label="CUIT / Tax ID"
                  value={companyForm.tax_id}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, tax_id: e.target.value })
                  }
                />
                <Select
                  label="Moneda"
                  value={companyForm.currency_code}
                  onChange={(e) =>
                    setCompanyForm({
                      ...companyForm,
                      currency_code: e.target.value,
                    })
                  }
                  options={[
                    { value: "ARS", label: "ARS — Peso argentino" },
                    { value: "USD", label: "USD — Dólar" },
                    { value: "EUR", label: "EUR — Euro" },
                    { value: "UYU", label: "UYU — Peso uruguayo" },
                    { value: "CLP", label: "CLP — Peso chileno" },
                  ]}
                />
                <Select
                  label="País"
                  value={companyForm.country_code}
                  onChange={(e) =>
                    setCompanyForm({
                      ...companyForm,
                      country_code: e.target.value,
                    })
                  }
                  options={[
                    { value: "AR", label: "Argentina" },
                    { value: "UY", label: "Uruguay" },
                    { value: "CL", label: "Chile" },
                    { value: "MX", label: "México" },
                    { value: "ES", label: "España" },
                    { value: "US", label: "Estados Unidos" },
                  ]}
                />
                <Input
                  label="Provincia"
                  value={companyForm.province}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, province: e.target.value })
                  }
                />
                <Input
                  label="Ciudad"
                  value={companyForm.city}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, city: e.target.value })
                  }
                />
                <Input
                  label="Código postal"
                  value={companyForm.postal_code}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, postal_code: e.target.value })
                  }
                />
                <Input
                  label="Teléfono"
                  value={companyForm.phone}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, phone: e.target.value })
                  }
                />
                <Input
                  label="Email"
                  type="email"
                  value={companyForm.email}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, email: e.target.value })
                  }
                  className="sm:col-span-2"
                />
                <Input
                  label="Domicilio fiscal"
                  value={companyForm.address}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, address: e.target.value })
                  }
                  className="sm:col-span-2"
                />
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" loading={saveCompany.isPending}>
                    Guardar cambios
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}

      {/* ===== UBICACIONES ===== */}
      {tab === "locations" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              Sucursales
            </h2>
            {branchesLoading && <PageLoader />}
            {!branchesLoading && branchList.length === 0 && (
              <EmptyState
                icon={MapPin}
                title="Sin sucursales"
                description="Creá al menos una sucursal para organizar la operación."
                actionLabel="Nueva sucursal"
                onAction={() => setShowBranch(true)}
              />
            )}
            <div className="space-y-2">
              {branchList.map((b: Record<string, unknown>) => (
                <div
                  key={String(b.id)}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">
                        {String(b.name)}
                      </span>
                      {b.is_main ? (
                        <Badge variant="brand">Principal</Badge>
                      ) : null}
                      <Badge variant={b.is_active ? "success" : "default"}>
                        {b.is_active ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {[b.code, b.city, b.address].filter(Boolean).join(" · ") ||
                        "Sin datos extra"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">
              Almacenes
            </h2>
            {whLoading && <PageLoader />}
            {!whLoading && whList.length === 0 && (
              <EmptyState
                icon={Package}
                title="Sin almacenes"
                description="Los almacenes se usan en inventario, compras y POS."
                actionLabel="Nuevo almacén"
                onAction={() => setShowWh(true)}
              />
            )}
            <div className="space-y-2">
              {whList.map((w: Record<string, unknown>) => (
                <div
                  key={String(w.id)}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">
                        {String(w.name)}
                      </span>
                      {w.is_main ? (
                        <Badge variant="brand">Principal</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {w.code ? String(w.code) : "Sin código"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== USUARIOS ===== */}
      {tab === "users" && (
        <div className="mt-6">
          {usersLoading && <PageLoader />}
          {!usersLoading && userList.length === 0 && (
            <EmptyState
              icon={Users}
              title="Sin usuarios"
              description="Invitá al equipo creando usuarios con un rol."
              actionLabel="Nuevo usuario"
              onAction={() => setShowUser(true)}
            />
          )}
          {!usersLoading && userList.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Usuario</th>
                      <th className="px-4 py-3 hidden sm:table-cell">Email</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {userList.map((u: Record<string, unknown>) => (
                      <tr key={String(u.id)} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {String(u.full_name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || "—")}
                          </div>
                          {u.is_owner ? (
                            <Badge variant="brand" className="mt-1">
                              Owner
                            </Badge>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                          {String(u.email)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {String(u.role_name || "—")}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={u.is_active ? "success" : "default"}>
                            {u.is_active ? "Activo" : "Inactivo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!u.is_owner && (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={toggleUser.isPending}
                              onClick={() =>
                                toggleUser.mutate({
                                  id: String(u.id),
                                  is_active: !u.is_active,
                                })
                              }
                            >
                              {u.is_active ? "Desactivar" : "Activar"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== ROLES ===== */}
      {tab === "roles" && (
        <div className="mt-6">
          {rolesLoading && <PageLoader />}
          {!rolesLoading && roleList.length === 0 && (
            <EmptyState
              icon={Shield}
              title="Sin roles"
              description="Los roles definen qué puede hacer cada usuario."
              actionLabel="Nuevo rol"
              onAction={() => setShowRole(true)}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roleList.map((r: Record<string, unknown>) => {
              const perms = (r.permissions as string[]) || [];
              return (
                <Card key={String(r.id)} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {String(r.name)}
                      </p>
                      {r.description ? (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {String(r.description)}
                        </p>
                      ) : null}
                    </div>
                    {r.is_system ? (
                      <Badge variant="info">Sistema</Badge>
                    ) : (
                      <Badge variant="default">Custom</Badge>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {perms.length === 0 && (
                      <span className="text-xs text-slate-400">Sin permisos</span>
                    )}
                    {perms.slice(0, 8).map((p) => (
                      <Badge key={p} variant="default">
                        {PERM_LABELS[p] || p}
                      </Badge>
                    ))}
                    {perms.length > 8 && (
                      <Badge variant="default">+{perms.length - 8}</Badge>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== REMITOS ===== */}
      {/* remitos moved to Ventas */}


      {/* Modal sucursal */}
      <Modal
        open={showBranch}
        onClose={() => setShowBranch(false)}
        title="Nueva sucursal"
        size="sm"
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!branchForm.name.trim()) {
              toastError("El nombre es obligatorio");
              return;
            }
            addBranch.mutate({
              name: branchForm.name.trim(),
              code: branchForm.code.trim() || undefined,
              city: branchForm.city.trim() || undefined,
              address: branchForm.address.trim() || undefined,
              is_main: branchForm.is_main,
            });
          }}
        >
          <Input
            label="Nombre *"
            value={branchForm.name}
            onChange={(e) =>
              setBranchForm({ ...branchForm, name: e.target.value })
            }
            required
          />
          <Input
            label="Código"
            value={branchForm.code}
            onChange={(e) =>
              setBranchForm({ ...branchForm, code: e.target.value })
            }
          />
          <Input
            label="Ciudad"
            value={branchForm.city}
            onChange={(e) =>
              setBranchForm({ ...branchForm, city: e.target.value })
            }
          />
          <Input
            label="Dirección"
            value={branchForm.address}
            onChange={(e) =>
              setBranchForm({ ...branchForm, address: e.target.value })
            }
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={branchForm.is_main}
              onChange={(e) =>
                setBranchForm({ ...branchForm, is_main: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Sucursal principal
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowBranch(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={addBranch.isPending}>
              Crear
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal almacén */}
      <Modal
        open={showWh}
        onClose={() => setShowWh(false)}
        title="Nuevo almacén"
        size="sm"
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!whForm.name.trim()) {
              toastError("El nombre es obligatorio");
              return;
            }
            addWh.mutate({
              name: whForm.name.trim(),
              code: whForm.code.trim() || undefined,
              branch_id: whForm.branch_id || undefined,
              is_main: whForm.is_main,
            });
          }}
        >
          <Input
            label="Nombre *"
            value={whForm.name}
            onChange={(e) => setWhForm({ ...whForm, name: e.target.value })}
            required
          />
          <Input
            label="Código"
            value={whForm.code}
            onChange={(e) => setWhForm({ ...whForm, code: e.target.value })}
          />
          {branchList.length > 0 && (
            <Select
              label="Sucursal"
              value={whForm.branch_id}
              onChange={(e) =>
                setWhForm({ ...whForm, branch_id: e.target.value })
              }
              options={[
                { value: "", label: "Sin sucursal" },
                ...branchList.map((b: Record<string, unknown>) => ({
                  value: String(b.id),
                  label: String(b.name),
                })),
              ]}
            />
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={whForm.is_main}
              onChange={(e) =>
                setWhForm({ ...whForm, is_main: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Almacén principal
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowWh(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={addWh.isPending}>
              Crear
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal usuario */}
      <Modal
        open={showUser}
        onClose={() => setShowUser(false)}
        title="Nuevo usuario"
        description="Contraseña mínima 8 caracteres"
        size="md"
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!userForm.email.trim() || userForm.password.length < 8) {
              toastError("Email y contraseña (mín. 8) son obligatorios");
              return;
            }
            addUser.mutate({
              email: userForm.email.trim(),
              password: userForm.password,
              first_name: userForm.first_name.trim() || undefined,
              last_name: userForm.last_name.trim() || undefined,
              role_id: userForm.role_id || undefined,
            });
          }}
        >
          <Input
            label="Email *"
            type="email"
            value={userForm.email}
            onChange={(e) =>
              setUserForm({ ...userForm, email: e.target.value })
            }
            className="sm:col-span-2"
            required
          />
          <Input
            label="Contraseña *"
            type="password"
            value={userForm.password}
            onChange={(e) =>
              setUserForm({ ...userForm, password: e.target.value })
            }
            className="sm:col-span-2"
            required
            minLength={8}
          />
          <Input
            label="Nombre"
            value={userForm.first_name}
            onChange={(e) =>
              setUserForm({ ...userForm, first_name: e.target.value })
            }
          />
          <Input
            label="Apellido"
            value={userForm.last_name}
            onChange={(e) =>
              setUserForm({ ...userForm, last_name: e.target.value })
            }
          />
          <Select
            label="Rol"
            value={userForm.role_id}
            onChange={(e) =>
              setUserForm({ ...userForm, role_id: e.target.value })
            }
            className="sm:col-span-2"
            options={[
              { value: "", label: "Sin rol asignado" },
              ...roleList.map((r: Record<string, unknown>) => ({
                value: String(r.id),
                label: String(r.name),
              })),
            ]}
          />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowUser(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={addUser.isPending}>
              Crear usuario
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal rol */}
      <Modal
        open={showRole}
        onClose={() => setShowRole(false)}
        title="Nuevo rol"
        description="Seleccioná los permisos del rol"
        size="lg"
      >
        <div className="grid gap-4">
          <Input
            label="Nombre *"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
          />
          <Input
            label="Descripción"
            value={roleDesc}
            onChange={(e) => setRoleDesc(e.target.value)}
          />
          <div>
            <p className="label mb-2">Permisos</p>
            <div className="grid gap-2 sm:grid-cols-2 max-h-64 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {permList.map((p) => {
                const key = typeof p === "string" ? p : String((p as { code?: string }).code || p);
                const checked = rolePerms.includes(key);
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setRolePerms((prev) =>
                          checked
                            ? prev.filter((x) => x !== key)
                            : [...prev, key]
                        );
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    {PERM_LABELS[key] || key}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowRole(false)}
            >
              Cancelar
            </Button>
            <Button
              loading={addRole.isPending}
              onClick={() => {
                if (!roleName.trim()) {
                  toastError("El nombre es obligatorio");
                  return;
                }
                addRole.mutate({
                  name: roleName.trim(),
                  description: roleDesc.trim() || undefined,
                  permissions: rolePerms,
                });
              }}
            >
              Crear rol
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
