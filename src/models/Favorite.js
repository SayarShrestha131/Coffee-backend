const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    productIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Favorite', favoriteSchema);
