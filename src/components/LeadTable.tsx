"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { LeadRecord } from "@/services/excel-parser";
import { PipelineResult } from "@/agents/types";
import StatusBadge from "./StatusBadge";
import LeadDetail from "./LeadDetail";

type LeadStatus = "pending" | "processing" | "completed" | "partial" | "failed";
type BatchStatus = "idle" | "running" | "paused";

interface LeadTableProps {
  leads: LeadRecord[];
  results: Record<string, PipelineResult>;
  processingId: string | null;
  onProcessLead: (lead: LeadRecord) => void;
  onProcessAll: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  batchStatus: BatchStatus;
  batchProgress: { current: number; total: number } | null;
}

const PAGE_SIZE = 20;

export default function LeadTable({
  leads,
  results,
  processingId,
  onProcessLead,
  onProcessAll,
  onPause,
  onResume,
  onStop,
  batchStatus,
  batchProgress,
}: LeadTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const processingRowRef = useRef<HTMLTableRowElement>(null);

  // Auto-scroll to currently processing row
  useEffect(() => {
    if (processingId && processingRowRef.current) {
      processingRowRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [processingId]);

  const filteredLeads = searchQuery
    ? leads.filter((l) =>
        l.companyName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : leads;

  const totalPages = Math.ceil(filteredLeads.length / PAGE_SIZE);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const getStatus = (lead: LeadRecord): LeadStatus => {
    if (processingId === lead.id) return "processing";
    const result = results[lead.id];
    if (!result) return "pending";
    return result.status;
  };

  // Summary stats
  const stats = {
    completed: 0,
    partial: 0,
    failed: 0,
    pending: 0,
  };
  leads.forEach((l) => {
    const r = results[l.id];
    if (!r) stats.pending++;
    else if (r.status === "completed") stats.completed++;
    else if (r.status === "partial") stats.partial++;
    else stats.failed++;
  });
  const processedCount = stats.completed + stats.partial + stats.failed;

  return (
    <div>
      {/* Summary stats bar */}
      {processedCount > 0 && (
        <div className="flex flex-wrap gap-4 mb-4 p-3 bg-white border rounded-lg text-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            Completed: <strong>{stats.completed}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
            Partial: <strong>{stats.partial}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            Failed: <strong>{stats.failed}</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
            Pending: <strong>{stats.pending}</strong>
          </span>
        </div>
      )}

      {/* Controls bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
          <span className="text-sm text-gray-500">
            {filteredLeads.length} companies
          </span>
        </div>
        <div className="flex items-center gap-3">
          {(batchStatus === "running" || batchStatus === "paused") &&
            batchProgress && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${batchStatus === "paused" ? "bg-yellow-500" : "bg-blue-600"}`}
                    style={{
                      width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                    }}
                  />
                </div>
                <span>
                  {batchProgress.current}/{batchProgress.total}
                  {batchStatus === "paused" && " (Paused)"}
                </span>
              </div>
            )}

          {/* Batch control buttons */}
          {batchStatus === "idle" && (
            <button
              onClick={onProcessAll}
              disabled={!!processingId}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Process All
            </button>
          )}
          {batchStatus === "running" && (
            <button
              onClick={onPause}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors"
            >
              Pause
            </button>
          )}
          {batchStatus === "paused" && (
            <>
              <button
                onClick={onResume}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Resume
              </button>
              <button
                onClick={onStop}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Company Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginatedLeads.map((lead) => {
              const status = getStatus(lead);
              const result = results[lead.id];
              const isExpanded = expandedId === lead.id;
              const isCurrentlyProcessing = processingId === lead.id;

              return (
                <Fragment key={lead.id}>
                  {/* Main row */}
                  <tr
                    ref={isCurrentlyProcessing ? processingRowRef : undefined}
                    className={`cursor-pointer transition-colors ${
                      isCurrentlyProcessing
                        ? "bg-yellow-50"
                        : isExpanded
                          ? "bg-blue-50"
                          : "hover:bg-gray-50"
                    }`}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : lead.id)
                    }
                  >
                    <td className="px-4 py-3 text-gray-500">{lead.index}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {lead.companyName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell truncate max-w-[200px]">
                      {lead.email || lead.cleanEmail || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                      {lead.phone || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onProcessLead(lead);
                        }}
                        disabled={
                          status === "processing" ||
                          status === "completed" ||
                          status === "partial" ||
                          batchStatus !== "idle"
                        }
                        className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {status === "completed" || status === "partial"
                          ? "Done"
                          : status === "processing"
                            ? "Running..."
                            : "Research"}
                      </button>
                    </td>
                  </tr>

                  {/* Inline compact results (shown automatically for processed leads) */}
                  {result && !isExpanded && (
                    <tr className="bg-gray-50/50">
                      <td colSpan={6} className="px-4 py-2">
                        <InlineResult result={result} />
                      </td>
                    </tr>
                  )}

                  {/* Full expanded detail (shown on click) */}
                  {isExpanded && result && (
                    <tr>
                      <td colSpan={6}>
                        <LeadDetail result={result} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline result shown automatically for processed leads.
 * Shows key info at a glance without expanding.
 */
function InlineResult({ result }: { result: PipelineResult }) {
  const profile = result.profile.data;
  const contacts = result.contacts.data;
  const outreach = result.outreach.data;
  const bestContact = contacts?.contacts.find((c) => c.phone || c.email);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-gray-600">
      {/* Business summary */}
      <div className="flex items-start gap-1">
        <span className="text-gray-400 shrink-0">Business:</span>
        <span className="truncate">
          {profile
            ? `${profile.industry}${profile.sizeSignals[0] && profile.sizeSignals[0] !== "Unknown" ? ` | ${profile.sizeSignals[0]}` : ""}${profile.digitalPresence.website ? ` | ${profile.digitalPresence.website}` : ""}`
            : "No data"}
        </span>
      </div>

      {/* Best contact */}
      <div className="flex items-start gap-1">
        <span className="text-gray-400 shrink-0">Contact:</span>
        <span className="truncate">
          {bestContact
            ? [bestContact.phone, bestContact.email]
                .filter(Boolean)
                .join(" | ")
            : "No contacts found"}
        </span>
      </div>

      {/* Outreach preview */}
      <div className="flex items-center gap-1">
        <span className="text-gray-400 shrink-0">Message:</span>
        <span className="truncate flex-1">
          {outreach
            ? `"${outreach.whatsappMessage.slice(0, 80)}..."`
            : "No message"}
        </span>
        {outreach && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(outreach.whatsappMessage);
            }}
            className="shrink-0 px-2 py-0.5 bg-gray-200 hover:bg-gray-300 rounded text-[10px] transition-colors"
          >
            Copy
          </button>
        )}
      </div>
    </div>
  );
}
