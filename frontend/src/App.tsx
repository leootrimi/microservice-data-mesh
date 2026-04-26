import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';

const API = 'http://localhost:3003/analytics/summary';

function App() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch(API)
      .then(res => res.json())
      .then(setData);
  }, []);

  if (!data) return <div>Loading...</div>;

  return (
    <div style={{ padding: 32 }}>
      <h1>BI Dashboard</h1>
      <div style={{ marginBottom: 24 }}>
        <strong>Total Revenue:</strong> ${data.totalRevenue}
      </div>
      <div style={{ marginBottom: 24 }}>
        <strong>Number of Orders:</strong> {data.orders.length}
      </div>
      <div style={{ marginBottom: 24 }}>
        <strong>Failed Payments:</strong> {data.failedPayments}
      </div>
      <BarChart width={500} height={300} data={data.orders} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <XAxis dataKey="orderId" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="amount" fill="#8884d8" name="Order Amount" />
      </BarChart>
      <PieChart width={400} height={300}>
        <Pie
          data={data.orders}
          dataKey="amount"
          nameKey="orderId"
          cx="50%"
          cy="50%"
          outerRadius={80}
          fill="#82ca9d"
          label
        >
          {data.orders.map((entry: any, idx: number) => (
            <Cell key={`cell-${idx}`} fill={entry.paymentStatus === 'success' ? '#82ca9d' : '#ff4d4f'} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </div>
  );
}

export default App;
