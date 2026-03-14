const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const FILE_PATH = path.join(__dirname, 'connections.json');

function getConnections() {
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify([], null, 2));
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveConnections(connections) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(connections, null, 2));
}

function addConnection(data) {
  const connections = getConnections();
  const cleanId = String(data.adAccountId).replace(/[^0-9]/g, "");
  
  // Check if account already exists
  const existingIdx = connections.findIndex(c => String(c.adAccountId).replace(/[^0-9]/g, "") === cleanId);
  
  if (existingIdx > -1) {
    // Update token and name if it already exists
    connections[existingIdx].metaToken = data.metaToken;
    connections[existingIdx].name = data.name;
    if (data.sheetId) connections[existingIdx].sheetId = data.sheetId;
    saveConnections(connections);
    return connections[existingIdx];
  }

  const next = {
    id: uuidv4(),
    ...data,
    adAccountId: cleanId,
    active: true
  };
  connections.push(next);
  saveConnections(connections);
  return next;
}

function updateConnection(id, data) {
  const connections = getConnections();
  const idx = connections.findIndex(c => c.id === id);
  if (idx > -1) {
    connections[idx] = { ...connections[idx], ...data };
    saveConnections(connections);
    return connections[idx];
  }
  return null;
}

function deleteConnection(id) {
  const connections = getConnections();
  const filtered = connections.filter(c => c.id !== id);
  saveConnections(filtered);
}

module.exports = { getConnections, addConnection, updateConnection, deleteConnection };
