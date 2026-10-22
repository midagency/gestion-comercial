import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      if (!window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/onboarding")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export async function login(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  return data as { access_token: string; refresh_token: string };
}

export async function getMe() {
  const { data } = await api.get("/auth/me");
  return data;
}

export async function getModuleRecommendations(businessType: string) {
  const { data } = await api.get(`/onboarding/recommendations/${businessType}`);
  return data;
}

export async function getDefaultPriceLists(businessType: string) {
  const { data } = await api.get(`/onboarding/default-price-lists/${businessType}`);
  return data;
}

export async function completeOnboarding(payload: unknown) {
  const { data } = await api.post("/onboarding/complete", payload);
  return data as {
    company_id: string;
    user_id: string;
    access_token: string;
    refresh_token: string;
    message: string;
    demo_data_created: boolean;
  };
}

export async function getDashboard() {
  const { data } = await api.get("/reports/dashboard");
  return data;
}

export async function listPartners(params?: Record<string, unknown>) {
  const { data } = await api.get("/partners", { params });
  return data;
}

export async function createPartner(payload: unknown) {
  const { data } = await api.post("/partners", payload);
  return data;
}

export async function getPartner(id: string) {
  const { data } = await api.get(`/partners/${id}`);
  return data;
}

export async function updatePartner(id: string, payload: unknown) {
  const { data } = await api.patch(`/partners/${id}`, payload);
  return data;
}

export async function deletePartner(id: string) {
  const { data } = await api.delete(`/partners/${id}`);
  return data;
}

export async function listProducts(params?: Record<string, unknown>) {
  const { data } = await api.get("/products", { params });
  return data;
}

export async function getProduct(id: string) {
  const { data } = await api.get(`/products/${id}`);
  return data;
}

export async function createProduct(payload: unknown) {
  const { data } = await api.post("/products", payload);
  return data;
}

export async function updateProduct(id: string, payload: unknown) {
  const { data } = await api.patch(`/products/${id}`, payload);
  return data;
}

export async function deleteProduct(id: string) {
  const { data } = await api.delete(`/products/${id}`);
  return data;
}

export async function getStockSummary() {
  const { data } = await api.get("/inventory/summary");
  return data;
}

export async function listStockLevels(params?: Record<string, unknown>) {
  const { data } = await api.get("/inventory/levels", { params });
  return data;
}

export async function exportStockLevels(params?: Record<string, unknown>) {
  const { data } = await api.get("/inventory/levels/export", {
    params,
    responseType: "blob",
  });
  return data as Blob;
}

export async function listStockMoves(params?: Record<string, unknown>) {
  const { data } = await api.get("/inventory/moves", { params });
  return data;
}

export async function createStockMove(payload: unknown) {
  const { data } = await api.post("/inventory/moves", payload);
  return data;
}

export async function updateStockThresholds(id: string, payload: unknown) {
  const { data } = await api.patch(`/inventory/levels/${id}`, payload);
  return data;
}

export async function listWarehouses() {
  const { data } = await api.get("/inventory/warehouses");
  return data;
}

export async function listOrders(params?: Record<string, unknown>) {
  const { data } = await api.get("/orders", { params });
  return data;
}

export async function searchPosProducts(q?: string, warehouseId?: string) {
  const { data } = await api.get("/pos/products", {
    params: { q, warehouse_id: warehouseId, limit: 30 },
  });
  return data;
}

export async function createPosSale(payload: unknown) {
  const { data } = await api.post("/pos/sales", payload);
  return data;
}

export async function listRegisters() {
  const { data } = await api.get("/treasury/registers");
  return data;
}

export async function createRegister(payload: unknown) {
  const { data } = await api.post("/treasury/registers", payload);
  return data;
}

export async function openCashSession(payload: unknown) {
  const { data } = await api.post("/treasury/sessions/open", payload);
  return data;
}

