"use client";

import { useState, useCallback, useRef } from "react";
import { LeadRecord } from "@/services/excel-parser";
import { PipelineResult } from "@/agents/types";
import UploadForm from "@/components/UploadForm";
import LeadTable from "@/components/LeadTable";

type BatchStatus = "idle" | "running" | "paused";

export default function Home() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [results, setResults] = useState<Record<string, PipelineResult>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<BatchStatus>("idle");
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // Refs for pause/stop (avoid stale closure issues)
  const isPausedRef = useRef(false);
  const isStoppedRef = useRef(false);

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
    setBatchStatus("running");
    isPausedRef.current = false;
    isStoppedRef.current = false;

    const unprocessed = leads.filter((l) => !results[l.id]);
    setBatchProgress({ current: 0, total: unprocessed.length });

    let consecutiveFailures = 0;

    for (let i = 0; i < unprocessed.length; i++) {
      // Check for stop
      if (isStoppedRef.current) break;

      // Wait while paused
      while (isPausedRef.current && !isStoppedRef.current) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (isStoppedRef.current) break;

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
          if (
            data.result.status === "completed" ||
            data.result.status === "partial"
          ) {
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

      // Auto-pause on 3 consecutive failures
      if (consecutiveFailures >= 3) {
        isPausedRef.current = true;
        setBatchStatus("paused");
        consecutiveFailures = 0;
        // Wait for user to resume or stop
        while (isPausedRef.current && !isStoppedRef.current) {
          await new Promise((r) => setTimeout(r, 500));
        }
        if (isStoppedRef.current) break;
        setBatchStatus("running");
      }

      // Rate limiting delay between leads
      if (i < unprocessed.length - 1 && !isStoppedRef.current) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    setBatchStatus("idle");
    setProcessingId(null);
    setBatchProgress(null);
  }, [leads, results]);

  const handlePause = useCallback(() => {
    isPausedRef.current = true;
    setBatchStatus("paused");
  }, []);

  const handleResume = useCallback(() => {
    isPausedRef.current = false;
    setBatchStatus("running");
  }, []);

  const handleStop = useCallback(() => {
    isStoppedRef.current = true;
    isPausedRef.current = false;
    setBatchStatus("idle");
    setProcessingId(null);
    setBatchProgress(null);
  }, []);

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
              disabled={batchStatus !== "idle"}
              className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
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
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          batchStatus={batchStatus}
          batchProgress={batchProgress}
        />
      </main>
    </div>
  );
}
