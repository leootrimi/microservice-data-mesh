import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const SUMMARY_API = "http://localhost:3003/analytics/summary";
const CATALOG_API = "http://localhost:3003/data-products";
const GOVERNANCE_API = "http://localhost:3003/governance/report";
const BI_HEADERS = { "X-Data-Role": "bi_reader" };

const shellStyle: React.CSSProperties = {
  fontFamily: "Inter, Arial, sans-serif",
  padding: 24,
  background: "#f4f7fb",
  color: "#1f2937",
  minHeight: "100vh"
};

const panelStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 8,
  padding: 18,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)"
};

function formatAge(ageMs?: number | null) {
  if (ageMs == null) {
    return "No data yet";
  }

  return `${Math.round(ageMs / 1000)}s`;
}

function statusColor(status?: string) {
  if (status === "fresh") {
    return "#0f9d58";
  }

  if (status === "stale") {
    return "#d97706";
  }

  if (status === "success") {
    return "#0f9d58";
  }

  if (status === "failed") {
    return "#dc2626";
  }

  return "#2563eb";
}

function App() {
  const [summary, setSummary] = useState<any>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(SUMMARY_API, { headers: BI_HEADERS }).then((res) => res.json()),
      fetch(CATALOG_API).then((res) => res.json()),
      fetch(GOVERNANCE_API).then((res) => res.json())
    ])
      .then(([summaryPayload, catalogPayload, reportPayload]) => {
        setSummary(summaryPayload);
        setCatalog(catalogPayload);
        setReport(reportPayload);
      })
      .catch((fetchError) => setError(fetchError.message));
  }, []);

  const paymentStatusData = useMemo(() => {
    if (!summary?.orders) {
      return [];
    }

    return summary.orders.map((order: any) => ({
      name: order.orderId,
      value: order.orderAmount,
      paymentStatus: order.paymentStatus
    }));
  }, [summary]);

  if (error) {
    return <div style={shellStyle}>Error loading dashboard: {error}</div>;
  }

  if (!summary || !report) {
    return <div style={shellStyle}>Loading governance-aware BI dashboard...</div>;
  }

  return (
    <div style={shellStyle}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 8px" }}>Business Intelligence Governance Dashboard</h1>
        <div style={{ color: "#4b5563" }}>
          Data Mesh demo with domain-owned data products, governed contracts, and BI
          summary materialized from product events only.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 20
        }}
      >
        <div style={panelStyle}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Total Revenue</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>${summary.totalRevenue}</div>
        </div>
        <div style={panelStyle}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Orders in Summary</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{summary.orders.length}</div>
        </div>
        <div style={panelStyle}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Failed Payments</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{summary.failedPayments}</div>
        </div>
        <div style={panelStyle}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Pending Orders</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{summary.pendingOrders}</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 1.4fr) minmax(280px, 1fr)",
          gap: 16,
          marginBottom: 20
        }}
      >
        <div style={panelStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Order Amounts by Product Record</h2>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={summary.orders}>
                <XAxis dataKey="orderId" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="orderAmount" name="Order Amount" fill="#2563eb" />
                <Bar dataKey="paidAmount" name="Paid Amount" fill="#0f9d58" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={panelStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Payment Status Distribution</h2>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={paymentStatusData} dataKey="value" nameKey="name" outerRadius={85} label>
                  {paymentStatusData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={statusColor(entry.paymentStatus)}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ ...panelStyle, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Data Product Catalog</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {catalog.map((product) => (
            <div
              key={product.key}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 14,
                display: "grid",
                gap: 6
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap"
                }}
              >
                <strong>{product.name}</strong>
                <span style={{ color: statusColor(product.freshness?.status) }}>
                  {product.freshness?.status || "unknown"}
                </span>
              </div>
              <div style={{ color: "#4b5563" }}>{product.description}</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                Domain: {product.domain} | Owner: {product.owner} | Contract:{" "}
                {product.schemaContract}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                Output: {product.outputPort?.transport} {product.outputPort?.topic || product.outputPort?.endpoint}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                Last update: {product.lastUpdatedAt || "No publication yet"} | Age:{" "}
                {formatAge(product.freshness?.ageMs)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={panelStyle}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Governance Evidence</h2>
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {Object.entries(report.thesisAlignment || {}).map(([key, value]) => (
            <div key={key} style={{ color: value ? "#0f9d58" : "#dc2626" }}>
              {key}: {String(value)}
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 14, color: "#4b5563" }}>
          Summary generated at: {summary.generatedAt || "Not generated yet"}
        </div>

        <div>
          <strong>Recent Governance Violations</strong>
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {(report.recentViolations || []).length === 0 && (
              <div style={{ color: "#6b7280" }}>No violations after latest successful flow.</div>
            )}
            {(report.recentViolations || []).map((violation: any, index: number) => (
              <div
                key={`${violation.at}-${index}`}
                style={{
                  borderLeft: `4px solid ${statusColor("failed")}`,
                  background: "#fff7ed",
                  padding: "10px 12px",
                  borderRadius: 6
                }}
              >
                <div style={{ fontWeight: 600 }}>{violation.type}</div>
                <div>{violation.message}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{violation.at}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
