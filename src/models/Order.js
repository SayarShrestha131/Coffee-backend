const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderId: { type: String, required: true, unique: true },
    items: { type: [mongoose.Schema.Types.Mixed], required: true },
    subtotal: { type: Number, required: true },
    discount: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    serviceTax: { type: Number, required: true },
    tip: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true },
    deliveryType: { type: String, enum: ['delivery', 'pickup'], required: true },
    address: { type: String, default: '', maxlength: 250 },
    paymentMethod: { type: String, required: true },
    note: { type: String, default: '', maxlength: 500 },
    promoCode: { type: String, default: null },
    status: {
      type: String,
      enum: ['Order Placed', 'Brewing', 'On the Way', 'Delivered', 'Cancelled'],
      default: 'Order Placed',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
