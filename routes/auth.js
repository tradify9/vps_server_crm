const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Employee = require('../models/Employee');
const Otp = require('../models/Otp');
const { sendEmail } = require('../utils/sendEmail');

router.post('/login', async (req, res) => {
  const { email, password, otp } = req.body;

  try {
    const employee = await Employee.findOne({ email });
    if (!employee) {
      return res.status(400).json({ message: 'Employee ID Not Found' });
    }

    // 🔹 If user is admin (login with password)
    if (employee.role === 'admin') {
      if (!password) {
        return res.status(400).json({ message: 'Password required for admin' });
      }

      const isMatch = await bcrypt.compare(password, employee.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // ✅ Token valid for 30 days
      const token = jwt.sign(
        { id: employee._id, role: employee.role },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.json({ token, role: employee.role });
    }

    // 🔹 If user is normal employee (login with OTP)
    else {
      // Step 1: Generate OTP
      if (!otp) {
        const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
        await Otp.create({ email, otp: generatedOtp });

        // Send OTP Email
        const subject = 'FinTradify Employee Login OTP';
        const message = `
          <div style="font-family: Arial, sans-serif; padding: 15px; background-color: #f4f4f4;">
            <h2 style="color: #2c3e50;">🔑 Your FinTradify Login OTP</h2>
            <p>Hello <strong>${employee.name || 'Employee'}</strong>,</p>
            <p>Your One-Time Password (OTP) to access the FinTradify Employee Portal is:</p>
            <div style="font-size: 22px; font-weight: bold; margin: 10px 0; color: #1abc9c;">
              ${generatedOtp}
            </div>
            <p>This OTP will expire in <strong>5 minutes</strong>. Please do not share it with anyone.</p>
            <hr />
            <p style="font-size: 12px; color: #7f8c8d;">
              If you did not request this OTP, please ignore this email or contact your administrator.
            </p>
          </div>
        `;

        await sendEmail(email, subject, message);
        return res.json({ message: 'OTP sent to email' });
      }

      // Step 2: Verify OTP
      else {
        const otpRecord = await Otp.findOne({ email, otp });
        if (!otpRecord) {
          return res.status(400).json({ message: 'Invalid OTP' });
        }

        // Delete used OTP
        await Otp.deleteOne({ email, otp });

        // ✅ Token valid for 30 days
        const token = jwt.sign(
          { id: employee._id, role: employee.role },
          process.env.JWT_SECRET,
          { expiresIn: '30d' }
        );

        return res.json({ token, role: employee.role });
      }
    }
  } catch (err) {
    console.error('❌ Server Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
