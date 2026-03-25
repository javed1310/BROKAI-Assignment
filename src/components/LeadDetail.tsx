"use client";

import { PipelineResult } from "@/agents/types";

interface LeadDetailProps {
  result: PipelineResult;
}

export default function LeadDetail({ result }: LeadDetailProps) {
  const { profile, contacts, outreach } = result;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 border-t">
      {/* Business Profile */}
      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">
          Business Profile
        </h4>
        {profile.data ? (
          <div className="space-y-2 text-sm">
            <p className="text-gray-800">{profile.data.summary}</p>
            <div>
              <span className="font-medium text-gray-600">Industry: </span>
              <span>{profile.data.industry}</span>
            </div>
            {profile.data.sizeSignals.length > 0 &&
              profile.data.sizeSignals[0] !== "Unknown" && (
                <div>
                  <span className="font-medium text-gray-600">
                    Size Signals:{" "}
                  </span>
                  <ul className="list-disc list-inside text-gray-700 mt-1">
                    {profile.data.sizeSignals.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            {profile.data.digitalPresence.website && (
              <div>
                <span className="font-medium text-gray-600">Website: </span>
                <a
                  href={profile.data.digitalPresence.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all"
                >
                  {profile.data.digitalPresence.website}
                </a>
              </div>
            )}
            {profile.data.systemsUsed.length > 0 &&
              profile.data.systemsUsed[0] !== "Unknown" && (
                <div>
                  <span className="font-medium text-gray-600">Systems: </span>
                  <span>{profile.data.systemsUsed.join(", ")}</span>
                </div>
              )}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No profile data available</p>
        )}
        {!profile.success && profile.error && (
          <p className="text-orange-500 text-xs mt-2">Note: {profile.error}</p>
        )}
      </div>

      {/* Contact Card */}
      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">
          Contact Info
          {contacts.data && (
            <span
              className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                contacts.data.confidence === "high"
                  ? "bg-green-100 text-green-700"
                  : contacts.data.confidence === "medium"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-600"
              }`}
            >
              {contacts.data.confidence} confidence
            </span>
          )}
        </h4>
        {contacts.data && contacts.data.contacts.length > 0 ? (
          <div className="space-y-3">
            {contacts.data.contacts.map((c, i) => (
              <div key={i} className="text-sm border-b pb-2 last:border-0">
                {c.name && (
                  <p className="font-medium text-gray-800">
                    {c.name}
                    {c.role && (
                      <span className="text-gray-500 font-normal">
                        {" "}
                        ({c.role})
                      </span>
                    )}
                  </p>
                )}
                {c.phone && (
                  <p className="text-gray-700">
                    Phone: {c.phone}
                  </p>
                )}
                {c.email && (
                  <p className="text-gray-700">
                    Email:{" "}
                    <a
                      href={`mailto:${c.email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {c.email}
                    </a>
                  </p>
                )}
                {c.whatsapp && (
                  <p className="text-gray-700">WhatsApp: {c.whatsapp}</p>
                )}
                <p className="text-gray-400 text-xs mt-1">
                  Source: {c.source}
                </p>
              </div>
            ))}
            {contacts.data.addresses.length > 0 && (
              <div className="text-sm">
                <span className="font-medium text-gray-600">Address: </span>
                <span>{contacts.data.addresses.join("; ")}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No contacts found</p>
        )}
        {!contacts.success && contacts.error && (
          <p className="text-orange-500 text-xs mt-2">
            Note: {contacts.error}
          </p>
        )}
      </div>

      {/* Outreach Message */}
      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">
          Outreach Message
        </h4>
        {outreach.data ? (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {outreach.data.whatsappMessage}
              </p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  outreach.data!.whatsappMessage
                );
              }}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-700"
            >
              Copy Message
            </button>
            {outreach.data.personalizationPoints.length > 0 && (
              <div className="text-xs text-gray-500">
                <span className="font-medium">Personalized on: </span>
                {outreach.data.personalizationPoints.join(", ")}
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No message generated</p>
        )}
        {!outreach.success && outreach.error && (
          <p className="text-orange-500 text-xs mt-2">
            Note: {outreach.error}
          </p>
        )}
      </div>

      {/* Timing info */}
      <div className="col-span-full text-xs text-gray-400 text-right">
        Total: {(result.totalDurationMs / 1000).toFixed(1)}s | Research:{" "}
        {(profile.durationMs / 1000).toFixed(1)}s | Contacts:{" "}
        {(contacts.durationMs / 1000).toFixed(1)}s | Outreach:{" "}
        {(outreach.durationMs / 1000).toFixed(1)}s
      </div>
    </div>
  );
}
