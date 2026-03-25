"use client";

import { useState, useCallback } from "react";
import { LeadRecord } from "@/services/excel-parser";

interface UploadFormProps {
  onUploadSuccess: (leads: LeadRecord[]) => void;
}

export default function UploadForm({ onUploadSuccess }: UploadFormProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Upload failed");
          return;
        }

        onUploadSuccess(data.leads);
      } catch {
        setError("Failed to upload file. Please try again.");
      } finally {
        setIsUploading(false);
      }
    },
    [onUploadSuccess]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Brokai Lead Intelligence
        </h1>
        <p className="text-gray-600 max-w-md">
          Upload your Excel file with company data. The system will research
          each company, find contacts, and generate personalized outreach
          messages.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`
          w-full max-w-lg border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer
          ${
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400 bg-white"
          }
          ${isUploading ? "opacity-50 pointer-events-none" : ""}
        `}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600">Parsing Excel file...</p>
          </div>
        ) : (
          <>
            <div className="text-4xl mb-4">📊</div>
            <p className="text-gray-700 font-medium mb-2">
              Drag and drop your Excel file here
            </p>
            <p className="text-gray-500 text-sm mb-4">or</p>
            <label className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer font-medium">
              Browse Files
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileInput}
                className="hidden"
              />
            </label>
            <p className="text-gray-400 text-xs mt-4">
              Supports .xlsx and .xls files
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm max-w-lg w-full">
          {error}
        </div>
      )}
    </div>
  );
}