export async function closeCashSession(sessionId: string, payload?: unknown) {
  const { data } = await api.post(`/treasury/sessions/${sessionId}/close`, payload || {});
  return data;
}

export async function getCashSession(sessionId: string) {
  const { data } = await api.get(`/treasury/sessions/${sessionId}`);
  return data;
}

export async function listCashSessions(params?: Record<string, unknown>) {
  const { data } = await api.get("/treasury/sessions", { params });
  return data;
}

export async function addCashMovement(payload: unknown) {
  const { data } = await api.post("/treasury/movements", payload);
  return data;
}

export async function getTreasurySummary() {
  const { data } = await api.get("/treasury/summary");
  return data;
}

export async function getOrder(id: string) {
  const { data } = await api.get(`/orders/${id}`);
  return data;
}

export async function createOrder(payload: unknown) {
  const { data } = await api.post("/orders", payload);
  return data;
}

export async function confirmOrder(id: string) {
  const { data } = await api.post(`/orders/${id}/confirm`);
  return data;
}

export async function cancelOrder(id: string) {
  const { data } = await api.post(`/orders/${id}/cancel`);
  return data;
}

export async function markOrderDone(id: string) {
  const { data } = await api.post(`/orders/${id}/done`);
  return data;
}

export async function invoiceFromOrder(id: string, payload?: unknown) {
  const { data } = await api.post(`/orders/${id}/invoice`, payload || {});
  return data;
}

export async function listInvoices(params?: Record<string, unknown>) {
  const { data } = await api.get("/invoices", { params });
  return data;
}

export async function createPayment(payload: unknown) {
  const { data } = await api.post("/payments", payload);
  return data;
}

export async function listPurchaseOrders(params?: Record<string, unknown>) {
  const { data } = await api.get("/purchase-orders", { params });
  return data;
}

export async function getPurchaseOrder(id: string) {
  const { data } = await api.get(`/purchase-orders/${id}`);
  return data;
}

export async function createPurchaseOrder(payload: unknown) {
  const { data } = await api.post("/purchase-orders", payload);
  return data;
}

export async function confirmPurchaseOrder(id: string) {
  const { data } = await api.post(`/purchase-orders/${id}/confirm`);
  return data;
}

export async function cancelPurchaseOrder(id: string) {
  const { data } = await api.post(`/purchase-orders/${id}/cancel`);
  return data;
}

export async function receivePurchaseGoods(id: string, payload: unknown) {
  const { data } = await api.post(`/purchase-orders/${id}/receive`, payload);
  return data;
}

export async function invoiceFromPurchaseOrder(id: string, payload?: unknown) {
  const { data } = await api.post(`/purchase-orders/${id}/invoice`, payload || {});
  return data;
}

export async function listSupplierInvoices(params?: Record<string, unknown>) {
  const { data } = await api.get("/supplier-invoices", { params });
  return data;
}

export async function paySupplierInvoice(payload: unknown) {
  const { data } = await api.post("/supplier-invoices/pay", payload);
  return data;
}

export async function postSupplierInvoice(id: string) {
  const { data } = await api.post(`/supplier-invoices/${id}/post`);
  return data;
}

export async function getAgingReceivable(asOf?: string) {
  const { data } = await api.get("/reports/aging/receivable", {
    params: asOf ? { as_of: asOf } : undefined,
  });
  return data;
}

export async function getAgingPayable(asOf?: string) {
  const { data } = await api.get("/reports/aging/payable", {
    params: asOf ? { as_of: asOf } : undefined,
  });
  return data;
}

export async function getSalesByPeriod(params?: Record<string, unknown>) {
  const { data } = await api.get("/reports/sales/by-period", { params });
  return data;
}

export async function getPurchasesByPeriod(params?: Record<string, unknown>) {
  const { data } = await api.get("/reports/purchases/by-period", { params });
  return data;
}

export async function listBankAccounts(params?: Record<string, unknown>) {
  const { data } = await api.get("/treasury/bank-accounts", { params });
  return data;
}

