const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const { sendCode } = require('../utils/email');

const router = express.Router();
const CODE_EXPIRY_MS = 10 * 60 * 1000;
const useDevelopmentVerificationCode = () =>
  process.env.NODE_ENV === 'development' && process.env.DEV_EMAIL_CODE === 'true';
const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  savedAddress: user.savedAddress,
  rewardPoints: user.rewardPoints,
  ordersCount: user.ordersCount,
  memberTier: 'Coffee Club Member',
  avatar: '',
});
const issueToken = (user) => jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const createCode = () => crypto.randomInt(100000, 1000000).toString();
const hashCode = (code) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(code).digest('hex');
const matchesCode = (code, storedHash) => {
  if (!/^\d{6}$/.test(code) || !storedHash) return false;
  return crypto.timingSafeEqual(Buffer.from(hashCode(code), 'hex'), Buffer.from(storedHash, 'hex'));
};

const sendError = (res, error) => {
  if (error.status) return res.status(error.status).json({ message: error.message });
  if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
  console.error('Authentication request failed:', error);
  return res.status(500).json({ message: 'Unable to complete the request right now.' });
};

router.post('/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const password = String(req.body.password || '');
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ message: 'Enter a valid name and email, and use a password between 8 and 72 bytes.' });
    }

    const existing = await User.findOne({ email }).select('+passwordHash +verificationCodeHash +verificationCodeExpiresAt');
    if (existing?.emailVerified) return res.status(409).json({ message: 'An account with this email already exists.' });

    const code = createCode();
    const values = {
      name,
      email,
      phone,
      passwordHash: await bcrypt.hash(password, 12),
      emailVerified: false,
      verificationCodeHash: hashCode(code),
      verificationCodeExpiresAt: new Date(Date.now() + CODE_EXPIRY_MS),
    };
    const user = existing ? Object.assign(existing, values) : new User(values);
    await user.save();
    if (useDevelopmentVerificationCode()) {
      return res.status(201).json({
        email,
        message: 'Use the development verification code shown in the app.',
        verificationCode: code,
      });
    }
    await sendCode(email, code, 'verification');
    return res.status(201).json({ email, message: 'A verification code was sent to your email.' });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email }).select('+verificationCodeHash +verificationCodeExpiresAt');
    if (!user || user.emailVerified) return res.status(404).json({ message: 'No account needs verification for that email.' });
    const code = createCode();
    user.verificationCodeHash = hashCode(code);
    user.verificationCodeExpiresAt = new Date(Date.now() + CODE_EXPIRY_MS);
    await user.save();
    if (useDevelopmentVerificationCode()) {
      return res.json({
        message: 'Use the development verification code shown in the app.',
        verificationCode: code,
      });
    }
    await sendCode(email, code, 'verification');
    return res.json({ message: 'A new verification code was sent.' });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '');
    const user = await User.findOne({ email }).select('+verificationCodeHash +verificationCodeExpiresAt');
    if (!user || !user.verificationCodeHash || user.verificationCodeExpiresAt < new Date()) {
      return res.status(400).json({ message: 'The verification code is invalid or expired. Request a new code.' });
    }
    if (!matchesCode(code, user.verificationCodeHash)) {
      return res.status(400).json({ message: 'The verification code is incorrect.' });
    }
    user.emailVerified = true;
    user.verificationCodeHash = undefined;
    user.verificationCodeExpiresAt = undefined;
    await user.save();
    return res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    if (!user.emailVerified) return res.status(403).json({ message: 'Verify your email before signing in.' });
    return res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email }).select('+resetCodeHash +resetCodeExpiresAt');
    if (user) {
      const code = createCode();
      user.resetCodeHash = hashCode(code);
      user.resetCodeExpiresAt = new Date(Date.now() + CODE_EXPIRY_MS);
      await user.save();
      await sendCode(email, code, 'password reset');
    }
    return res.json({ message: 'If an account exists for this email, a password reset code has been sent.' });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '');
    const password = String(req.body.password || '');
    if (Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ message: 'Use a password between 8 and 72 bytes.' });
    }
    const user = await User.findOne({ email }).select('+passwordHash +resetCodeHash +resetCodeExpiresAt');
    if (!user || !user.resetCodeHash || user.resetCodeExpiresAt < new Date() || !matchesCode(code, user.resetCodeHash)) {
      return res.status(400).json({ message: 'The reset code is invalid or expired.' });
    }
    user.passwordHash = await bcrypt.hash(password, 12);
    user.resetCodeHash = undefined;
    user.resetCodeExpiresAt = undefined;
    await user.save();
    return res.json({ message: 'Password changed. You can now sign in.' });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ message: 'Account no longer exists.' });
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return sendError(res, error);
  }
});

router.patch('/me', requireAuth, async (req, res) => {
  try {
    const updates = {};
    if (typeof req.body.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body.phone === 'string') updates.phone = req.body.phone.trim();
    if (typeof req.body.savedAddress === 'string') updates.savedAddress = req.body.savedAddress.trim();
    const user = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
