const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const FILE = path.join(__dirname, "users.json");

function read() {
  if (!fs.existsSync(FILE)) return [];
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; }
}

function write(arr) {
  fs.writeFileSync(FILE, JSON.stringify(arr, null, 2));
}

// Returns all users WITHOUT token field
function getAll() {
  return read().map(({ token, ...u }) => u);
}

// Add or update user (matched by fbUserId)
function upsert(data) {
  const arr = read();
  const i = arr.findIndex(u => u.fbUserId === data.fbUserId);
  const now = new Date().toISOString();
  if (i >= 0) {
    arr[i] = { ...arr[i], ...data, updatedAt: now };
    write(arr);
    return arr[i];
  }
  const u = { id: uuidv4(), ...data, addedAt: now };
  arr.push(u);
  write(arr);
  return u;
}

// Get full user record including token
function getById(id) {
  return read().find(u => u.id === id);
}

function remove(id) {
  write(read().filter(u => u.id !== id));
}

module.exports = { getAll, upsert, getById, remove };
