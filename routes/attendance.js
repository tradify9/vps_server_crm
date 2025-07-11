const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const SalarySlip = require('../models/SalarySlip');
const auth = require('../middleware/auth');
const { createObjectCsvStringifier } = require('csv-writer');
const moment = require('moment-timezone');

// भारतीय समयक्षेत्र (IST) सेट करें
const TIMEZONE = 'Asia/Kolkata';

// पंच इन/आउट रिकॉर्ड करें
router.post('/punch', auth, async (req, res) => {
  const { type } = req.body;
  try {
    // IST में आज की शुरुआत और अंत
    const todayStart = moment().tz(TIMEZONE).startOf('day').toDate();
    const todayEnd = moment().tz(TIMEZONE).endOf('day').toDate();

    const existingAttendance = await Attendance.findOne({
      employee: req.user.id,
      date: { $gte: todayStart, $lte: todayEnd },
    });

    // IST में वर्तमान समय
    const currentTime = moment().tz(TIMEZONE).toDate();

    if (type === 'in') {
      if (existingAttendance && existingAttendance.punchIn) {
        return res.status(400).json({ message: 'आज आप पहले ही पंच इन कर चुके हैं' });
      }
      
      const attendance = new Attendance({
        employee: req.user.id,
        date: currentTime,
        punchIn: currentTime
      });
      
      await attendance.save();
      res.json({ 
        message: 'पंच-इन सफलतापूर्वक दर्ज किया गया',
        attendance: {
          ...attendance.toObject(),
          date: moment(attendance.date).tz(TIMEZONE).format('YYYY-MM-DD'),
          punchIn: moment(attendance.punchIn).tz(TIMEZONE).format('HH:mm:ss'),
          punchOut: attendance.punchOut ? moment(attendance.punchOut).tz(TIMEZONE).format('HH:mm:ss') : null
        }
      });
    } else if (type === 'out') {
      if (!existingAttendance) {
        return res.status(400).json({ message: 'आज के लिए कोई पंच-इन रिकॉर्ड नहीं मिला' });
      }
      if (existingAttendance.punchOut) {
        return res.status(400).json({ message: 'आज आप पहले ही पंच आउट कर चुके हैं' });
      }
      
      // पंच आउट समय पंच इन से पहले नहीं हो सकता
      if (existingAttendance.punchIn && currentTime < existingAttendance.punchIn) {
        return res.status(400).json({ message: 'पंच आउट समय पंच इन से पहले नहीं हो सकता' });
      }

      existingAttendance.punchOut = currentTime;
      await existingAttendance.save();
      
      res.json({ 
        message: 'पंच-आउट सफलतापूर्वक दर्ज किया गया',
        attendance: {
          ...existingAttendance.toObject(),
          date: moment(existingAttendance.date).tz(TIMEZONE).format('YYYY-MM-DD'),
          punchIn: moment(existingAttendance.punchIn).tz(TIMEZONE).format('HH:mm:ss'),
          punchOut: moment(existingAttendance.punchOut).tz(TIMEZONE).format('HH:mm:ss')
        }
      });
    } else {
      return res.status(400).json({ message: 'अमान्य पंच प्रकार' });
    }
  } catch (err) {
    console.error('पंच त्रुटि:', {
      error: err.message,
      stack: err.stack,
      timestamp: moment().tz(TIMEZONE).format()
    });
    res.status(500).json({ message: 'पंच रिकॉर्ड करने में सर्वर त्रुटि' });
  }
});

// सभी अटेंडेंस रिकॉर्ड्स प्राप्त करें (एडमिन के लिए)
router.get('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'अनधिकृत' });
  
  const { startDate, endDate } = req.query;
  try {
    // IST समयक्षेत्र में दिनांक पार्स करें
    const start = startDate ? moment.tz(startDate, TIMEZONE).startOf('day').toDate() : null;
    const end = endDate ? moment.tz(endDate, TIMEZONE).endOf('day').toDate() : null;
    
    const query = start && end ? { date: { $gte: start, $lte: end } } : {};
    
    const attendances = await Attendance.find(query)
      .populate('employee', 'employeeId name hourlyRate')
      .lean();
    
    // IST में समय प्रारूपित करें
    const formattedAttendances = attendances.map(att => {
      const punchIn = att.punchIn ? moment(att.punchIn).tz(TIMEZONE).format('HH:mm:ss') : '-';
      const punchOut = att.punchOut ? moment(att.punchOut).tz(TIMEZONE).format('HH:mm:ss') : '-';
      
      let hoursWorked = '0.00';
      if (att.punchIn && att.punchOut) {
        const duration = moment.duration(moment(att.punchOut).diff(moment(att.punchIn)));
        hoursWorked = (duration.asHours()).toFixed(2);
      }
      
      const hourlyRate = att.employee?.hourlyRate || 0;
      const totalSalary = (parseFloat(hoursWorked) * hourlyRate).toFixed(2);
      
      return {
        ...att,
        employeeId: att.employee?.employeeId || 'N/A',
        name: att.employee?.name || 'N/A',
        date: moment(att.date).tz(TIMEZONE).format('YYYY-MM-DD'),
        punchIn,
        punchOut,
        hoursWorked,
        hourlyRate,
        totalSalary
      };
    });
    
    res.json(formattedAttendances);
  } catch (err) {
    console.error('अटेंडेंस प्राप्त करने में त्रुटि:', err);
    res.status(500).json({ message: 'अटेंडेंस प्राप्त करने में सर्वर त्रुटि' });
  }
});

