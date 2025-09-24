const nodemailer = require('nodemailer');

const sendEmail = async (to, subject, message, attachments = []) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"FinTradify" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      // ✅ Automatically choose html if message contains tags, else send as plain text
      [message.includes('<') ? 'html' : 'text']: message,
      attachments,
    });

    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw new Error('Email not sent');
  }
};

module.exports = { sendEmail };