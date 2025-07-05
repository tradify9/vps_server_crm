const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const SalarySlip = require('../models/SalarySlip');
const auth = require('../middleware/auth');
const { createObjectCsvStringifier } = require('csv-writer');

router.post('/punch', auth, async (req, res) => {
  const { type } = req.body;
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const existingAttendance = await Attendance.findOne({
      employee: req.user.id,
      date: { $gte: todayStart, $lte: todayEnd },
    });

    if (type === 'in') {
      if (existingAttendance && existingAttendance.punchIn) {
        return res.status(400).json({ message: 'Already punched in today' });
      }
      const attendance = new Attendance({
        employee: req.user.id,
        date: new Date(),
        punchIn: new Date(),
      });
      await attendance.save();
      res.json({ message: 'Punch-in recorded', attendance });
    } else if (type === 'out') {
      if (!existingAttendance) {
        return res.status(400).json({ message: 'No punch-in record found for today' });
      }
      if (existingAttendance.punchOut) {
        return res.status(400).json({ message: 'Already punched out today' });
      }
      existingAttendance.punchOut = new Date();
      await existingAttendance.save();
      res.json({ message: 'Punch-out recorded', attendance: existingAttendance });
    } else {
      return res.status(400).json({ message: 'Invalid punch type' });
    }
  } catch (err) {
    console.error('Punch error:', err);
    res.status(500).json({ message: 'Server error while recording punch' });
  }
});

router.get('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
  const { startDate, endDate } = req.query;
  const query = startDate && endDate
    ? { date: { $gte: new Date(startDate), $lte: new Date(endDate) } }
    : {};
  try {
    const attendances = await Attendance.find(query).populate('employee', 'employeeId name');
    res.json(attendances);
  } catch (err) {
    console.error('Fetch attendance error:', err);
    res.status(500).json({ message: 'Server error while fetching attendance' });
  }
});

router.get('/my-attendance', auth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const query = {
    employee: req.user.id,
    ...(startDate && endDate && {
      date: { $gte: new Date(startDate), $lte: new Date(endDate) },
    }),
  };
  try {
    const attendances = await Attendance.find(query).populate('employee', 'employeeId name');
    res.json(attendances);
  } catch (err) {
    console.error('Fetch my-attendance error:', err);
    res.status(500).json({ message: 'Server error while fetching your attendance' });
  }
});

router.get('/overview', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
  try {
    const attendances = await Attendance.find()
      .populate('employee', 'employeeId name')
      .sort({ date: -1 });
    const overview = attendances.reduce((acc, att) => {
      const date = new Date(att.date).toISOString().split('T')[0];
      if (!acc[date]) acc[date] = [];
      const hoursWorked = att.punchOut && att.punchIn
        ? ((new Date(att.punchOut) - new Date(att.punchIn)) / 1000 / 60 / 60).toFixed(2)
        : '0.00';
      acc[date].push({
        employeeId: att.employee.employeeId,
        name: att.employee.name,
        punchIn: att.punchIn ? new Date(att.punchIn).toLocaleTimeString('en-IN') : '-',
        punchOut: att.punchOut ? new Date(att.punchOut).toLocaleTimeString('en-IN') : '-',
        hoursWorked,
      });
      return acc;
    }, {});
    res.json(overview);
  } catch (err) {
    console.error('Fetch overview error:', err);
    res.status(500).json({ message: 'Server error while fetching attendance overview' });
  }
});

