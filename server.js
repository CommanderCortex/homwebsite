const express = require('express');
const axios = require('axios');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const pveApiUrl = process.env.PVE_API_URL;
const pveTokenId = process.env.PVE_TOKEN_ID;
const pveTokenSecret = process.env.PVE_TOKEN_SECRET;
const allowInsecureTls = process.env.PVE_ALLOW_INSECURE_TLS === 'true';

function getNumericSetting(name, fallback, minimum = 0) {
  const value = process.env[name];
  if (value === undefined) return fallback;

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue < minimum) {
    throw new Error(`${name} must be a number greater than or equal to ${minimum}`);
  }
  return parsedValue;
}

const hostSpecs = {
  cpuCount: getNumericSetting('HOST_CPU_COUNT', 4, 1),
  cpuModel: process.env.HOST_CPU_MODEL || 'Intel Xeon 6 6732P',
  cores: getNumericSetting('HOST_TOTAL_CORES', 128, 1),
  memoryGb: getNumericSetting('HOST_MEMORY_GB', 1024, 1),
  memoryUsedGb: getNumericSetting('HOST_MEMORY_USED_GB', 25),
  memoryType: process.env.HOST_MEMORY_TYPE || 'ECC DDR5',
  os: process.env.HOST_OS || 'Proxmox',
  load: getNumericSetting('HOST_LOAD', 0.14),
  nodes: 1,
};

if (!pveApiUrl || !pveTokenId || !pveTokenSecret) {
  console.warn('PVE_API_URL, PVE_TOKEN_ID, and PVE_TOKEN_SECRET must be set for Proxmox telemetry.');
}

const httpsAgent = new https.Agent({ rejectUnauthorized: !allowInsecureTls });

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

function proxmoxRequest(path) {
  if (!pveApiUrl || !pveTokenId || !pveTokenSecret) {
    throw new Error('Proxmox environment variables are not configured');
  }

  return axios.get(`${pveApiUrl.replace(/\/$/, '')}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `PVEAPIToken=${pveTokenId}=${pveTokenSecret}`,
    },
    httpsAgent,
    timeout: 10000,
  });
}

// Serve static frontend assets from the current directory
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});


app.get('/api/telemetry', async (req, res) => {
  try {
    const response = await proxmoxRequest('/nodes');
    const nodesData = response.data.data || [];
    res.json({
      status: 'success',
      nodes: nodesData.map((node) => ({
        name: node.node,
        status: node.status,
        cpu: Math.round((node.cpu || 0) * 100),
        memory: node.maxmem ? Math.round((node.mem / node.maxmem) * 100) : 0,
        uptime: node.uptime || 0,
      })),
    });
  } catch (error) {
    console.error('Proxmox communication failure:', error.message);
    res.status(502).json({ status: 'error', message: 'Unable to reach Proxmox' });
  }
});

app.get('/api/host-capacity', async (req, res) => {
  try {
    const response = await proxmoxRequest('/nodes');
    const nodes = response.data.data || [];
    const usedMemoryBytes = nodes.reduce((total, node) => total + Number(node.mem || 0), 0);
    const hasReportedMemoryUse = nodes.some((node) => node.mem !== undefined && node.mem !== null);
    const memoryUsedGb = hasReportedMemoryUse
      ? Math.min(Math.max(usedMemoryBytes / 1024 ** 3, 0), hostSpecs.memoryGb)
      : hostSpecs.memoryUsedGb;

    res.json({
      ...hostSpecs,
      memoryUsedGb,
      source: nodes.length ? 'proxmox' : 'configured',
    });
  } catch (error) {
    console.error('Proxmox capacity failure:', error.message);
    res.json({
      ...hostSpecs,
      source: 'configured',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Telemetry backend running on port ${PORT}`);
});
