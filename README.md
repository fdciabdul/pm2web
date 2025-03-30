# Dark Pink PM2 Dashboard - Setup Guide

A beautiful, dark pink-themed PM2 web UI with real-time updates using Socket.IO. This dashboard allows you to monitor and control your PM2 processes with a stylish interface.

## Features

- **Real-time Updates**: Uses Socket.IO for live process stats and streaming logs
- **Dark Pink Theme**: Modern, eye-friendly dark UI with pink accents
- **Grid Layout**: Card-based design for processes instead of traditional tables
- **Progress Bars**: Visual CPU and memory usage indicators
- **Advanced Log Viewer**: 
  - Real-time log streaming
  - Search functionality
  - Log type filtering (errors, warnings, info)
  - Configurable buffer size
  - Auto-scroll toggle
  - Keyboard shortcuts
  - Log download feature
- **Responsive Design**: Works on both desktop and mobile devices

## Installation


```bash
git clone https://github.com/fdciabdul/pm2web
cd pm2-web-ui
npm install
npm start
```


## Running the Application

Start the application in development mode:

```bash
npm run dev
```

For production:

```bash
npm start
```

Access the dashboard at: http://localhost:3000

## Keyboard Shortcuts (Log View)

- **Ctrl+P**: Pause/resume log streaming
- **Ctrl+L**: Clear logs
- **Ctrl+S**: Download logs
- **Esc**: Focus search box

## How It Works

### Real-time Process Updates

1. The server polls PM2 every 5 seconds for updated process information
2. Socket.IO broadcasts this info to all connected clients
3. The client-side JavaScript updates the UI without page refresh

### Log Streaming

1. When a user visits a process's logs page, Socket.IO establishes a connection
2. The server spawns a PM2 logs process with the `--raw` flag for that specific process
3. Log data is streamed to the client in real-time
4. The client formats and displays logs with proper syntax highlighting
5. Users can pause/resume the stream, filter logs, and search for specific text

## Customization

The color scheme can be easily customized by modifying the CSS variables in both templates:

```css
:root {
  --primary-color: #FF36AB;
  --primary-dark: #D9097C;
  --primary-light: #FF70C7;