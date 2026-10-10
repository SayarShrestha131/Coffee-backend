const nodemailer = require('nodemailer');

const isConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

const sendCode = async (email, code, purpose) => {
  if (!isConfigured()) {
    const error = new Error('Email delivery is not configured. Set the SMTP settings in backend/.env.');
    error.status = 503;
    throw error;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: purpose === 'verification' ? 'Verify your Café Bliss account' : 'Reset your Café Bliss password',
      text: `Your Café Bliss ${purpose === 'verification' ? 'verification' : 'password reset'} code is ${code}. It expires in 10 minutes.`,
    });
  } catch (error) {
    console.error('Verification email delivery failed:', error.code || error.name);
    const message = error.code === 'EAUTH'
      ? 'Email delivery was rejected by the SMTP provider. Check SMTP_USER and SMTP_PASSWORD in backend/.env, then retry with the same email.'
      : 'Email delivery failed. Check the SMTP settings in backend/.env, then retry with the same email.';
    const deliveryError = new Error(message);
    deliveryError.status = 503;
    throw deliveryError;
  }
};

module.exports = { sendCode };
