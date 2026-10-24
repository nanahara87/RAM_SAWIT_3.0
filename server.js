'use strict';
const path = require('node:path');
const { createAppServer } = require('./server-core');
const port = Number(process.env.PORT || 10000);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const appServer = createAppServer({ port, dataDir, publicDir: path.join(__dirname, 'public'), cloudMode: true });
appServer.listen(port, '0.0.0.0').then(({port: actual}) => {
  console.log(`RAM Sawit API/web aktif pada port ${actual}`);
  console.log(`Data persisten: ${dataDir}`);
  console.log('Buka alamat layanan untuk membuat akun administrator pertama kali.');
}).catch(err => { console.error('Server RAM Sawit gagal dimulai:', err); process.exit(1); });
process.on('SIGTERM', async()=>{await appServer.close();process.exit(0);});
process.on('SIGINT', async()=>{await appServer.close();process.exit(0);});
