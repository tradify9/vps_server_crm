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
    if (!employee) return res.status(400).json({ message: 'Invalid credentials' });

    if (employee.role === 'admin') {
      if (!password) return res.status(400).json({ message: 'Password required for admin' });
      const isMatch = await bcrypt.compare(password, employee.password);
      if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
      const token = jwt.sign({ id: employee._id, role: employee.role }, process.env.JWT_SECRET, {
        expiresIn: '1h',
      });
      return res.json({ token, role: employee.role });
    } else {
      if (!otp) {
        const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
        await Otp.create({ email, otp: generatedOtp });
        await sendEmail(email, 'Fintradify OTP', `Your OTP is: ${generatedOtp}`);
        return res.json({ message: 'OTP sent to email' });
      } else {
        const otpRecord = await Otp.findOne({ email, otp });
        if (!otpRecord) return res.status(400).json({ message: 'Invalid OTP' });
        await Otp.deleteOne({ email, otp });
        const token = jwt.sign({ id: employee._id, role: employee.role }, process.env.JWT_SECRET, {
          expiresIn: '1h',
        });
        return res.json({ token, role: employee.role });
      }
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;