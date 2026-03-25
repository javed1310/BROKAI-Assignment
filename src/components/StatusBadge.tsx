"use client";

type Status = "pending" | "processing" | "completed" | "partial" | "failed";

const statusConfig: Record<Status, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-gray-100 text-gray-700",
  },
  processing: {
    label: "Processing",
    className: "bg-yellow-100 text-yellow-800 animate-pulse",
  },
  completed: {
    label: "Completed",
    className: "bg-green-100 text-green-800",
  },
  partial: {
    label: "Partial",
    className: "bg-orange-100 text-orange-800",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-800",
  },
};

export default function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