// वर्तमान उपयोगकर्ता का अटेंडेंस डेटा प्राप्त करें
router.get('/my-attendance', auth, async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    // IST समयक्षेत्र में दिनांक पार्स करें
    const start = startDate ? moment.tz(startDate, TIMEZONE).startOf('day').toDate() : null;
    const end = endDate ? moment.tz(endDate, TIMEZONE).endOf('day').toDate() : null;
    
    const query = { 
      employee: req.user.id,
      ...(start && end && { date: { $gte: start, $lte: end } })
    };
    
    const attendances = await Attendance.find(query)
      .populate('employee', 'employeeId name hourlyRate')
      .lean();
    
    // IST में समय प्रारूपित करें
    const formattedAttendances = attendances.map(att => {
      const punchIn = att.punchIn ? moment(att.punchIn).tz(TIMEZONE).format('HH:mm:ss') : '-';
      const punchOut = att.punchOut ? moment(att.punchOut).tz(TIMEZONE).format('HH:mm:ss') : '-';
      
      let hoursWorked = '0.00';
      if (att.punchIn && att.punchOut) {
        const duration = moment.duration(moment(att.punchOut).diff(moment(att.punchIn)));
        hoursWorked = (duration.asHours()).toFixed(2);
      }
      
      const hourlyRate = att.employee?.hourlyRate || 0;
      const totalSalary = (parseFloat(hoursWorked) * hourlyRate).toFixed(2);
      
      return {
        ...att,
        date: moment(att.date).tz(TIMEZONE).format('YYYY-MM-DD'),
        punchIn,
        punchOut,
        hoursWorked,
        hourlyRate,
        totalSalary
      };
    });
    
    res.json(formattedAttendances);
  } catch (err) {
    console.error('अटेंडेंस प्राप्त करने में त्रुटि:', err);
    res.status(500).json({ message: 'अटेंडेंस प्राप्त करने में सर्वर त्रुटि' });
  }
});

// अटेंडेंस ओवरव्यू (एडमिन के लिए)
router.get('/overview', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'अनधिकृत' });
  
  try {
    const attendances = await Attendance.find()
      .populate('employee', 'employeeId name')
      .sort({ date: -1 })
      .lean();
    
    const overview = attendances.reduce((acc, att) => {
      const date = moment(att.date).tz(TIMEZONE).format('YYYY-MM-DD');
      if (!acc[date]) acc[date] = [];
      
      const punchIn = att.punchIn ? moment(att.punchIn).tz(TIMEZONE).format('HH:mm:ss') : '-';
      const punchOut = att.punchOut ? moment(att.punchOut).tz(TIMEZONE).format('HH:mm:ss') : '-';
      
      let hoursWorked = '0.00';
      if (att.punchIn && att.punchOut) {
        const duration = moment.duration(moment(att.punchOut).diff(moment(att.punchIn)));
        hoursWorked = (duration.asHours()).toFixed(2);
      }
      
      acc[date].push({
        employeeId: att.employee?.employeeId || 'N/A',
        name: att.employee?.name || 'N/A',
        punchIn,
        punchOut,
        hoursWorked
      });
      
      return acc;
    }, {});
    
    res.json(overview);
  } catch (err) {
    console.error('ओवरव्यू प्राप्त करने में त्रुटि:', err);
    res.status(500).json({ message: 'ओवरव्यू प्राप्त करने में सर्वर त्रुटि' });
  }
});

