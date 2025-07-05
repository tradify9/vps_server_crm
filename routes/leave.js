const express = require('express');
const router = express.Router();
const Leave = require('../models/Leave');
const auth = require('../middleware/auth');

router.post('/', auth, async (req, res) => {
  const { startDate, endDate, reason } = req.body;
  try {
    const leave = new Leave({
      employee: req.user.id,
      startDate,
      endDate,
      reason,
    });
    await leave.save();
    res.json(leave);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
  const leaves = await Leave.find().populate('employee', 'employeeId name');
  res.json(leaves);
});

router.get('/my-leaves', auth, async (req, res) => {
  const leaves = await Leave.find({ employee: req.user.id }).populate('employee', 'employeeId name');
  res.json(leaves);
});

router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
  const { status } = req.body;
  try {
    const leave = await Leave.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('employee', 'employeeId name');
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    res.json(leave);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;