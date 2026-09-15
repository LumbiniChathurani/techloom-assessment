import { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'https://techloom-pos-backend.onrender.com';

function App() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [log, setLog] = useState('');

  const loadProducts = async () => {
    const res = await axios.get(`${API}/products`, { params: { search, available: 'true' } });
    setProducts(res.data);
  };

  const loadOrders = async () => {
    const res = await axios.get(`${API}/orders`);
    setOrders(res.data);
  };

  useEffect(() => { loadProducts(); }, [search]);
  useEffect(() => { loadOrders(); }, []);

  const addToCart = (product) => {
    setCart((c) => [...c, { productId: product.id, name: product.name, quantity: 1 }]);
  };

  const checkout = async (outcome) => {
    if (cart.length === 0) return setLog('Cart is empty.');
    try {
      setLog('Creating order...');
      const orderRes = await axios.post(`${API}/orders`, {
        items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        idempotencyKey: `checkout-${Date.now()}-${Math.random()}`,
      });
      const orderId = orderRes.data.id;

      setLog((l) => l + `\nOrder ${orderId} created. Reserving stock...`);
      await axios.post(`${API}/orders/${orderId}/checkout`);

      setLog((l) => l + `\nPaying (${outcome})...`);
      const payRes = await axios.post(`${API}/orders/${orderId}/pay`, { outcome });

      setLog((l) => l + `\nDone: ${JSON.stringify(payRes.data)}`);
      setCart([]);
      await loadProducts();
      await loadOrders();
    } catch (err) {
      setLog((l) => l + `\nERROR: ${err.response?.data?.error || err.message}`);
    }
  };

  const refund = async (orderId) => {
    try {
      const res = await axios.post(`${API}/orders/${orderId}/refund`);
      setLog(`Refunded: ${JSON.stringify(res.data)}`);
      await loadOrders();
    } catch (err) {
      setLog(`ERROR: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 1000, margin: '40px auto', padding: 20 }}>
      <h1>Storefront — Task 02</h1>

      <input
        placeholder="Search products..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: 8, width: 300, marginBottom: 20 }}
      />

      <h2>Products</h2>
      <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap' }}>
        {products.map((p) => (
          <div key={p.id} style={{ border: '1px solid #ccc', padding: 15, width: 200 }}>
            <strong>{p.name}</strong>
            <p>{(p.price / 100).toFixed(2)} — Stock: {p.stock}</p>
            <button onClick={() => addToCart(p)}>Add to Cart</button>
          </div>
        ))}
      </div>

      <h2>Cart ({cart.length})</h2>
      <ul>
        {cart.map((c, i) => <li key={i}>{c.name} x{c.quantity}</li>)}
      </ul>
      <button onClick={() => checkout('success')}>Checkout (success)</button>{' '}
      <button onClick={() => checkout('failure')}>Checkout (failure)</button>{' '}
      <button onClick={() => checkout('timeout')}>Checkout (timeout)</button>

      <h2>Order History</h2>
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th>ID</th><th>Status</th><th>Total</th><th>Action</th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.id.slice(0, 8)}...</td>
              <td>{o.status}</td>
              <td>{(o.totalPrice / 100).toFixed(2)}</td>
              <td>
                {o.status === 'PAID' && <button onClick={() => refund(o.id)}>Refund</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Activity Log</h2>
      <pre style={{ background: '#f0f0f0', padding: 15, whiteSpace: 'pre-wrap' }}>{log || 'No activity yet.'}</pre>
    </div>
  );
}

export default App;