// CSV डाउनलोड (एडमिन के लिए)
router.get('/download', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'अनधिकृत' });
  
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'प्रारंभ और समाप्ति तिथि आवश्यक है' });
  }
  
  try {
    // IST समयक्षेत्र में दिनांक पार्स करें
    const start = moment.tz(startDate, TIMEZONE).startOf('day').toDate();
    const end = moment.tz(endDate, TIMEZONE).endOf('day').toDate();
    
    const attendances = await Attendance.find({
      date: { $gte: start, $lte: end }
    }).populate('employee', 'employeeId name hourlyRate');
    
    if (!attendances.length) {
      return res.status(404).json({ message: 'चयनित तिथि सीमा में कोई अटेंडेंस रिकॉर्ड नहीं मिला' });
    }
    
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'employeeId', title: 'कर्मचारी ID' },
        { id: 'name', title: 'नाम' },
        { id: 'date', title: 'तिथि' },
        { id: 'punchIn', title: 'पंच इन' },
        { id: 'punchOut', title: 'पंच आउट' },
        { id: 'hoursWorked', title: 'काम किए गए घंटे' },
        { id: 'hourlyRate', title: 'प्रति घंटा दर (₹)' },
        { id: 'totalSalary', title: 'कुल वेतन (₹)' },
      ],
    });
    
    const records = attendances.map(att => {
      const punchIn = att.punchIn ? moment(att.punchIn).tz(TIMEZONE).format('HH:mm:ss') : '-';
      const punchOut = att.punchOut ? moment(att.punchOut).tz(TIMEZONE).format('HH:mm:ss') : '-';
      
      let hoursWorked = '0.00';
      if (att.punchIn && att.punchOut) {
        const duration = moment.duration(moment(att.punchOut).diff(moment(att.punchIn)));
        hoursWorked = (duration.asHours()).toFixed(2);
      }
      
      const hourlyRate = att.employee?.hourlyRate || 0;
      const totalSalary = (parseFloat(hoursWorked) * hourlyRate).toFixed(2);
      
      return {
        employeeId: att.employee?.employeeId || 'N/A',
        name: att.employee?.name || 'N/A',
        date: moment(att.date).tz(TIMEZONE).format('YYYY-MM-DD'),
        punchIn,
        punchOut,
        hoursWorked,
        hourlyRate,
        totalSalary
      };
    });
    
    const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=attendance-${startDate}-${endDate}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error('CSV डाउनलोड त्रुटि:', err);
    res.status(500).json({ message: 'CSV डाउनलोड करने में सर्वर त्रुटि' });
  }
});

// व्यक्तिगत CSV डाउनलोड
router.get('/download/my-attendance', auth, async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'प्रारंभ और समाप्ति तिथि आवश्यक है' });
  }
  
  try {
    // IST समयक्षेत्र में दिनांक पार्स करें
    const start = moment.tz(startDate, TIMEZONE).startOf('day').toDate();
    const end = moment.tz(endDate, TIMEZONE).endOf('day').toDate();
    
    const attendances = await Attendance.find({
      employee: req.user.id,
      date: { $gte: start, $lte: end }
    }).populate('employee', 'employeeId name hourlyRate');
    
    if (!attendances.length) {
      return res.status(404).json({ message: 'चयनित तिथि सीमा में कोई अटेंडेंस रिकॉर्ड नहीं मिला' });
    }
    
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'employeeId', title: 'कर्मचारी ID' },
        { id: 'name', title: 'नाम' },
        { id: 'date', title: 'तिथि' },
        { id: 'punchIn', title: 'पंच इन' },
        { id: 'punchOut', title: 'पंच आउट' },
        { id: 'hoursWorked', title: 'काम किए गए घंटे' },
        { id: 'hourlyRate', title: 'प्रति घंटा दर (₹)' },
        { id: 'totalSalary', title: 'कुल वेतन (₹)' },
      ],
    });
    
    const records = attendances.map(att => {
      const punchIn = att.punchIn ? moment(att.punchIn).tz(TIMEZONE).format('HH:mm:ss') : '-';
      const punchOut = att.punchOut ? moment(att.punchOut).tz(TIMEZONE).format('HH:mm:ss') : '-';
      
      let hoursWorked = '0.00';
      if (att.punchIn && att.punchOut) {
        const duration = moment.duration(moment(att.punchOut).diff(moment(att.punchIn)));
        hoursWorked = (duration.asHours()).toFixed(2);
      }
      
      const hourlyRate = att.employee?.hourlyRate || 0;
      const totalSalary = (parseFloat(hoursWorked) * hourlyRate).toFixed(2);
      
      return {
        employeeId: att.employee?.employeeId || 'N/A',
        name: att.employee?.name || 'N/A',
        date: moment(att.date).tz(TIMEZONE).format('YYYY-MM-DD'),
        punchIn,
        punchOut,
        hoursWorked,
        hourlyRate,
        totalSalary
      };
    });
    
    const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=my-attendance-${startDate}-${endDate}.csv`);
    res.send(csvContent);
  } catch (err) {
    console.error('CSV डाउनलोड त्रुटि:', err);
    res.status(500).json({ message: 'CSV डाउनलोड करने में सर्वर त्रुटि' });
  }
});

module.exports = router;