router.get('/download', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'Start date and end date are required' });
  }
  try {
    const attendances = await Attendance.find({
      date: { $gte: new Date(startDate), $lte: new Date(endDate) },
    }).populate('employee', 'employeeId name');

    if (!attendances.length) {
      return res.status(404).json({ message: 'No attendance records found for the selected date range' });
    }

    // Fetch salary slips for the date range to get hourly rates
    const salarySlips = await SalarySlip.find({
      month: { $gte: startDate.slice(0, 7), $lte: endDate.slice(0, 7) },
    }).populate('employee', '_id');

    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'employeeId', title: 'Employee ID' },
        { id: 'name', title: 'Name' },
        { id: 'date', title: 'Date' },
        { id: 'punchIn', title: 'Punch In' },
        { id: 'punchOut', title: 'Punch Out' },
        { id: 'hoursWorked', title: 'Hours Worked' },
        { id: 'hourlyRate', title: 'Hourly Rate (₹)' },
        { id: 'totalSalary', title: 'Total Salary (₹)' },
      ],
    });

    const records = attendances.map(att => {
      const hoursWorked = att.punchOut && att.punchIn
        ? ((new Date(att.punchOut) - new Date(att.punchIn)) / 1000 / 60 / 60).toFixed(2)
        : '0.00';
      const dateMonth = new Date(att.date).toISOString().slice(0, 7);
      const salarySlip = salarySlips.find(
        slip => slip.employee._id.toString() === att.employee._id.toString() && slip.month === dateMonth
      );
      const hourlyRate = salarySlip ? (salarySlip.amount / salarySlip.hoursWorked).toFixed(2) : '100.00';
      const totalSalary = (hoursWorked * hourlyRate).toFixed(2);

      return {
        employeeId: att.employee?.employeeId || 'N/A',
        name: att.employee?.name || 'N/A',
        date: new Date(att.date).toLocaleDateString('en-IN'),
        punchIn: att.punchIn ? new Date(att.punchIn).toLocaleTimeString('en-IN') : '-',
        punchOut: att.punchOut ? new Date(att.punchOut).toLocaleTimeString('en-IN') : '-',
        hoursWorked,
        hourlyRate,
        totalSalary,
      };
    });

    const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=attendance-${startDate}-${endDate}.csv`);
    res.send('\ufeff' + csvContent); // Add UTF-8 BOM for proper encoding
  } catch (err) {
    console.error('Download CSV error:', err);
    res.status(500).json({ message: 'Server error while downloading CSV' });
  }
});

router.get('/download/my-attendance', auth, async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'Start date and end date are required' });
  }
  try {
    const attendances = await Attendance.find({
      employee: req.user.id,
      date: { $gte: new Date(startDate), $lte: new Date(endDate) },
    }).populate('employee', 'employeeId name');

    if (!attendances.length) {
      return res.status(404).json({ message: 'No attendance records found for the selected date range' });
    }

    // Fetch salary slips for the date range
    const salarySlips = await SalarySlip.find({
      employee: req.user.id,
      month: { $gte: startDate.slice(0, 7), $lte: endDate.slice(0, 7) },
    });

    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'employeeId', title: 'Employee ID' },
        { id: 'name', title: 'Name' },
        { id: 'date', title: 'Date' },
        { id: 'punchIn', title: 'Punch In' },
        { id: 'punchOut', title: 'Punch Out' },
        { id: 'hoursWorked', title: 'Hours Worked' },
        { id: 'hourlyRate', title: 'Hourly Rate (₹)' },
        { id: 'totalSalary', title: 'Total Salary (₹)' },
      ],
    });

    const records = attendances.map(att => {
      const hoursWorked = att.punchOut && att.punchIn
        ? ((new Date(att.punchOut) - new Date(att.punchIn)) / 1000 / 60 / 60).toFixed(2)
        : '0.00';
      const dateMonth = new Date(att.date).toISOString().slice(0, 7);
      const salarySlip = salarySlips.find(slip => slip.month === dateMonth);
      const hourlyRate = salarySlip ? (salarySlip.amount / salarySlip.hoursWorked).toFixed(2) : '100.00';
      const totalSalary = (hoursWorked * hourlyRate).toFixed(2);

      return {
        employeeId: att.employee?.employeeId || 'N/A',
        name: att.employee?.name || 'N/A',
        date: new Date(att.date).toLocaleDateString('en-IN'),
        punchIn: att.punchIn ? new Date(att.punchIn).toLocaleTimeString('en-IN') : '-',
        punchOut: att.punchOut ? new Date(att.punchOut).toLocaleTimeString('en-IN') : '-',
        hoursWorked,
        hourlyRate,
        totalSalary,
      };
    });

    const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=attendance-${startDate}-${endDate}.csv`);
    res.send('\ufeff' + csvContent); // Add UTF-8 BOM for proper encoding
  } catch (err) {
    console.error('Download my-attendance CSV error:', err);
    res.status(500).json({ message: 'Server error while downloading your attendance CSV' });
  }
});

module.exports = router;