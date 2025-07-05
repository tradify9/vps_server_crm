const ExcelJS = require('exceljs');

const generateAttendanceExcel = (attendances, res, range) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Attendance');

  worksheet.columns = [
    { header: 'Employee ID', key: 'employeeId', width: 15 },
    { header: 'Name', key: 'name', width: 20 },
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Punch In', key: 'punchIn', width: 15 },
    { header: 'Punch Out', key: 'punchOut', width: 15 },
  ];

  attendances.forEach(att => {
    worksheet.addRow({
      employeeId: att.employee.employeeId,
      name: att.employee.name,
      date: new Date(att.date).toLocaleDateString(),
      punchIn: att.punchIn ? new Date(att.punchIn).toLocaleTimeString() : '',
      punchOut: att.punchOut ? new Date(att.punchOut).toLocaleTimeString() : '',
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=attendance-${range.start}-${range.end}.xlsx`);
  workbook.xlsx.write(res);
};

module.exports = { generateAttendanceExcel };