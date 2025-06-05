const io = require("socket.io-client");
const fs = require('fs');
const jwtkn = require('jsonwebtoken');

var SERVER_SECRET;
var HOST_NAME;
var HOST_ADDR;

if (process.env.NODE_ENV !== 'production') {
    // assume we're in dev
    SERVER_SECRET = process.env.SERVER_SECRET || 'blackboard-super-secret-pwd';
    HOST_ADDR = "ws://localhost:8080";
} else {
    SERVER_SECRET = fs.readFileSync(`/run/secrets/server-secret`, 'utf8');
    HOST_NAME = fs.readFileSync(`/run/secrets/nginx-host`, 'utf8');
    HOST_ADDR = 'wss://' + HOST_NAME + ':8080';
}

if(!SERVER_SECRET.length) {
    console.error('Cannot read server secret!')
    process.exit();
}
if(process.argv.length !== 4) {
    console.error('Usage: node admin.js <command> <parameter>');
    console.error('Available commands: message');
    process.exit();
}

const command = process.argv[2];
const param = process.argv[3];

const token = jwtkn.sign({ role: "admin" }, SERVER_SECRET);

console.info('Trying to connect ' + HOST_ADDR);

const socket = io(HOST_ADDR, {
  /*reconnectionDelayMax: 10000,
  auth: {
    token: SERVER_SECRET
  },
  query: {
    message: process.argv[2]
  },*/
  transports: ['websocket']
});

socket.on("connect_error", (err) => {
    console.log(`Connect_error due to ${err.message}`);
    process.exit();
});

socket.on("connect", () => {
    console.info('Websocket connected');
    switch(command) {
        case 'message':
            socket.emit('admin_notification', {
                token: token,
                message: param
            });
            console.info('Admin notification sent.')
            break;
    }
    // Wait 5 seconds so we get the socket message through, then quit
    setTimeout(function() {process.exit();}, 5000);
});