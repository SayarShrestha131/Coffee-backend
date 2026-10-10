require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const shopRoutes = require('./routes/shop');
const Product = require('./models/Product');
const catalog = require('./catalog');

const start = async () => {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in backend/.env.');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('Set JWT_SECRET in backend/.env to a random string of at least 32 characters.');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  for (const product of catalog) {
    await Product.updateOne({ _id: product._id }, { $set: product }, { upsert: true });
  }

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.APP_ORIGIN || '*' }));
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 }));
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }), authRoutes);
  app.use('/api', shopRoutes);
  app.use((req, res) => res.status(404).json({ message: 'API route not found.' }));
  app.use((error, req, res, next) => {
    console.error('Unhandled API error:', error);
    return res.status(500).json({ message: 'Unexpected server error.' });
  });

  const port = Number(process.env.PORT || 4000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Café Bliss API listening on port ${port}.`);
    console.log(`Seeded ${catalog.length} catalog products.`);
  });
};

start().catch(async (error) => {
  console.error('API startup failed:', error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
