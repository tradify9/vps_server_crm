const express = require('express');
const router = express.Router();
const SalarySlip = require('../models/SalarySlip');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const { sendEmail } = require('../utils/sendEmail');

/**
 * PDF Generator Function (Professional Single Page Template)
 */
const generateSalarySlipPDF = (salarySlip, employee) => {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));

    const year = new Date().getFullYear();
    const colX = [40, 200, 280, 360, 450]; // table columns

    // === Company Header ===
    doc.fillColor('#1e3a8a').fontSize(22).font('Helvetica-Bold').text('Fintradify', 40, 40);
    doc.fontSize(10).fillColor('#444').font('Helvetica')
      .text('C6, C Block, Sector 7, Noida, UP 201301', 40, 65)
      .text('Phone: +91 7836009907 | Email: hr@fintradify.com', 40, 80);

    doc.fontSize(22).fillColor('#1e3a8a').text('PAYSLIP', 450, 40);

    // === Employee Info Section (Left) ===
    doc.fillColor('#ffffff').rect(40, 110, 220, 20).fill('#3b82f6');
    doc.fillColor('#fff').fontSize(11).text('EMPLOYEE INFORMATION', 45, 115);

    doc.fillColor('#111827').font('Helvetica').fontSize(10);
    doc.text(`Name: ${employee.name}`, 40, 140);
    doc.text(`Employee ID: ${employee.employeeId}`, 40, 155);
    doc.text(`Position: ${employee.position}`, 40, 170);
    doc.text(`Email: ${employee.email}`, 40, 185);

    // === Pay Info Section (Right) ===
    const rightX = 300;
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(11);
    doc.text('PAY DATE', rightX, 110);
    doc.text('PAY TYPE', rightX + 100, 110);
    doc.text('PERIOD', rightX + 200, 110);

    doc.fillColor('#111827').font('Helvetica').fontSize(10);
    doc.text(new Date().toLocaleDateString('en-IN'), rightX, 125);
    doc.text('Monthly', rightX + 100, 125);
    doc.text(salarySlip.month, rightX + 200, 125);

    doc.fillColor('#1e3a8a').font('Helvetica-Bold').text('PAYROLL #', rightX, 150);
    doc.text('NI NUMBER', rightX + 100, 150);
    doc.text('TAX CODE', rightX + 200, 150);

    doc.fillColor('#111827').font('Helvetica').fontSize(10);
    doc.text(salarySlip._id.toString().slice(-6), rightX, 165);
    doc.text('N/A', rightX + 100, 165);
    doc.text('1250L', rightX + 200, 165);

    // === Earnings Table ===
    let tableTop = 220;
    doc.fillColor('#444').font('Helvetica-Bold').fontSize(11).text('EARNINGS', 40, tableTop);
    tableTop += 20;

    // Headers
    doc.rect(40, tableTop, 515, 20).fill('#e5e7eb');
    doc.fillColor('#111827').fontSize(10);
    doc.text('EARNINGS', colX[0] + 5, tableTop + 5);
    doc.text('HOURS', colX[1] + 5, tableTop + 5);
    doc.text('RATE', colX[2] + 5, tableTop + 5);
    doc.text('CURRENT', colX[3] + 5, tableTop + 5);
    doc.text('YTD', colX[4] + 5, tableTop + 5);
    tableTop += 20;

    // === Row: Basic Pay ===
    doc.rect(40, tableTop, 515, 20).fill('#fff').stroke('#d1d5db');
    doc.fillColor('#111827').font('Helvetica').fontSize(10);
    doc.text('Basic Pay', colX[0] + 5, tableTop + 5);
    doc.text(salarySlip.hoursWorked, colX[1] + 5, tableTop + 5);
    doc.text(`INR ${(salarySlip.amount / salarySlip.hoursWorked).toFixed(2)}`, colX[2] + 5, tableTop + 5);
    doc.text(`INR ${salarySlip.amount}`, colX[3] + 5, tableTop + 5);
    doc.text(`INR ${salarySlip.amount}`, colX[4] + 5, tableTop + 5);
    tableTop += 30;

    // === Gross Pay ===
    doc.font('Helvetica-Bold').text('GROSS PAY', colX[0] + 5, tableTop + 5);
    doc.text(`INR ${salarySlip.amount}`, colX[3] + 5, tableTop + 5);
    doc.text(`INR ${salarySlip.amount}`, colX[4] + 5, tableTop + 5);
    tableTop += 40;

    // === Net Pay Section ===
    doc.rect(40, tableTop, 515, 30).fill('#f3f4f6').stroke('#d1d5db');
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12);
    doc.text('NET PAY', colX[0] + 5, tableTop + 8);
    doc.text(`INR ${salarySlip.amount}`, colX[3] + 5, tableTop + 8);

    // === Footer ===
    doc.fontSize(9).fillColor('#6b7280').text(
      `If you have any questions about this payslip, please contact HR | © ${year} Fintradify`,
      40, 800, { align: 'center' }
    );

    doc.end();
  });
};

/**
 * @route POST /salaryslips
 * @desc Create salary slip + send email
 */
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
      if (att.punchIn && att.punchOut && new Date(att.punchOut) > new Date(att.punchIn)) {
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

    const pdfBuffer = await generateSalarySlipPDF(salarySlip, employee);

    await sendEmail(
      employee.email,
      `Salary Slip for ${month}`,
      `Dear ${employee.name},\n\nPlease find your salary slip for ${month} attached.\n\nRegards,\nFintradify HR Team`,
      [{ filename: `salary-slip-${month}.pdf`, content: pdfBuffer }]
    );

    res.json(salarySlip);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route GET /salaryslips/download/:id
 * @desc Download salary slip as PDF
 */
router.get('/download/:id', auth, async (req, res) => {
  try {
    const salarySlip = await SalarySlip.findById(req.params.id).populate('employee');
    if (!salarySlip) return res.status(404).json({ message: 'Salary slip not found' });
    if (req.user.role !== 'admin' && req.user.id !== salarySlip.employee._id.toString())
      return res.status(403).json({ message: 'You do not have permission' });

    const pdfBuffer = await generateSalarySlipPDF(salarySlip, salarySlip.employee);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=salary-slip-${salarySlip.month}.pdf`);
    res.end(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route GET /salaryslips/my-slips
 * @desc Get logged-in user's slips
 */
router.get('/my-slips', auth, async (req, res) => {
  try {
    const slips = await SalarySlip.find({ employee: req.user.id }).populate('employee');
    res.json(slips);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route GET /salaryslips
 * @desc Get all slips (admin only)
 */
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