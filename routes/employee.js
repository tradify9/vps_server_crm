
const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const SalarySlip = require('../models/SalarySlip');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('../utils/sendEmail');

const generateEmployeeId = async () => {
  let employeeId;
  let isUnique = false;
  while (!isUnique) {
    const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit number
    employeeId = `TRD${randomNum}`;
    const existing = await Employee.findOne({ employeeId });
    if (!existing) isUnique = true;
  }
  return employeeId;
};

router.get('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
  try {
    const employees = await Employee.find();
    const employeesWithSalary = await Promise.all(
      employees.map(async (emp) => {
        const latestSalary = await SalarySlip.findOne({ employee: emp._id })
          .sort({ month: -1 });
        return {
          ...emp._doc,
          salary: latestSalary ? latestSalary.amount : 'N/A',
        };
      })
    );
    res.json(employeesWithSalary);
  } catch (err) {
    console.error('Fetch employees error:', err);
    res.status(500).json({ message: 'Server error while fetching employees' });
  }
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
  const { name, email, phone, position, salary } = req.body;
  try {
    let employee = await Employee.findOne({ email });
    if (employee) return res.status(400).json({ message: 'Employee already exists' });

    const employeeId = await generateEmployeeId();
    const password = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(password, 10);

    employee = new Employee({
      employeeId,
      name,
      email,
      phone,
      position,
      password: hashedPassword,
      role: 'employee',
    });

    await employee.save();

    // Create salary slip if salary is provided
    if (salary && !isNaN(salary) && salary > 0) {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const salarySlip = new SalarySlip({
        employee: employee._id,
        month: currentMonth,
        amount: parseFloat(salary),
        hoursWorked: 160,
      });
      await salarySlip.save();
    }

    // ✅ Professional Email Template with Portal Link
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="color: #007bff; text-align: center;">🎉 Welcome to Fintradify</h2>
        <p>Dear <strong>${name}</strong>,</p>
        <p>Your employee account has been successfully created.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Employee ID</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${employeeId}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Email</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${email}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Password</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${password}</td>
          </tr>
        </table>
        <p style="margin-top: 20px;">Please use these credentials to log in to the <strong>Fintradify Employee Portal</strong>.</p>
        <p style="text-align: center; margin: 20px 0;">
          <a href="https://careersachiever.com/" style="background-color:#007bff; color:#fff; padding: 10px 20px; border-radius: 5px; text-decoration:none; font-weight:bold;">
            🔗 Go to Employee Portal
          </a>
        </p>
        <p style="margin-top: 20px; font-size: 14px; color: #666; text-align: center;">
          🔒 This is a system-generated email. Do not share your credentials with anyone.
        </p>
      </div>
    `;

    await sendEmail(email, '🎉 Fintradify Account Created', htmlContent);

    res.json({ ...employee._doc, salary: salary || 'N/A' });
  } catch (err) {
    console.error('Add employee error:', err);
    res.status(500).json({ message: 'Server error while adding employee' });
  }
});

router.put('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
  const { name, email, phone, position, password, salary } = req.body;
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    employee.name = name || employee.name;
    employee.email = email || employee.email;
    employee.phone = phone || employee.phone;
    employee.position = position || employee.position;
    if (password) employee.password = await bcrypt.hash(password, 10);

    await employee.save();

    if (salary !== undefined && !isNaN(salary) && salary >= 0) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      let salarySlip = await SalarySlip.findOne({
        employee: employee._id,
        month: currentMonth,
      });
      if (salarySlip) {
        salarySlip.amount = parseFloat(salary);
        salarySlip.hoursWorked = 160;
        await salarySlip.save();
      } else if (salary > 0) {
        salarySlip = new SalarySlip({
          employee: employee._id,
          month: currentMonth,
          amount: parseFloat(salary),
          hoursWorked: 160,
        });
        await salarySlip.save();
      }
    }

    const latestSalary = await SalarySlip.findOne({ employee: employee._id }).sort({ month: -1 });
    res.json({ ...employee._doc, salary: latestSalary ? latestSalary.amount : 'N/A' });
  } catch (err) {
    console.error('Update employee error:', err);
    res.status(500).json({ message: 'Server error while updating employee' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Unauthorized' });
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    await employee.remove();
    res.json({ message: 'Employee deleted' });
  } catch (err) {
    console.error('Delete employee error:', err);
    res.status(500).json({ message: 'Server error while deleting employee' });
  }
});

router.get('/profile', auth, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user.id);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    const latestSalary = await SalarySlip.findOne({ employee: employee._id }).sort({ month: -1 });
    res.json({ ...employee._doc, salary: latestSalary ? latestSalary.amount : 'N/A' });
  } catch (err) {
    console.error('Fetch profile error:', err);
    res.status(500).json({ message: 'Server error while fetching profile' });
  }
});

module.exports = router;
