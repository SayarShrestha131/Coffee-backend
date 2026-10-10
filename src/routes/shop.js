const express = require('express');
const Cart = require('../models/Cart');
const Favorite = require('../models/Favorite');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const PROMOS = {
  COFFEE20: { discountPercent: 20, description: '20% Off Your Entire Order' },
  WELCOME5: { discountFlat: 2.5, description: '$2.50 Off Welcome Discount' },
  CAFEGOLD: { discountPercent: 15, description: '15% Off Gold Member Benefit' },
};

const money = (value) => Number(value.toFixed(2));
const itemKey = (item) =>
  [item.productId, item.sizeId, item.ice, item.sweetness, item.milkId || '', [...item.toppingIds].sort().join('_')].join('-');
const findChoice = (choices, id) => choices.find((choice) => choice.id === id);

const hydrateCart = async (cart) => {
  const products = await Product.find({ _id: { $in: cart.items.map((item) => item.productId) } }).lean();
  const productMap = new Map(products.map((product) => [product._id, product]));
  const items = cart.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) return null;
    const size = findChoice(product.sizes, item.sizeId);
    const milk = item.milkId ? findChoice(product.milks, item.milkId) : null;
    const toppings = item.toppingIds.map((id) => findChoice(product.toppings, id)).filter(Boolean);
    const unitPrice = money(
      product.price +
        (size?.extraPrice || 0) +
        (milk?.extraPrice || 0) +
        toppings.reduce((sum, topping) => sum + (topping.price || 0), 0)
    );
    return {
      id: itemKey(item),
      itemKey: itemKey(item),
      product: { id: product._id, name: product.name, image: product.image, category: product.category },
      size,
      ice: item.ice,
      sweetness: item.sweetness,
      milk,
      toppings,
      unitPrice,
      quantity: item.quantity,
    };
  });
  return {
    items: items.filter(Boolean),
    appliedPromo: cart.promoCode ? { code: cart.promoCode, ...PROMOS[cart.promoCode] } : null,
    deliveryType: cart.deliveryType,
  };
};

const loadCart = async (userId) => {
  let cart = await Cart.findOne({ userId });
  if (!cart) cart = await Cart.create({ userId });
  return cart;
};

router.use(requireAuth);

router.get('/products', async (req, res) => {
  const products = await Product.find().sort({ _id: 1 }).lean();
  return res.json({ products });
});

router.get('/cart', async (req, res) => {
  try {
    return res.json(await hydrateCart(await loadCart(req.userId)));
  } catch (error) {
    console.error('Cart load failed:', error);
    return res.status(500).json({ message: 'Unable to load your cart.' });
  }
});

router.put('/cart', async (req, res) => {
  try {
    const incoming = req.body.items;
    if (!Array.isArray(incoming) || incoming.length > 50) {
      return res.status(400).json({ message: 'Cart must contain no more than 50 item types.' });
    }
    const productIds = [...new Set(incoming.map((item) => String(item.productId || '')))];
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = new Map(products.map((product) => [product._id, product]));
    const byKey = new Map();

    for (const item of incoming) {
      const productId = String(item.productId || '');
      const product = productMap.get(productId);
      const quantity = Number(item.quantity);
      const sizeId = String(item.sizeId || '');
      const ice = String(item.ice || '');
      const sweetness = String(item.sweetness || '');
      const milkId = item.milkId ? String(item.milkId) : null;
      const toppingIds = Array.isArray(item.toppingIds) ? [...new Set(item.toppingIds.map(String))] : [];
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({ message: 'A cart item or quantity is invalid.' });
      }
      if (!findChoice(product.sizes, sizeId) || !product.iceLevels.includes(ice) || !product.sweetnessLevels.includes(sweetness)) {
        return res.status(400).json({ message: `Invalid customizations for ${product.name}.` });
      }
      if ((milkId && !findChoice(product.milks, milkId)) || toppingIds.some((id) => !findChoice(product.toppings, id))) {
        return res.status(400).json({ message: `Invalid add-ons for ${product.name}.` });
      }

      const safeItem = { productId, sizeId, ice, sweetness, milkId, toppingIds, quantity };
      const key = itemKey(safeItem);
      const previous = byKey.get(key);
      if (previous && previous.quantity + quantity > 99) {
        return res.status(400).json({ message: 'The maximum quantity for an item is 99.' });
      }
      byKey.set(key, { ...safeItem, quantity: (previous?.quantity || 0) + quantity });
    }

    const promoCode = req.body.promoCode ? String(req.body.promoCode).toUpperCase() : null;
    if (promoCode && !PROMOS[promoCode]) return res.status(400).json({ message: 'That promo code is not valid.' });
    const deliveryType = req.body.deliveryType || 'delivery';
    if (!['delivery', 'pickup'].includes(deliveryType)) {
      return res.status(400).json({ message: 'Choose delivery or pickup.' });
    }

    const cart = await loadCart(req.userId);
    cart.items = [...byKey.values()];
    cart.promoCode = promoCode;
    cart.deliveryType = deliveryType;
    await cart.save();
    return res.json(await hydrateCart(cart));
  } catch (error) {
    console.error('Cart update failed:', error);
    return res.status(500).json({ message: 'Unable to save your cart.' });
  }
});

