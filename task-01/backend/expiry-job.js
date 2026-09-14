const cron = require('node-cron');
const prisma = require('./db');

async function releaseExpiredReservations() {
  const expired = await prisma.reservation.findMany({
    where: {
      active: true,
      expiresAt: { lt: new Date() },
    },
  });

  for (const reservation of expired) {
    await prisma.$transaction(async (tx) => {
      // Restore stock
      await tx.product.update({
        where: { id: reservation.productId },
        data: { stock: { increment: reservation.quantity } },
      });

      // Mark reservation inactive
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { active: false },
      });

      // Mark the order as EXPIRED (only if it's still RESERVED)
      await tx.order.updateMany({
        where: { id: reservation.orderId, status: 'RESERVED' },
        data: { status: 'EXPIRED' },
      });
    });

    console.log(`Released expired reservation ${reservation.id}`);
  }
}

// Run every 30 seconds
cron.schedule('*/30 * * * * *', releaseExpiredReservations);

module.exports = releaseExpiredReservations;