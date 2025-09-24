const express = require('express');
const router = express.Router();
const SalarySlip = require('../models/SalarySlip');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const { sendEmail } = require('../utils/sendEmail');

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
  const { employeeId, month, hourlyRate } = req.body;
  try {
    const [year, monthNum] = month.split('-');
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);

    const attendances = await Attendance.find({
      employee: employeeId,
      date: { $gte: startDate, $lte: endDate },
    });

    const totalHours = attendances.reduce((sum, att) => {
      if (att.punchIn && att.punchOut) {
        return sum + (new Date(att.punchOut) - new Date(att.punchIn)) / 1000 / 60 / 60;
      }
      return sum;
    }, 0);

    const amount = (totalHours * hourlyRate).toFixed(2);

    const salarySlip = new SalarySlip({
      employee: employeeId,
      month,
      amount,
      hoursWorked: totalHours.toFixed(2),
    });
    await salarySlip.save();

    const employee = await Employee.findById(employeeId);
    const pdfBuffer = await new Promise((resolve) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      let buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // Header with gradient background
      const gradient = doc.linearGradient(0, 0, 595, 100);
      gradient.stop(0, '#1e3a8a').stop(1, '#3b82f6');
      doc.rect(0, 0, 595, 120).fill(gradient);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(26).text('Fintradify', 40, 30);
      doc.font('Helvetica').fontSize(12).text('C6, C Block, Sector 7, Noida, UP 201301', 40, 65);
      doc.fontSize(10).text('Email: hr@fintradify.com | Phone: +91 7836009907', 40, 85);
      doc.moveDown(2);

      // Title
      doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(18).text(`Salary Slip for ${month}`, 40, 150, { align: 'center' });
      doc.moveTo(200, 170).lineTo(395, 170).lineWidth(2).strokeColor('#1e3a8a').stroke();
      doc.moveDown(2);

      // Employee Details Table
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text('Employee Details', 40, 200);
      doc.moveDown(0.5);

      // Table structure
      const tableTop = 220;
      const tableLeft = 40;
      const col1Width = 180;
      const col2Width = 355;
      const rowHeight = 30;

      // Table headers
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff');
      doc.rect(tableLeft, tableTop, col1Width, rowHeight).fill('#1e3a8a');
      doc.rect(tableLeft + col1Width, tableTop, col2Width, rowHeight).fill('#1e3a8a');
      doc.text('Field', tableLeft + 15, tableTop + 10);
      doc.text('Details', tableLeft + col1Width + 15, tableTop + 10);

      // Table rows
      doc.font('Helvetica').fontSize(10).fillColor('#111827');
      const fields = [
        ['Employee ID', employee.employeeId],
        ['Name', employee.name],
        ['Position', employee.position],
        ['Month', month],
        ['Hours Worked', totalHours.toFixed(2)],
        ['Hourly Rate', `INR ${hourlyRate.toFixed(2)}`],
        ['Total Salary', `INR ${amount}`],
        ['Date', new Date().toLocaleDateString('en-IN')]
      ];

      fields.forEach(([field, value], index) => {
        const y = tableTop + (index + 1) * rowHeight;
        doc.rect(tableLeft, y, col1Width, rowHeight).fill(index % 2 === 0 ? '#f9fafb' : '#ffffff').stroke('#d1d5db');
        doc.rect(tableLeft + col1Width, y, col2Width, rowHeight).fill(index % 2 === 0 ? '#f9fafb' : '#ffffff').stroke('#d1d5db');
        doc.fillColor('#111827').text(field, tableLeft + 15, y + 10);
        doc.text(value, tableLeft + col1Width + 15, y + 10);
      });

      // Footer with gradient
      const footerGradient = doc.linearGradient(0, 742, 595, 842);
      footerGradient.stop(0, '#1e3a8a').stop(1, '#3b82f6');
      doc.rect(0, 742, 595, 100).fill(footerGradient);
      doc.fillColor('white').font('Helvetica').fontSize(10);
      doc.text('This is a computer-generated document. No signature required.', 40, 760, { align: 'center' });
      doc.text('Fintradify | C6, C Block, Sector 7, Noida, UP 201301', 40, 780, { align: 'center' });
      doc.text('Contact: hr@fintradify.com | Phone: +91 7836009907', 40, 800, { align: 'center' });

      doc.end();
    });

    await sendEmail(
      employee.email,
      `Salary Slip for ${month}`,
      `Dear ${employee.name},\n\nPlease find your salary slip for ${month} attached.\n\nDetails:\nHours Worked: ${totalHours.toFixed(2)}\nAmount: INR ${amount}\n\nRegards,\nFintradify HR Team`,
      [{ filename: `salary-slip-${month}.pdf`, content: pdfBuffer }]
    );

    res.json(salarySlip);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/download/:id', auth, async (req, res) => {
  try {
    const salarySlip = await SalarySlip.findById(req.params.id).populate('employee');
    if (!salarySlip) return res.status(404).json({ message: 'Salary slip not found' });
    if (req.user.role !== 'admin' && req.user.id !== salarySlip.employee._id.toString())
      return res.status(403).json({ message: 'You do not have permission' });

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=salary-slip-${salarySlip.month}.pdf`);
    doc.pipe(res);

    // Header with gradient background
    const gradient = doc.linearGradient(0, 0, 595, 100);
    gradient.stop(0, '#1e3a8a').stop(1, '#3b82f6');
    doc.rect(0, 0, 595, 120).fill(gradient);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(26).text('Fintradify', 40, 30);
    doc.font('Helvetica').fontSize(12).text('C6, C Block, Sector 7, Noida, UP 201301', 40, 65);
    doc.fontSize(10).text('Email: hr@fintradify.com | Phone: +91 7836009907', 40, 85);
    doc.moveDown(2);

    // Title
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(18).text(`Salary Slip for ${salarySlip.month}`, 40, 150, { align: 'center' });
    doc.moveTo(200, 170).lineTo(395, 170).lineWidth(2).strokeColor('#1e3a8a').stroke();
    doc.moveDown(2);

    // Employee Details Table
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text('Employee Details', 40, 200);
    doc.moveDown(0.5);

    // Table structure
    const tableTop = 220;
    const tableLeft = 40;
    const col1Width = 180;
    const col2Width = 355;
    const rowHeight = 30;

    // Table headers
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff');
    doc.rect(tableLeft, tableTop, col1Width, rowHeight).fill('#1e3a8a');
    doc.rect(tableLeft + col1Width, tableTop, col2Width, rowHeight).fill('#1e3a8a');
    doc.text('Field', tableLeft + 15, tableTop + 10);
    doc.text('Details', tableLeft + col1Width + 15, tableTop + 10);

    // Table rows
    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    const fields = [
      ['Employee ID', salarySlip.employee.employeeId],
      ['Name', salarySlip.employee.name],
      ['Position', salarySlip.employee.position],
      ['Month', salarySlip.month],
      ['Hours Worked', salarySlip.hoursWorked],
      ['Hourly Rate', `INR ${(salarySlip.amount / salarySlip.hoursWorked).toFixed(2)}`],
      ['Total Salary', `INR ${salarySlip.amount}`],
      ['Date', new Date().toLocaleDateString('en-IN')]
    ];

    fields.forEach(([field, value], index) => {
      const y = tableTop + (index + 1) * rowHeight;
      doc.rect(tableLeft, y, col1Width, rowHeight).fill(index % 2 === 0 ? '#f9fafb' : '#ffffff').stroke('#d1d5db');
      doc.rect(tableLeft + col1Width, y, col2Width, rowHeight).fill(index % 2 === 0 ? '#f9fafb' : '#ffffff').stroke('#d1d5db');
      doc.fillColor('#111827').text(field, tableLeft + 15, y + 10);
      doc.text(value, tableLeft + col1Width + 15, y + 10);
    });

    // Footer with gradient
    const footerGradient = doc.linearGradient(0, 742, 595, 842);
    footerGradient.stop(0, '#1e3a8a').stop(1, '#3b82f6');
    doc.rect(0, 742, 595, 100).fill(footerGradient);
    doc.fillColor('white').font('Helvetica').fontSize(10);
    doc.text('This is a computer-generated document. No signature required.', 40, 760, { align: 'center' });
    doc.text('Fintradify | C6, C Block, Sector 7, Noida, Uttar Pradesh 201301', 40, 780, { align: 'center' });
    doc.text('Contact: hr@fintradify.com | Phone: +91 7836009907', 40, 800, { align: 'center' });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/my-slips', auth, async (req, res) => {
  try {
    const slips = await SalarySlip.find({ employee: req.user.id }).populate('employee');
    res.json(slips);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
  try {
    const slips = await SalarySlip.find().populate('employee');
    res.json(slips);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;