export async function createBankAccount(payload: unknown) {
  const { data } = await api.post("/treasury/bank-accounts", payload);
  return data;
}

export async function listBankTransactions(params?: Record<string, unknown>) {
  const { data } = await api.get("/treasury/bank-transactions", { params });
  return data;
}

export async function createBankTransaction(payload: unknown) {
  const { data } = await api.post("/treasury/bank-transactions", payload);
  return data;
}

export async function getTopProducts(params?: Record<string, unknown>) {
  const { data } = await api.get("/reports/sales/by-product", { params });
  return data;
}

export async function getTopCustomers(params?: Record<string, unknown>) {
  const { data } = await api.get("/reports/sales/by-customer", { params });
  return data;
}

export async function getInventoryValuation() {
  const { data } = await api.get("/reports/inventory/valuation");
  return data;
}

export async function getStockMovementsSummary(params?: Record<string, unknown>) {
  const { data } = await api.get("/reports/inventory/movements-summary", { params });
  return data;
}

export async function getCashSessionsReport(params?: Record<string, unknown>) {
  const { data } = await api.get("/reports/cash/sessions", { params });
  return data;
}

export async function createCreditNote(payload: unknown) {
  const { data } = await api.post("/credit-notes", payload);
  return data;
}
export async function listCreditNotes(params?: Record<string, unknown>) {
  const { data } = await api.get("/credit-notes", { params });
  return data;
}
export async function listDeliveryNotes(params?: Record<string, unknown>) {
  const { data } = await api.get("/delivery-notes", { params });
  return data;
}
export async function createDeliveryNote(payload: unknown) {
  const { data } = await api.post("/delivery-notes", payload);
  return data;
}
export async function createDeliveryNoteFromOrder(orderId: string, payload?: unknown) {
  const { data } = await api.post(`/orders/${orderId}/delivery-note`, payload || {});
  return data;
}
export async function confirmDeliveryNote(id: string) {
  const { data } = await api.post(`/delivery-notes/${id}/confirm`);
  return data;
}
export async function markDeliveryNoteDelivered(id: string) {
  const { data } = await api.post(`/delivery-notes/${id}/deliver`);
  return data;
}
export function printInvoiceUrl(id: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  return `${base}/print/invoice/${id}`;
}
export function printDeliveryNoteUrl(id: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  return `${base}/print/delivery-note/${id}`;
}
export function printTicketUrl(id: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  return `${base}/print/ticket/${id}`;
}

export async function openPrintDocument(
  kind: "invoice" | "ticket" | "delivery-note",
  id: string
): Promise<void> {
  const path =
    kind === "invoice"
      ? `/print/invoice/${id}`
      : kind === "ticket"
        ? `/print/ticket/${id}`
        : `/print/delivery-note/${id}`;
  const { data } = await api.get<string>(path, {
    responseType: "text" as "json",
    headers: { Accept: "text/html" },
    transformResponse: [(d) => d],
  });
  const w = window.open("", "_blank");
  if (!w) {
    throw new Error("El navegador bloqueó la ventana emergente");
  }
  w.document.open();
  w.document.write(typeof data === "string" ? data : String(data));
  w.document.close();
}
export async function getCompany() {
  const { data } = await api.get("/settings/company");
  return data;
}
export async function updateCompany(payload: unknown) {
  const { data } = await api.patch("/settings/company", payload);
  return data;
}
export async function listBranches() {
  const { data } = await api.get("/settings/branches");
  return data;
}
export async function createBranch(payload: unknown) {
  const { data } = await api.post("/settings/branches", payload);
  return data;
}
export async function listSettingsWarehouses() {
  const { data } = await api.get("/settings/warehouses");
  return data;
}
export async function createSettingsWarehouse(payload: unknown) {
  const { data } = await api.post("/settings/warehouses", payload);
  return data;
}
export async function listUsers() {
  const { data } = await api.get("/settings/users");
  return data;
}
export async function createUser(payload: unknown) {
  const { data } = await api.post("/settings/users", payload);
  return data;
}
export async function updateUser(id: string, payload: unknown) {
  const { data } = await api.patch(`/settings/users/${id}`, payload);
  return data;
}
export async function listRoles() {
  const { data } = await api.get("/settings/roles");
  return data;
}
export async function createRole(payload: unknown) {
  const { data } = await api.post("/settings/roles", payload);
  return data;
}
export async function listPermissions() {
  const { data } = await api.get("/settings/permissions");
  return data;
}

