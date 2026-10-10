const mongoose = require('mongoose');

const pricedChoiceSchema = new mongoose.Schema(
  { id: String, name: String, extraPrice: Number, price: Number },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    _id: { type: String },
    name: { type: String, required: true },
    category: { type: String, required: true },
    image: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    sizes: [pricedChoiceSchema],
    iceLevels: [String],
    sweetnessLevels: [String],
    milks: [pricedChoiceSchema],
    toppings: [pricedChoiceSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
