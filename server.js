const express = require('express');
const axios = require('axios');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const pveApiUrl = process.env.PVE_API_URL;
const pveTokenId = process.env.PVE_TOKEN_ID;
const pveTokenSecret = process.env.PVE_TOKEN_SECRET;
const allowInsecureTls = process.env.PVE_ALLOW_INSECURE_TLS === 'true';

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
    res.json({
      cores: nodes.reduce((total, node) => total + Number(node.maxcpu || 0), 0),
      memoryGb: nodes.reduce((total, node) => total + Number(node.maxmem || 0), 0) / 1024 ** 3,
      nodes: nodes.length,
    });
  } catch (error) {
    console.error('Proxmox capacity failure:', error.message);
    res.status(502).json({ status: 'error', message: 'Unable to reach Proxmox' });
  }
});

app.listen(PORT, () => {
  console.log(`Telemetry backend running on port ${PORT}`);
});