export async function listAccounts() {
  const { data } = await api.get("/accounting/accounts");
  return data;
}
export async function seedChartOfAccounts() {
  const { data } = await api.post("/accounting/accounts/seed");
  return data;
}
export async function createAccount(payload: unknown) {
  const { data } = await api.post("/accounting/accounts", payload);
  return data;
}
export async function listJournalEntries(params?: Record<string, unknown>) {
  const { data } = await api.get("/accounting/entries", { params });
  return data;
}
export async function createJournalEntry(payload: unknown) {
  const { data } = await api.post("/accounting/entries", payload);
  return data;
}
export async function getTrialBalance() {
  const { data } = await api.get("/accounting/trial-balance");
  return data;
}
export async function listChecks(params?: Record<string, unknown>) {
  const { data } = await api.get("/checks", { params });
  return data;
}
export async function createCheck(payload: unknown) {
  const { data } = await api.post("/checks", payload);
  return data;
}
export async function updateCheckStatus(id: string, status: string) {
  const { data } = await api.patch(`/checks/${id}/status`, { status });
  return data;
}
export async function authorizeInvoice(id: string, payload?: unknown) {
  const { data } = await api.post(`/invoices/${id}/authorize`, payload || { simulate: true });
  return data;
}
export async function listNotifications(unreadOnly = false) {
  const { data } = await api.get("/notifications", { params: { unread_only: unreadOnly } });
  return data;
}
export async function markNotificationRead(id: string) {
  const { data } = await api.post(`/notifications/${id}/read`);
  return data;
}
export function exportCsvUrl(resource: "partners" | "products" | "invoices") {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  return `${base}/export/${resource}.csv`;
}

export async function listPriceLists(params?: Record<string, unknown>) {
  const { data } = await api.get("/price-lists", { params });
  return data;
}
export async function createPriceList(payload: unknown) {
  const { data } = await api.post("/price-lists", payload);
  return data;
}
export async function getPriceList(id: string) {
  const { data } = await api.get(`/price-lists/${id}`);
  return data;
}
export async function updatePriceList(id: string, payload: unknown) {
  const { data } = await api.patch(`/price-lists/${id}`, payload);
  return data;
}
export async function deletePriceList(id: string) {
  const { data } = await api.delete(`/price-lists/${id}`);
  return data;
}
export async function addPriceListItem(priceListId: string, payload: unknown) {
  const { data } = await api.post(`/price-lists/${priceListId}/items`, payload);
  return data;
}
export async function updatePriceListItem(
  priceListId: string,
  itemId: string,
  payload: unknown
) {
  const { data } = await api.patch(
    `/price-lists/${priceListId}/items/${itemId}`,
    payload
  );
  return data;
}
export async function deletePriceListItem(priceListId: string, itemId: string) {
  await api.delete(`/price-lists/${priceListId}/items/${itemId}`);
}

export async function listOpportunities(params?: Record<string, unknown>) {
  const { data } = await api.get("/crm/opportunities", { params });
  return data;
}
export async function createOpportunity(payload: unknown) {
  const { data } = await api.post("/crm/opportunities", payload);
  return data;
}
export async function updateOpportunity(id: string, payload: unknown) {
  const { data } = await api.patch(`/crm/opportunities/${id}`, payload);
  return data;
}
