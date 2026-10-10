const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    sizeId: { type: String, required: true },
    ice: { type: String, required: true },
    sweetness: { type: String, required: true },
    milkId: { type: String, default: null },
    toppingIds: { type: [String], default: [] },
    quantity: { type: Number, required: true, min: 1, max: 99 },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
    promoCode: { type: String, default: null },
    deliveryType: { type: String, enum: ['delivery', 'pickup'], default: 'delivery' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cart', cartSchema);
