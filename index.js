// Install required packages:
// npm install express ejs pm2 moment socket.io

const express = require('express');
const path = require('path');
const pm2 = require('pm2');
const moment = require('moment');
const { exec, spawn } = require('child_process');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const port = 3000;

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store active log streams
const activeLogStreams = {};
// Store active connections to processes
const processSubscriptions = {};

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

// Get logs for a specific process - for initial load
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

// Stream logs for a specific process
const streamLogs = (processName, socket) => {
  // Kill any existing stream for this socket and process
  if (activeLogStreams[`${socket.id}:${processName}`]) {
    activeLogStreams[`${socket.id}:${processName}`].kill();
    delete activeLogStreams[`${socket.id}:${processName}`];
  }

  // Create a new log stream
  const logProcess = spawn('pm2', ['logs', processName, '--raw', '--lines', '0']);
  activeLogStreams[`${socket.id}:${processName}`] = logProcess;

  // Stream stdout
  logProcess.stdout.on('data', (data) => {
    socket.emit('log_data', {
      processName,
      data: data.toString()
    });
  });

  // Stream stderr
  logProcess.stderr.on('data', (data) => {
    socket.emit('log_data', {
      processName,
      data: data.toString()
    });
  });

  // Handle process exit
  logProcess.on('close', (code) => {
    console.log(`Log stream for ${processName} closed with code ${code}`);
    delete activeLogStreams[`${socket.id}:${processName}`];
  });

  // Handle errors
  logProcess.on('error', (err) => {
    console.error(`Error in log stream for ${processName}:`, err);
    socket.emit('log_error', {
      processName,
      error: err.message
    });
    delete activeLogStreams[`${socket.id}:${processName}`];
  });

  return logProcess;
};

// Format processes data
const formatProcesses = (processes) => {
  return processes.map(proc => {
    return {
      id: proc.pm_id,
      name: proc.name,
      status: proc.pm2_env.status,
      cpu: proc.monit ? `${proc.monit.cpu.toFixed(1)}%` : 'N/A',
      memory: proc.monit ? `${Math.round(proc.monit.memory / 1024 / 1024)}MB` : 'N/A',
      uptime: proc.pm2_env.pm_uptime ? moment(proc.pm2_env.pm_uptime).fromNow() : 'N/A',
      restarts: proc.pm2_env.restart_time,
      instances: proc.pm2_env.instances || 1
    };
  });
};

// Set up real-time process updates
async function broadcastProcesses() {
  try {
    await connectPM2();
    const processes = await listProcesses();
    const formattedProcesses = formatProcesses(processes);
    pm2.disconnect();
    
    // Broadcast to all clients subscribed to process updates
    Object.keys(processSubscriptions).forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket && processSubscriptions[socketId]) {
        socket.emit('processes_update', formattedProcesses);
      }
    });
    
  } catch (error) {
    console.error('Error broadcasting processes:', error);
  }
}

// Set up periodic updates
setInterval(broadcastProcesses, 5000);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Handle request for process updates subscription
  socket.on('subscribe_processes', () => {
    console.log(`Socket ${socket.id} subscribed to process updates`);
    processSubscriptions[socket.id] = true;
    
    // Send initial data
    broadcastProcesses();
  });

  // Handle request for log streaming
  socket.on('stream_logs', (data) => {
    const { processName } = data;
    console.log(`Socket ${socket.id} requested log stream for ${processName}`);
    
    // Start streaming logs
    streamLogs(processName, socket);
  });

  // Handle stop streaming
  socket.on('stop_stream', (data) => {
    const { processName } = data;
    const streamKey = `${socket.id}:${processName}`;
    
    // Kill the stream if it exists
    if (activeLogStreams[streamKey]) {
      console.log(`Socket ${socket.id} stopped log stream for ${processName}`);
      activeLogStreams[streamKey].kill();
      delete activeLogStreams[streamKey];
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Cleanup any streams this socket was using
    Object.keys(activeLogStreams).forEach(key => {
      if (key.startsWith(`${socket.id}:`)) {
        console.log(`Cleaning up log stream for ${key}`);
        activeLogStreams[key].kill();
        delete activeLogStreams[key];
      }
    });
    
    // Remove from process subscriptions
    delete processSubscriptions[socket.id];
  });
});

// Route for home page
app.get('/', async (req, res) => {
  try {
    await connectPM2();
    const processes = await listProcesses();
    const formattedProcesses = formatProcesses(processes);
    pm2.disconnect();
    
    res.render('index', {
      processes: formattedProcesses,
      title: 'PM2 Dashboard',
      error: null
    });
  } catch (error) {
    console.error('Error:', error);
    res.render('index', {
      processes: [],
      title: 'PM2 Dashboard',
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
      title: `Logs: ${name}`,
      error: null
    });
  } catch (error) {
    console.error('Error:', error);
    res.render('logs', {
      logs: '',
      processName: req.params.name,
      title: `Logs: ${req.params.name}`,
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
      
      // Broadcast updated processes
      setTimeout(broadcastProcesses, 500);
      
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
      
      // Broadcast updated processes
      setTimeout(broadcastProcesses, 500);
      
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
      
      // Broadcast updated processes
      setTimeout(broadcastProcesses, 500);
      
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
      
      // Broadcast updated processes
      setTimeout(broadcastProcesses, 500);
      
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clean up log streams when server shuts down
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  
  // Kill all active log streams
  Object.values(activeLogStreams).forEach(stream => {
    if (stream && typeof stream.kill === 'function') {
      stream.kill();
    }
  });
  
  process.exit(0);
});

// Start the server
http.listen(port, () => {
  console.log(`PM2 Web UI running at http://localhost:${port}`);
});