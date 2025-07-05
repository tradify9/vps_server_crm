const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const { sendEmail } = require('../utils/sendEmail');

router.get('/my-tasks', auth, async (req, res) => {
  try {
    console.log('Fetching tasks for user:', req.user.id);
    const tasks = await Task.find({ employee: req.user.id })
      .populate('employee', 'employeeId name email')
      .sort({ createdAt: -1 });
    console.log('Tasks fetched:', tasks);
    res.json(tasks || []);
  } catch (err) {
    console.error('Fetch tasks error:', err);
    res.status(500).json({ message: 'Server error while fetching tasks' });
  }
});

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    console.error('Unauthorized task creation by user:', req.user.id);
    return res.status(403).json({ message: 'Unauthorized' });
  }
  const { title, description, employeeId } = req.body;
  try {
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      console.error('Employee not found:', employeeId);
      return res.status(404).json({ message: 'Employee not found' });
    }

    const task = new Task({
      title,
      description,
      employee: employeeId,
    });
    await task.save();
    const populatedTask = await Task.findById(task._id)
      .populate('employee', 'employeeId name email');
    await sendEmail(employee.email, 'New Task Assigned', `Task: ${title}\nDescription: ${description}`);
    console.log('Task created:', populatedTask);
    res.json(populatedTask);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ message: 'Server error while creating task' });
  }
});

router.put('/:id', auth, async (req, res) => {
  const { status } = req.body;
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      console.error('Task not found:', req.params.id);
      return res.status(404).json({ message: 'Task not found' });
    }
    if (req.user.role !== 'admin' && task.employee.toString() !== req.user.id) {
      console.error('Unauthorized task update by user:', req.user.id);
      return res.status(403).json({ message: 'Unauthorized' });
    }

    task.status = status || task.status;
    await task.save();
    const populatedTask = await Task.findById(task._id)
      .populate('employee', 'employeeId name email');
    console.log('Task updated:', populatedTask);
    res.json(populatedTask);
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ message: 'Server error while updating task' });
  }
});

module.exports = router;