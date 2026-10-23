"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import {
  listPartners,
  createPartner,
  updatePartner,
  deletePartner,
  listInvoices,
  listPayments,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Search, Pencil, Trash2, Users, Wallet } from "lucide-react";

type PartnerType = "customer" | "supplier" | "both";

interface PartnerForm {
  partner_type: PartnerType;
  name: string;
  legal_name: string;
  email: string;
  phone: string;
  tax_id: string;
  country_code: string;
  province: string;
  city: string;
  address: string;
  postal_code: string;
}

const emptyForm: PartnerForm = {
  partner_type: "customer",
  name: "",
  legal_name: "",
  email: "",
  phone: "",
  tax_id: "",
  country_code: "AR",
  province: "",
  city: "",
  address: "",
  postal_code: "",
};

const typeLabels: Record<string, string> = {
  customer: "Cliente",
  supplier: "Proveedor",
  both: "Ambos",
};

const typeBadge: Record<string, "info" | "warning" | "brand"> = {
  customer: "info",
  supplier: "warning",
  both: "brand",
};

const AR_PROVINCES = [
  "Buenos Aires",
  "CABA",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];

export default function PartnersPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [accountPartner, setAccountPartner] = useState<Record<
    string,
    unknown
  > | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["partners", search, typeFilter],
    queryFn: () =>
      listPartners({
        search: search || undefined,
        partner_type: typeFilter || undefined,
        page_size: 100,
      }),
  });

  const partnerId = accountPartner ? String(accountPartner.id) : "";

  const { data: partnerInvoices, isLoading: invLoading } = useQuery({
    queryKey: ["partner-invoices", partnerId],
    queryFn: () =>
      listInvoices({ partner_id: partnerId, page_size: 100 }),
    enabled: !!partnerId,
  });

  const { data: partnerPayments } = useQuery({
    queryKey: ["partner-payments", partnerId],
    queryFn: () => listPayments({ partner_id: partnerId, page_size: 100 }),
    enabled: !!partnerId,
  });

  const invItems = partnerInvoices?.items || [];
  const payItems = partnerPayments?.items || [];
  const totalInvoiced = invItems.reduce(
    (s: number, i: Record<string, unknown>) => s + Number(i.total || 0),
    0
  );
  const totalPaid = invItems.reduce(
    (s: number, i: Record<string, unknown>) => s + Number(i.amount_paid || 0),
    0
  );
  const totalDue = invItems.reduce(
    (s: number, i: Record<string, unknown>) =>
      s + Number(i.amount_due ?? Number(i.total || 0) - Number(i.amount_paid || 0)),
    0
  );

  const saveMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editingId ? updatePartner(editingId, payload) : createPartner(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners"] });
      success(editingId ? "Partner actualizado" : "Partner creado");
      closeForm();
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: unknown } } })
        ?.response?.data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ")
            : "No se pudo guardar";
      toastError("Error", String(msg));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePartner(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners"] });
      success("Partner eliminado");
      setDeleteId(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "No se pudo eliminar";
      toastError("Error", String(msg));
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(p: Record<string, unknown>) {
    setEditingId(String(p.id));
    setForm({
      partner_type: (p.partner_type as PartnerType) || "customer",
      name: String(p.name || ""),
      legal_name: String(p.legal_name || ""),
      email: String(p.email || ""),
      phone: String(p.phone || ""),
      tax_id: String(p.tax_id || ""),
      country_code: String(p.country_code || "AR"),
      province: String(p.province || ""),
      city: String(p.city || ""),
      address: String(p.address || ""),
      postal_code: String(p.postal_code || ""),
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function submit() {
    if (!form.name.trim()) {
      toastError("El nombre de fantasía es obligatorio");
      return;
    }
    const payload: Record<string, unknown> = {
      partner_type: form.partner_type,
      name: form.name.trim(),
      legal_name: form.legal_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      tax_id: form.tax_id.trim() || null,
      country_code: form.country_code || "AR",
      province: form.province.trim() || null,
      city: form.city.trim() || null,
      address: form.address.trim() || null,
      postal_code: form.postal_code.trim() || null,
    };
    saveMut.mutate(payload);
  }

  const items = data?.items ?? [];

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clientes y proveedores</h1>
          <p className="mt-1 text-sm text-slate-500">{data?.total ?? 0} registros</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nuevo
        </Button>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Buscar por nombre, CUIT, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="sm:w-44"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: "", label: "Todos" },
            { value: "customer", label: "Clientes" },
            { value: "supplier", label: "Proveedores" },
            { value: "both", label: "Ambos" },
          ]}
        />
      </div>

      {isLoading && <PageLoader />}
      {isError && (
        <p className="mt-6 text-sm text-red-600">
          No se pudieron cargar los partners.
        </p>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon={Users}
          title="No hay partners"
          description="Creá clientes o proveedores para facturar y comprar."
          actionLabel="Crear partner"
          onAction={openCreate}
        />
      )}

      {!isLoading && items.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Razón social</th>
                  <th className="px-3 py-3">Nombre fantasía</th>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">CUIT</th>
                  <th className="px-3 py-3 hidden lg:table-cell">País</th>
                  <th className="px-3 py-3 hidden md:table-cell">Provincia</th>
                  <th className="px-3 py-3 hidden lg:table-cell">Localidad</th>
                  <th className="px-3 py-3 hidden xl:table-cell">Dirección fiscal</th>
                  <th className="px-3 py-3 hidden sm:table-cell">Email</th>
                  <th className="px-3 py-3 hidden sm:table-cell">Teléfono</th>
                  <th className="px-3 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((p: Record<string, unknown>) => (
                  <tr key={String(p.id)} className="hover:bg-slate-50/80">
                    <td className="px-3 py-3 font-medium text-slate-900">
                      {String(p.legal_name || "—")}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{String(p.name)}</td>
                    <td className="px-3 py-3">
                      <Badge variant={typeBadge[String(p.partner_type)] || "default"}>
                        {typeLabels[String(p.partner_type)] || String(p.partner_type)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {String(p.tax_id || "—")}
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      {String(p.country_code || "—")}
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      {String(p.province || "—")}
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      {String(p.city || "—")}
                    </td>
                    <td className="px-3 py-3 hidden xl:table-cell max-w-[160px] truncate">
                      {String(p.address || "—")}
                    </td>
                    <td className="px-3 py-3 hidden sm:table-cell text-slate-600">
                      {String(p.email || "—")}
                    </td>
                    <td className="px-3 py-3 hidden sm:table-cell">
                      {String(p.phone || "—")}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          title="Cuenta corriente"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                          onClick={() => setAccountPartner(p)}
                        >
                          <Wallet className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                          onClick={() => openEdit(p)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => setDeleteId(String(p.id))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? "Editar partner" : "Nuevo partner"}
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Tipo *"
            value={form.partner_type}
            onChange={(e) =>
              setForm({ ...form, partner_type: e.target.value as PartnerType })
            }
            options={[
              { value: "customer", label: "Cliente" },
              { value: "supplier", label: "Proveedor" },
              { value: "both", label: "Cliente y proveedor" },
            ]}
          />
          <Input
            label="CUIT / Tax ID"
            value={form.tax_id}
            onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
          />
          <Input
            label="Nombre de fantasía *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Razón social"
            value={form.legal_name}
            onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Teléfono"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Select
            label="País"
            value={form.country_code}
            onChange={(e) => setForm({ ...form, country_code: e.target.value })}
            options={[
              { value: "AR", label: "Argentina" },
              { value: "UY", label: "Uruguay" },
              { value: "CL", label: "Chile" },
              { value: "PY", label: "Paraguay" },
              { value: "BR", label: "Brasil" },
            ]}
          />
          <Select
            label="Provincia"
            value={form.province}
            onChange={(e) => setForm({ ...form, province: e.target.value })}
            options={[
              { value: "", label: "Seleccionar..." },
              ...AR_PROVINCES.map((p) => ({ value: p, label: p })),
            ]}
          />
          <Input
            label="Localidad / Ciudad"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <Input
            label="Código postal"
            value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Input
              label="Domicilio fiscal"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={closeForm}>
            Cancelar
          </Button>
          <Button loading={saveMut.isPending} onClick={submit}>
            Guardar
          </Button>
        </div>
      </Modal>

      {/* Cuenta corriente */}
      <Modal
        open={!!accountPartner}
        onClose={() => setAccountPartner(null)}
        title={`Cuenta corriente · ${String(accountPartner?.name || "")}`}
        description={
          accountPartner?.legal_name
            ? String(accountPartner.legal_name)
            : undefined
        }
        size="lg"
      >
        {invLoading && <PageLoader />}
        {!invLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Facturado</p>
                <p className="text-lg font-bold tabular-nums">
                  {formatCurrency(totalInvoiced)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Cobrado / Pagado</p>
                <p className="text-lg font-bold tabular-nums text-emerald-700">
                  {formatCurrency(totalPaid)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Saldo</p>
                <p
                  className={`text-lg font-bold tabular-nums ${
                    totalDue > 0 ? "text-amber-700" : "text-slate-900"
                  }`}
                >
                  {formatCurrency(totalDue)}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">
                Facturas
              </h3>
              {invItems.length === 0 ? (
                <p className="text-sm text-slate-500">Sin facturas registradas.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Número</th>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invItems.map((inv: Record<string, unknown>) => {
                        const due =
                          Number(
                            inv.amount_due ??
                              Number(inv.total || 0) - Number(inv.amount_paid || 0)
                          );
                        return (
                          <tr key={String(inv.id)}>
                            <td className="px-3 py-2 font-mono text-xs">
                              {String(inv.invoice_number)}
                            </td>
                            <td className="px-3 py-2">
                              {formatDate(String(inv.invoice_date))}
                            </td>
                            <td className="px-3 py-2 capitalize">
                              {String(inv.status)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatCurrency(Number(inv.total))}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">
                              {formatCurrency(due)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {payItems.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">
                  Recibos / pagos
                </h3>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Recibo</th>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Medio</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payItems.map((r: Record<string, unknown>) => (
                        <tr key={String(r.id)}>
                          <td className="px-3 py-2 font-mono text-xs">
                            {String(r.receipt_number || "—")}
                          </td>
                          <td className="px-3 py-2">
                            {formatDate(String(r.payment_date))}
                          </td>
                          <td className="px-3 py-2 capitalize">
                            {String(r.payment_method || "—")}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCurrency(Number(r.amount))}
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
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Eliminar partner"
        description="Se eliminará el registro. Los documentos históricos se conservan."
        loading={deleteMut.isPending}
      />
    </AppShell>
  );
}
