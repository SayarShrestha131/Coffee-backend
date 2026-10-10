require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const catalog = require('./catalog');

const seed = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  for (const product of catalog) {
    await Product.updateOne({ _id: product._id }, { $set: product }, { upsert: true });
  }
  console.log(`Seeded ${catalog.length} products.`);
  await mongoose.disconnect();
};

seed().catch(async (error) => {
  console.error('Product seeding failed:', error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
