'use strict';
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const { createAppServer, localIPv4s } = require('./server-core');

app.setAppUserModelId('id.ramsawit.desktop');
let mainWindow;
let appServer;
let appUrl='http://127.0.0.1:37851';
function dataDir(){return path.join(app.getPath('userData'),'data');}
function showShareInfo(){const addresses=localIPv4s().map(ip=>`http://${ip}:${new URL(appUrl).port}`);dialog.showMessageBox(mainWindow,{type:'info',title:'Berbagi RAM Sawit di jaringan lokal',message:'Server LAN RAM Sawit sedang berjalan.',detail:`Aplikasi pada komputer ini:\n${appUrl}\n\nAlamat untuk ponsel/komputer lain pada Wi-Fi yang sama:\n${addresses.join('\n')||'(Alamat IP LAN tidak ditemukan)'}\n\nPengguna perangkat lain perlu masuk menggunakan akun administrator RAM Sawit. Jangan teruskan port ini langsung ke internet.`});}
function createMenu(){Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'File',submenu:[{label:'Tampilkan alamat berbagi LAN',click:showShareInfo},{label:'Buka folder data aplikasi',click:()=>shell.openPath(dataDir())},{type:'separator'},{label:'Cetak / Simpan PDF',accelerator:'CmdOrCtrl+P',click:()=>mainWindow?.webContents.executeJavaScript('window.print()')},{type:'separator'},{role:'reload',label:'Muat ulang aplikasi'},{type:'separator'},{role:'quit',label:'Keluar'}]},
  {label:'Tampilan',submenu:[{role:'togglefullscreen',label:'Layar penuh'},{role:'zoomIn',label:'Perbesar'},{role:'zoomOut',label:'Perkecil'},{role:'resetZoom',label:'Ukuran normal'}]},
  {label:'Bantuan',submenu:[{label:'Tentang RAM Sawit',click:()=>dialog.showMessageBox(mainWindow,{type:'info',title:'RAM Sawit',message:'RAM Sawit — Sistem Informasi Usaha',detail:`Versi ${app.getVersion()}\nServer localhost: ${appUrl}\nDatabase tersimpan di folder data aplikasi.\nAplikasi tetap dapat digunakan saat koneksi internet terputus.`})}]}
]));}
function createWindow(){mainWindow=new BrowserWindow({width:1440,height:930,minWidth:900,minHeight:650,show:false,backgroundColor:'#f5f7f5',title:'RAM Sawit — Sistem Informasi Usaha',icon:path.join(__dirname,'public','assets','ram-sawit.ico'),autoHideMenuBar:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});mainWindow.once('ready-to-show',()=>mainWindow.show());mainWindow.loadURL(appUrl);mainWindow.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith('https://'))shell.openExternal(url);return {action:'deny'};});mainWindow.on('closed',()=>{mainWindow=null;});}
app.whenReady().then(async()=>{try{appServer=createAppServer({dataDir:dataDir(),publicDir:path.join(__dirname,'public'),cloudMode:false,port:Number(process.env.RAM_SAWIT_PORT||37851)});const result=await appServer.listen(Number(process.env.RAM_SAWIT_PORT||37851),'0.0.0.0');appUrl=`http://127.0.0.1:${result.port}`;createMenu();createWindow();}catch(e){dialog.showErrorBox('RAM Sawit tidak dapat dijalankan',`Server lokal gagal dimulai. Tutup aplikasi lain yang memakai port 37851–37860 lalu buka kembali.\n\n${e.message}`);app.quit();}app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('before-quit',()=>{if(appServer)appServer.close();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