router.get('/favorites', async (req, res) => {
  const favorites = await Favorite.findOne({ userId: req.userId });
  return res.json({ productIds: favorites?.productIds || [] });
});

router.put('/favorites', async (req, res) => {
  try {
    const productIds = [...new Set((Array.isArray(req.body.productIds) ? req.body.productIds : []).map(String))];
    if (productIds.length > 100) return res.status(400).json({ message: 'Too many saved products.' });
    const count = await Product.countDocuments({ _id: { $in: productIds } });
    if (count !== productIds.length) return res.status(400).json({ message: 'One or more products could not be found.' });
    const favorites = await Favorite.findOneAndUpdate(
      { userId: req.userId },
      { $set: { productIds } },
      { new: true, upsert: true, runValidators: true }
    );
    return res.json({ productIds: favorites.productIds });
  } catch (error) {
    console.error('Favorites update failed:', error);
    return res.status(500).json({ message: 'Unable to save favorites.' });
  }
});

router.get('/orders', async (req, res) => {
  const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
  return res.json({ orders });
});

router.post('/orders', async (req, res) => {
  const session = await Order.startSession();
  try {
    const cart = await loadCart(req.userId);
    if (cart.items.length === 0) return res.status(400).json({ message: 'Your cart is empty.' });

    const { items, appliedPromo } = await hydrateCart(cart);
    const subtotal = money(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
    const discount = appliedPromo
      ? money(appliedPromo.discountPercent
        ? subtotal * appliedPromo.discountPercent / 100
        : Math.min(subtotal, appliedPromo.discountFlat))
      : 0;
    const deliveryFee = cart.deliveryType === 'pickup' || subtotal > 25 ? 0 : 2;
    const serviceTax = money(subtotal * 0.08);
    const tip = Number(req.body.tip || 0);
    if (!Number.isFinite(tip) || tip < 0 || tip > 100) return res.status(400).json({ message: 'Tip amount is invalid.' });
    const paymentMethod = String(req.body.paymentMethod || '');
    if (!['Apple Pay', 'Visa •••• 4242', 'Café Bliss Wallet', 'Cash on Hand'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Choose a supported payment method.' });
    }
    const address = String(req.body.address || '').trim();
    const note = String(req.body.note || '').trim();
    if (address.length > 250 || note.length > 500) {
      return res.status(400).json({ message: 'Address or special instructions exceed the allowed length.' });
    }
    if (cart.deliveryType === 'delivery' && !address) {
      return res.status(400).json({ message: 'Enter a delivery address.' });
    }
    const total = money(Math.max(0, subtotal - discount + deliveryFee + serviceTax + tip));
    let order;
    let account;
    await session.withTransaction(async () => {
      [order] = await Order.create([{
        userId: req.userId,
        orderId: `CF-${Date.now().toString(36).toUpperCase()}`,
        items,
        subtotal,
        discount,
        deliveryFee,
        serviceTax,
        tip,
        total,
        deliveryType: cart.deliveryType,
        address: cart.deliveryType === 'pickup' ? '' : address,
        paymentMethod,
        note,
        promoCode: cart.promoCode,
      }], { session });
      cart.items = [];
      cart.promoCode = null;
      await cart.save({ session });
      account = await User.findById(req.userId).session(session);
      if (!account) throw new Error('Account no longer exists.');
      account.ordersCount += 1;
      account.rewardPoints += Math.floor(total);
      if (cart.deliveryType === 'delivery') account.savedAddress = address;
      await account.save({ session });
    });
    return res.status(201).json({
      order,
      user: {
        rewardPoints: account.rewardPoints,
        ordersCount: account.ordersCount,
        savedAddress: account.savedAddress,
      },
    });
  } catch (error) {
    console.error('Order creation failed:', error);
    return res.status(500).json({ message: 'Unable to place your order. Your cart has not been cleared.' });
  } finally {
    await session.endSession();
  }
});

module.exports = router;
