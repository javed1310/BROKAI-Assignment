"use client";

import { useState, Fragment } from "react";
import { LeadRecord } from "@/services/excel-parser";
import { PipelineResult } from "@/agents/types";
import StatusBadge from "./StatusBadge";
import LeadDetail from "./LeadDetail";

type LeadStatus = "pending" | "processing" | "completed" | "partial" | "failed";

interface LeadTableProps {
  leads: LeadRecord[];
  results: Record<string, PipelineResult>;
  processingId: string | null;
  onProcessLead: (lead: LeadRecord) => void;
  onProcessAll: () => void;
  isProcessingBatch: boolean;
  batchProgress: { current: number; total: number } | null;
}

const PAGE_SIZE = 20;

export default function LeadTable({
  leads,
  results,
  processingId,
  onProcessLead,
  onProcessAll,
  isProcessingBatch,
  batchProgress,
}: LeadTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter leads by search query
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

  const processedCount = Object.keys(results).length;

  return (
    <div>
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
            {processedCount > 0 && ` | ${processedCount} processed`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isProcessingBatch && batchProgress && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="w-32 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                  }}
                />
              </div>
              <span>
                {batchProgress.current}/{batchProgress.total}
              </span>
            </div>
          )}
          <button
            onClick={onProcessAll}
            disabled={isProcessingBatch || !!processingId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessingBatch ? "Processing..." : "Process All"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                #
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                Company Name
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">
                Email
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">
                Phone
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                Status
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginatedLeads.map((lead) => {
              const status = getStatus(lead);
              const result = results[lead.id];
              const isExpanded = expandedId === lead.id;

              return (
                <Fragment key={lead.id}>
                <tr
                  className={`hover:bg-gray-50 cursor-pointer ${isExpanded ? "bg-blue-50" : ""}`}
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
                          isProcessingBatch
                        }
                        className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {status === "completed"
                          ? "Done"
                          : status === "processing"
                            ? "Running..."
                            : "Research"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && result && (
                    <tr key={`${lead.id}-detail`}>
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
            onClick={() =>
              setCurrentPage((p) => Math.min(totalPages, p + 1))
            }
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
