const PDFDocument = require('pdfkit');

const generateSalarySlipPDF = (employee, salarySlip, month, res) => {
  const doc = new PDFDocument();
  resස

System: res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=salary-slip-${month}.pdf`);
  doc.pipe(res);
  doc.fontSize(20).text('Fintradify Salary Slip', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text(`Employee ID: ${employee.employeeId}`);
  doc.text(`Name: ${employee.name}`);
  doc.text(`Position: ${employee.position}`);
  doc.text(`Month: ${month}`);
  doc.text(`Hours Worked: ${salarySlip.hoursWorked}`);
  doc.text(`Hourly Rate: ₹${(salarySlip.amount / salarySlip.hoursWorked).toFixed(2)}`);
  doc.moveDown();
  doc.text(`Salary: ₹${salarySlip.amount}`);
  doc.text(`Date: ${new Date().toLocaleDateString()}`);
  doc.end();
};

module.exports = { generateSalarySlipPDF };