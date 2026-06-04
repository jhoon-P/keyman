#!/usr/bin/env node
// ELECTRON_RUN_AS_NODE=1이 시스템에 설정된 경우 Electron이 node 모드로 실행되는 문제를 방지
const { spawn } = require('child_process')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

// Windows에서는 cmd 파일 실행을 위해 shell: true 필요
const child = spawn('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env
})

child.on('close', code => process.exit(code ?? 0))
child.on('error', err => { console.error(err); process.exit(1) })
