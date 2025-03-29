// Install required packages:
// npm install express ejs pm2 moment axios

const express = require('express');
const path = require('path');
const pm2 = require('pm2');
const moment = require('moment');
const { exec } = require('child_process');
const app = express();
const port = 3000;

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to PM2
const connectPM2 = () => {
  return new Promise((resolve, reject) => {
    pm2.connect((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

// Get all processes
const listProcesses = () => {
  return new Promise((resolve, reject) => {
    pm2.list((err, list) => {
      if (err) {
        reject(err);
      } else {
        resolve(list);
      }
    });
  });
};

// Get logs for a specific process
const getLogs = (processName, lines = 100) => {
  return new Promise((resolve, reject) => {
    exec(`pm2 logs ${processName} --lines ${lines} --nostream --raw`, (err, stdout, stderr) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout || stderr);
      }
    });
  });
};

// Format processes data
const formatProcesses = (processes) => {
  return processes.map(proc => {
    return {
      id: proc.pm_id,
      name: proc.name,
      status: proc.pm2_env.status,
      cpu: proc.monit ? `${proc.monit.cpu}%` : 'N/A',
      memory: proc.monit ? `${Math.round(proc.monit.memory / 1024 / 1024)}MB` : 'N/A',
      uptime: proc.pm2_env.pm_uptime ? moment(proc.pm2_env.pm_uptime).fromNow() : 'N/A',
      restarts: proc.pm2_env.restart_time,
      instances: proc.pm2_env.instances || 1
    };
  });
};

// Route for home page
app.get('/', async (req, res) => {
  try {
    await connectPM2();
    const processes = await listProcesses();
    const formattedProcesses = formatProcesses(processes);
    pm2.disconnect();
    
    res.render('index', {
      processes: formattedProcesses,
      title: 'PM2 MATRIX CONTROL',
      error: null
    });
  } catch (error) {
    console.error('Error:', error);
    res.render('index', {
      processes: [],
      title: 'PM2 MATRIX CONTROL',
      error: error.message
    });
  }
});

// Route for viewing logs
app.get('/logs/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const logs = await getLogs(name);
    
    res.render('logs', {
      logs,
      processName: name,
      title: `LOGS: ${name}`,
      error: null
    });
  } catch (error) {
    console.error('Error:', error);
    res.render('logs', {
      logs: '',
      processName: req.params.name,
      title: `LOGS: ${req.params.name}`,
      error: error.message
    });
  }
});

// API routes for process management
app.post('/api/restart/:id', async (req, res) => {
  try {
    await connectPM2();
    
    pm2.restart(req.params.id, (err) => {
      pm2.disconnect();
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/stop/:id', async (req, res) => {
  try {
    await connectPM2();
    
    pm2.stop(req.params.id, (err) => {
      pm2.disconnect();
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/start/:id', async (req, res) => {
  try {
    await connectPM2();
    
    pm2.start(req.params.id, (err) => {
      pm2.disconnect();
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/delete/:id', async (req, res) => {
  try {
    await connectPM2();
    
    pm2.delete(req.params.id, (err) => {
      pm2.disconnect();
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`PM2 Web UI running at http://localhost:${port}`);
});