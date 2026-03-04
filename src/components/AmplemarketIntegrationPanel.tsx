"use client";

import { useState, useEffect } from "react";
import { Search, CheckCircle, XCircle, RefreshCw, Zap, Download } from "lucide-react";

interface EnrichmentResult {
  enriched: number;
  failed: number;
  total: number;
  results: Array<{
    leadId: string;
    success: boolean;
    email?: string;
    error?: string;
  }>;
}

interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  leadLists: number;
  message?: string;
  error?: string;
}

export default function AmplemarketIntegrationPanel() {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<EnrichmentResult | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    // Check if AMPLEMARKET_API_KEY is configured by trying the validate endpoint
    // For now, we check via an env-check approach
    checkConnection();
  }, []);

  async function checkConnection() {
    try {
      // Simple check: call enrichment with limit=0 to see if API key is configured
      const res = await fetch("/api/amplemarket/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 0 }),
      });
      const data = await res.json();
      // If we don't get a 500 about missing API key, we're connected
      setIsConnected(res.ok || !data.error?.includes("not configured"));
    } catch {
      setIsConnected(false);
    }
    setLoading(false);
  }

  async function handleEnrich() {
    setEnriching(true);
    setEnrichError(null);
    setEnrichResult(null);

    try {
      const res = await fetch("/api/amplemarket/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json();
        setEnrichError(data.error || "Enrichment failed");
        setEnriching(false);
        return;
      }

      const data: EnrichmentResult = await res.json();
      setEnrichResult(data);
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "Enrichment failed");
    }

    setEnriching(false);
  }

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const res = await fetch("/api/amplemarket/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data: ImportResult = await res.json();

      if (!res.ok) {
        setImportError(data.error || "Import failed");
        // Still show partial results if available
        if (data.imported !== undefined) {
          setImportResult(data);
        }
        setImporting(false);
        return;
      }

      setImportResult(data);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    }

    setImporting(false);
  }

  if (loading) {
    return (
      <div
        style={{
          border: "1px solid var(--balboa-border)",
          borderRadius: 12,
          padding: 24,
          background: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background:
                "linear-gradient(135deg, var(--balboa-bg-alt), var(--balboa-bg-hover))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Search size={22} style={{ color: "var(--balboa-text-muted)" }} />
          </div>
          <div>
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--balboa-navy)",
              }}
            >
              Amplemarket
            </span>
            <div
              style={{
                fontSize: 12,
                color: "var(--balboa-text-muted)",
                marginTop: 4,
              }}
            >
              Checking connection...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--balboa-border)",
        borderRadius: 12,
        padding: 24,
        background: "white",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        {/* Icon */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: isConnected
              ? "linear-gradient(135deg, #e8f5e9, #c8e6c9)"
              : "linear-gradient(135deg, var(--balboa-bg-alt), var(--balboa-bg-hover))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Search
            size={22}
            style={{
              color: isConnected ? "#2e7d32" : "var(--balboa-text-muted)",
            }}
          />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--balboa-navy)",
              }}
            >
              Amplemarket
            </span>
            {isConnected ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#2e7d32",
                  background: "#e8f5e9",
                  padding: "2px 8px",
                  borderRadius: 10,
                }}
              >
                <CheckCircle size={11} />
                Connected
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--balboa-text-muted)",
                  background: "var(--balboa-bg-alt)",
                  padding: "2px 8px",
                  borderRadius: 10,
                }}
              >
                <XCircle size={11} />
                Not configured
              </span>
            )}
          </div>

          {isConnected ? (
            <>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--balboa-text-secondary)",
                  marginBottom: 12,
                  lineHeight: 1.5,
                }}
              >
                Import contacts from your Amplemarket lead lists or enrich
                existing leads with email addresses and company data.
              </div>

              {/* Import Results */}
              {importResult && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: importResult.imported > 0 ? "#e8f5e9" : "var(--balboa-bg-alt)",
                    borderRadius: 8,
                    marginBottom: 12,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: importResult.imported > 0 ? "#2e7d32" : "var(--balboa-navy)",
                      marginBottom: 4,
                    }}
                  >
                    Import Complete
                  </div>
                  <div style={{ color: "var(--balboa-text-secondary)" }}>
                    <strong>{importResult.imported}</strong> contacts imported
                    from {importResult.leadLists} lead list{importResult.leadLists !== 1 ? "s" : ""}
                    {importResult.skipped > 0 && (
                      <span style={{ color: "var(--balboa-text-muted)" }}>
                        {" "}
                        ({importResult.skipped} already existed)
                      </span>
                    )}
                  </div>
                  {importResult.imported === 0 && importResult.total > 0 && (
                    <div
                      style={{
                        color: "var(--balboa-text-muted)",
                        marginTop: 4,
                      }}
                    >
                      All {importResult.total} contacts already exist as leads.
                    </div>
                  )}
                  {importResult.total === 0 && (
                    <div
                      style={{
                        color: "var(--balboa-text-muted)",
                        marginTop: 4,
                      }}
                    >
                      No contacts found in Amplemarket lead lists.
                    </div>
                  )}
                </div>
              )}

              {/* Import Error */}
              {importError && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: "#fff3e0",
                    borderRadius: 8,
                    marginBottom: 12,
                    fontSize: 13,
                    color: "#e65100",
                  }}
                >
                  {importError}
                </div>
              )}

              {/* Enrichment Results */}
              {enrichResult && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: enrichResult.enriched > 0 ? "#e8f5e9" : "var(--balboa-bg-alt)",
                    borderRadius: 8,
                    marginBottom: 12,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: enrichResult.enriched > 0 ? "#2e7d32" : "var(--balboa-navy)",
                      marginBottom: 4,
                    }}
                  >
                    Enrichment Complete
                  </div>
                  <div style={{ color: "var(--balboa-text-secondary)" }}>
                    <strong>{enrichResult.enriched}</strong> of{" "}
                    {enrichResult.total} leads enriched with email addresses
                    {enrichResult.failed > 0 && (
                      <span style={{ color: "var(--balboa-text-muted)" }}>
                        {" "}
                        ({enrichResult.failed} not found)
                      </span>
                    )}
                  </div>
                  {enrichResult.total === 0 && (
                    <div
                      style={{
                        color: "var(--balboa-text-muted)",
                        marginTop: 4,
                      }}
                    >
                      All leads already have email addresses.
                    </div>
                  )}
                </div>
              )}

              {/* Enrichment Error */}
              {enrichError && (
                <div
                  style={{
                    padding: "12px 16px",
                    background: "#fff3e0",
                    borderRadius: 8,
                    marginBottom: 12,
                    fontSize: 13,
                    color: "#e65100",
                  }}
                >
                  {enrichError}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={handleImport}
                  disabled={importing || enriching}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "9px 20px",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "white",
                    background: "var(--balboa-navy)",
                    border: "none",
                    borderRadius: 8,
                    cursor: importing || enriching ? "not-allowed" : "pointer",
                    opacity: importing || enriching ? 0.7 : 1,
                  }}
                >
                  {importing ? (
                    <>
                      <RefreshCw
                        size={14}
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                      Importing Contacts...
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      Import Contacts
                    </>
                  )}
                </button>
                <button
                  onClick={handleEnrich}
                  disabled={enriching || importing}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "9px 20px",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "white",
                    background: "var(--balboa-blue)",
                    border: "none",
                    borderRadius: 8,
                    cursor: enriching || importing ? "not-allowed" : "pointer",
                    opacity: enriching || importing ? 0.7 : 1,
                  }}
                >
                  {enriching ? (
                    <>
                      <RefreshCw
                        size={14}
                        style={{ animation: "spin 1s linear infinite" }}
                      />
                      Enriching Leads...
                    </>
                  ) : (
                    <>
                      <Zap size={14} />
                      Enrich All Leads
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--balboa-text-secondary)",
                  marginBottom: 4,
                  lineHeight: 1.5,
                }}
              >
                Import prospecting lists and enrich lead data automatically.
                Find email addresses for your LinkedIn contacts.
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--balboa-text-muted)",
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                Add your Amplemarket API key to the environment variables to
                connect.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
