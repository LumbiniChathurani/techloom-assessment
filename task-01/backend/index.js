const express = require('express');
const cors = require('cors');
require('dotenv').config();
require('./expiry-job');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5000;

const prisma = require('./db');

// Create a product
app.post('/products', async (req, res) => {
    try {
      const { name, price, stock, category } = req.body;
      const product = await prisma.product.create({
        data: { name, price, stock, category },
      });
      res.status(201).json(product);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  
  // List all products (with live stock)
  app.get('/products', async (req, res) => {
    const { search, category, minPrice, maxPrice, available } = req.query;
    const where = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (category) where.category = category;
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = Number(minPrice);
      if (maxPrice) where.price.lte = Number(maxPrice);
    }
    if (available === 'true') where.stock = { gt: 0 };
  
    const products = await prisma.product.findMany({ where });
    res.json(products);
  });
  
  // Get a single product
  app.get('/products/:id', async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  });
  
  // Update a product
  app.put('/products/:id', async (req, res) => {
    try {
      const { name, price, stock, category } = req.body;
      const product = await prisma.product.update({
        where: { id: req.params.id },
        data: { name, price, stock, category },
      });
      res.json(product);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  
  // Delete a product
  app.delete('/products/:id', async (req, res) => {
    try {
      await prisma.product.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Create an order from a cart (array of {productId, quantity})
app.post('/orders', async (req, res) => {
    try {
      const { items, idempotencyKey } = req.body; // [{ productId, quantity }, ...]
  
      if (!items || items.length === 0) {
        return res.status(400).json({ error: 'No items provided' });
      }
  
      // Fetch all requested products
      const productIds = items.map((i) => i.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
      });
  
      // Validate stock for each item
      for (const item of items) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) {
          return res.status(404).json({ error: `Product ${item.productId} not found` });
        }
        if (product.stock < item.quantity) {
          return res.status(400).json({
            error: `Insufficient stock for ${product.name}. Available: ${product.stock}, requested: ${item.quantity}`,
          });
        }
      }
  
      // Calculate total price
      let totalPrice = 0;
      const orderItemsData = items.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        totalPrice += product.price * item.quantity;
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: product.price,
        };
      });
  
      // Create the order (status defaults to PENDING)
  // If an idempotencyKey was provided, check for an existing order with it first
if (idempotencyKey) {
  const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return res.status(200).json(existing); // return the original order, don't create a duplicate
  }
}

const order = await prisma.order.create({
  data: {
    totalPrice,
    idempotencyKey: idempotencyKey || undefined,
    items: { create: orderItemsData },
  },
  include: { items: true },
});
  
      res.status(201).json(order);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/orders', async (req, res) => {
    const orders = await prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  });

  // Enter checkout: reserve stock for an existing order
  app.post('/orders/:id/checkout', async (req, res) => {
    const { id: orderId } = req.params;
  
    try {
      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });
  
        if (!order) throw new Error('Order not found');
        if (order.status !== 'PENDING') {
          throw new Error(`Order is not in PENDING state (current: ${order.status})`);
        }
  
        for (const item of order.items) {
          const [product] = await tx.$queryRaw`
            SELECT * FROM "Product" WHERE id = ${item.productId} FOR UPDATE
          `;
  
          if (!product || product.stock < item.quantity) {
            throw new Error(`Insufficient stock for product ${item.productId}`);
          }
  
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
  
          await tx.reservation.create({
            data: {
              orderId: order.id,
              productId: item.productId,
              quantity: item.quantity,
              expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            },
          });
        }
  
        return tx.order.update({
          where: { id: order.id },
          data: { status: 'RESERVED' },
          include: { items: true, reservations: true },
        });
      }, {
        maxWait: 10000,
        timeout: 15000,
      });
  
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Mock payment gateway
app.post('/orders/:id/pay', async (req, res) => {
  const { id: orderId } = req.params;
  const { outcome } = req.body; // 'success' | 'failure' | 'timeout' — for testing control

  try {
    // Pick outcome: use provided value for testing, or randomize if not provided
    const result = outcome || ['success', 'failure', 'timeout'][Math.floor(Math.random() * 3)];

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status !== 'RESERVED') {
      return res.status(400).json({
        error: `Cannot pay for an order in status ${order.status}. Order must be RESERVED.`,
      });
    }

    if (result === 'success') {
      const updated = await prisma.order.update({
        where: { id: orderId },
        data: { status: 'PAID' },
      });
      // Stock stays decremented — sale is final. Mark reservations inactive (consumed).
      await prisma.reservation.updateMany({
        where: { orderId, active: true },
        data: { active: false },
      });
      return res.json({ outcome: 'success', order: updated });
    }

    if (result === 'failure') {
      return await prisma.$transaction(async (tx) => {
        const reservations = await tx.reservation.findMany({
          where: { orderId, active: true },
        });
        for (const r of reservations) {
          await tx.product.update({
            where: { id: r.productId },
            data: { stock: { increment: r.quantity } },
          });
          await tx.reservation.update({
            where: { id: r.id },
            data: { active: false },
          });
        }
        const updated = await tx.order.update({
          where: { id: orderId },
          data: { status: 'FAILED' },
        });
        return res.json({ outcome: 'failure', order: updated });
      });
    }

    // timeout — don't touch anything now; the expiry-job.js sweep will
    // naturally expire it once expiresAt passes, releasing stock then
    return res.json({ outcome: 'timeout', message: 'Payment timed out. Reservation will expire naturally.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cancel an order — restore any reserved/consumed stock
app.post('/orders/:id/cancel', async (req, res) => {
  const { id: orderId } = req.params;
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(order.status)) {
      return res.status(400).json({ error: `Order already ${order.status}` });
    }

    const result = await prisma.$transaction(async (tx) => {
      const reservations = await tx.reservation.findMany({
        where: { orderId, active: true },
      });
      for (const r of reservations) {
        await tx.product.update({
          where: { id: r.productId },
          data: { stock: { increment: r.quantity } },
        });
        await tx.reservation.update({ where: { id: r.id }, data: { active: false } });
      }
      return tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/orders/:id/refund', async (req, res) => {
  const { id: orderId } = req.params;
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!['PAID', 'CANCELLED', 'FAILED'].includes(order.status)) {
      return res.status(400).json({ error: `Cannot refund an order in status ${order.status}` });
    }
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' }, // reuse CANCELLED to represent refunded/reversed
    });
    res.json({ ...updated, refunded: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});



app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});