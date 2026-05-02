// Shared helpers for the admin "bucket" modals (BinModal, AllJobsModal,
// PendingApprovalsModal, PaymentRemindersModal, AutoApprovedQuotesModal).
// Centralised so every modal renders photos and status the same way.

// Build the public image URL from a stored path. Handles both legacy
// disk paths (`/app/static/quote_images/<file>`) and new managed-storage
// paths (`text2toss/quote_images/<file>`) — the last two segments give us
// {folder, filename} for the /api/images/{folder}/{filename} route.
export const buildImageUrl = (storedPath) => {
  if (!storedPath) return "";
  if (storedPath.startsWith("http")) return storedPath;
  const parts = storedPath.split("/").filter(Boolean);
  if (parts.length < 2) return "";
  const folder = parts[parts.length - 2];
  const filename = parts[parts.length - 1];
  return `${process.env.REACT_APP_BACKEND_URL}/api/images/${folder}/${filename}`;
};

// Tailwind classes for status pills.
export const STATUS_BADGE = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  pending_payment: "bg-rose-100 text-rose-800",
  pending_customer_approval: "bg-orange-100 text-orange-800",
  cancelled: "bg-gray-100 text-gray-600",
};

// Left-border accent per status, for card corners.
export const STATUS_BORDER = {
  scheduled: "border-l-blue-400",
  in_progress: "border-l-yellow-400",
  completed: "border-l-green-400",
  pending_payment: "border-l-rose-400",
  pending_customer_approval: "border-l-orange-400",
  cancelled: "border-l-gray-300",
};

// Header gradient classes per bin / modal "kind".
export const BIN_GRADIENT = {
  pendingPayment: "from-rose-500 to-rose-600",
  new: "from-blue-500 to-blue-600",
  upcoming: "from-amber-500 to-orange-500",
  inProgress: "from-yellow-500 to-yellow-600",
  completed: "from-green-500 to-green-600",
  all: "from-purple-500 to-purple-600",
  approval: "from-orange-500 to-orange-600",
  autoApproved: "from-blue-500 to-blue-600",
};

export const formatDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const formatStatus = (status) =>
  (status || "").replace(/_/g, " ").toUpperCase();
