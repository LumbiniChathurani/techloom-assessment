import { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'https://techloom-pos-backend.onrender.com';

function App() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [log, setLog] = useState('');

  const loadProducts = async () => {
    const res = await axios.get(`${API}/products`);
    setProducts(res.data);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const simulatePurchase = async (productId, outcome) => {
    try {
      setLog(`Creating order for ${productId}...`);
      const orderRes = await axios.post(`${API}/orders`, {
        items: [{ productId, quantity: 1 }],
        idempotencyKey: `ui-${Date.now()}-${Math.random()}`,
      });
      const orderId = orderRes.data.id;

      setLog((l) => l + `\nOrder created: ${orderId}\nReserving stock...`);
      await axios.post(`${API}/orders/${orderId}/checkout`);

      setLog((l) => l + `\nStock reserved. Paying (${outcome})...`);
      const payRes = await axios.post(`${API}/orders/${orderId}/pay`, { outcome });

      setLog((l) => l + `\nPayment outcome: ${JSON.stringify(payRes.data, null, 2)}`);
      await loadProducts();
      const ordersRes = await axios.get(`${API}/products`);
    } catch (err) {
      setLog((l) => l + `\nERROR: ${err.response?.data?.error || err.message}`);
    }
  };

  const cancelOrder = async (orderId) => {
    try {
      const res = await axios.post(`${API}/orders/${orderId}/cancel`);
      setLog(`Order cancelled: ${JSON.stringify(res.data, null, 2)}`);
      await loadProducts();
    } catch (err) {
      setLog(`ERROR: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 900, margin: '40px auto', padding: 20 }}>
      <h1>POS Admin — Task 01</h1>

      <h2>Products</h2>
      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Simulate</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{(p.price / 100).toFixed(2)}</td>
              <td>{p.stock}</td>
              <td>
                <button onClick={() => simulatePurchase(p.id, 'success')}>Buy (success)</button>{' '}
                <button onClick={() => simulatePurchase(p.id, 'failure')}>Buy (failure)</button>{' '}
                <button onClick={() => simulatePurchase(p.id, 'timeout')}>Buy (timeout)</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Activity Log</h2>
      <pre style={{ background: '#f0f0f0', padding: 15, whiteSpace: 'pre-wrap', minHeight: 100 }}>
        {log || 'No activity yet.'}
      </pre>
    </div>
  );
}

export default App;