#!/usr/bin/env node

// Cross-platform preinstall script
// Removes package-lock.json and yarn.lock
// Ensures pnpm is being used

const fs = require('fs');
const path = require('path');

// Remove package-lock.json if it exists
const packageLockPath = path.join(process.cwd(), 'package-lock.json');
if (fs.existsSync(packageLockPath)) {
  fs.unlinkSync(packageLockPath);
  console.log('Removed package-lock.json');
}

// Remove yarn.lock if it exists
const yarnLockPath = path.join(process.cwd(), 'yarn.lock');
if (fs.existsSync(yarnLockPath)) {
  fs.unlinkSync(yarnLockPath);
  console.log('Removed yarn.lock');
}

// Check if pnpm is being used
const userAgent = process.env.npm_config_user_agent || '';
if (!userAgent.includes('pnpm')) {
  console.error('Error: Use pnpm instead of npm or yarn');
  process.exit(1);
}

console.log('Preinstall check passed');
