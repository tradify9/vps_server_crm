const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Your email
    pass: process.env.EMAIL_PASS, // Your email app password
  },
});

const sendNotificationEmail = async (recipientEmail, subject, message) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: recipientEmail,
    subject: subject,
    text: message,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully to', recipientEmail);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

module.exports = { sendNotificationEmail };