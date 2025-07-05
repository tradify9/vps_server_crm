const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Employee = require('./models/Employee');
require('dotenv').config();

// Fix Mongoose strictQuery deprecation warning
mongoose.set('strictQuery', true);

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const adminExists = await Employee.findOne({ email: 'admin@fintradify.com' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await Employee.create({
        employeeId: 'ADMIN001',
        name: 'Admin User',
        email: 'admin@fintradify.com',
        password: hashedPassword,
        phone: '1234567890',
        position: 'Admin',
        role: 'admin',
      });
      console.log('Admin user created');
    }
    mongoose.disconnect();
  })
  .catch(err => console.log(err));