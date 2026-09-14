

const orderId1 = "8a5bc1a4-4ba0-4c0f-ad0b-8a3383190452";
const orderId2 = "02535969-12b8-4a88-b910-862c72e7c478";

async function checkout(orderId) {
  const res = await fetch(`http://localhost:5000/orders/${orderId}/checkout`, {
    method: 'POST',
  });
  const data = await res.json();
  console.log(`Order ${orderId}:`, res.status, data);
}

Promise.all([checkout(orderId1), checkout(orderId2)]);