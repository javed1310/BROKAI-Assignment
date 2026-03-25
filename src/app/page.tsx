"use client";

import { useState, useCallback } from "react";
import { LeadRecord } from "@/services/excel-parser";
import { PipelineResult } from "@/agents/types";
import UploadForm from "@/components/UploadForm";
import LeadTable from "@/components/LeadTable";

export default function Home() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [results, setResults] = useState<Record<string, PipelineResult>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const handleUploadSuccess = useCallback((uploadedLeads: LeadRecord[]) => {
    setLeads(uploadedLeads);
    setResults({});
  }, []);

  const processLead = useCallback(async (lead: LeadRecord) => {
    setProcessingId(lead.id);
    try {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        setResults((prev) => ({ ...prev, [lead.id]: data.result }));
      }
    } catch (error) {
      console.error("Failed to process lead:", error);
    } finally {
      setProcessingId(null);
    }
  }, []);

  const processAll = useCallback(async () => {
    setIsProcessingBatch(true);
    const unprocessed = leads.filter((l) => !results[l.id]);
    setBatchProgress({ current: 0, total: unprocessed.length });

    let consecutiveFailures = 0;

    for (let i = 0; i < unprocessed.length; i++) {
      const lead = unprocessed[i];
      setBatchProgress({ current: i + 1, total: unprocessed.length });
      setProcessingId(lead.id);

      try {
        const res = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead }),
        });
        const data = await res.json();
        if (data.success && data.result) {
          setResults((prev) => ({ ...prev, [lead.id]: data.result }));
          if (data.result.status === "completed" || data.result.status === "partial") {
            consecutiveFailures = 0;
          } else {
            consecutiveFailures++;
          }
        } else {
          consecutiveFailures++;
        }
      } catch (error) {
        console.error(`Failed to process ${lead.companyName}:`, error);
        consecutiveFailures++;
      }

      setProcessingId(null);

      // Stop if 3 consecutive failures (likely API quota exhausted)
      if (consecutiveFailures >= 3) {
        alert(
          "Paused: 3 consecutive failures detected. Your API quota may be exhausted. Check your API keys or try again later."
        );
        break;
      }

      // Rate limiting delay between leads
      if (i < unprocessed.length - 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    setIsProcessingBatch(false);
    setBatchProgress(null);
  }, [leads, results]);

  const exportCSV = useCallback(() => {
    const processedLeads = leads.filter((l) => results[l.id]);
    if (processedLeads.length === 0) return;

    const headers = [
      "Company Name",
      "State",
      "Email",
      "Phone",
      "Business Summary",
      "Industry",
      "Website",
      "Contact Confidence",
      "Found Contacts",
      "Outreach Message",
      "Status",
    ];

    const rows = processedLeads.map((lead) => {
      const r = results[lead.id];
      const profile = r.profile.data;
      const contacts = r.contacts.data;
      const outreach = r.outreach.data;

      return [
        lead.companyName,
        lead.state,
        lead.email || lead.cleanEmail || "",
        lead.phone || "",
        profile?.summary || "",
        profile?.industry || "",
        profile?.digitalPresence.website || "",
        contacts?.confidence || "",
        contacts?.contacts
          .map((c) => [c.name, c.phone, c.email].filter(Boolean).join(" | "))
          .join("; ") || "",
        outreach?.whatsappMessage || "",
        r.status,
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "brokai-lead-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [leads, results]);

  // State 1: Upload screen
  if (leads.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <UploadForm onUploadSuccess={handleUploadSuccess} />
      </div>
    );
  }

  // State 2: Dashboard
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Brokai Lead Intelligence
            </h1>
            <p className="text-sm text-gray-500">
              {leads.length} companies loaded
            </p>
          </div>
          <div className="flex items-center gap-3">
            {Object.keys(results).length > 0 && (
              <button
                onClick={exportCSV}
                className="text-sm px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Export CSV
              </button>
            )}
            <button
              onClick={() => {
                setLeads([]);
                setResults({});
              }}
              className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Upload New File
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6">
        <LeadTable
          leads={leads}
          results={results}
          processingId={processingId}
          onProcessLead={processLead}
          onProcessAll={processAll}
          isProcessingBatch={isProcessingBatch}
          batchProgress={batchProgress}
        />
      </main>
    </div>
  );
}
