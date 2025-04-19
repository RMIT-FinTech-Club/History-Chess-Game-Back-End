"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// test-client.ts (TypeScript with ES Modules)
var socket_io_client_1 = require("socket.io-client");
var socket = (0, socket_io_client_1.io)('http://localhost:8000'); // Connect to your server, explicitly typed as Socket
socket.on('connect', function () {
    console.log('Connected to server!');
    socket.on('welcomeMessage', function (message) {
        console.log('Welcome Message from Server:', message);
    });
    socket.on('messageFromServer', function (data) {
        console.log('Message from Server:', data);
    });
    // Simulate sending a message to the server every 3 seconds
    setInterval(function () {
        var message = "Hello from client at ".concat(new Date().toLocaleTimeString(), " (TypeScript)");
        console.log('Sending message to server:', message);
        socket.emit('messageFromClient', message);
    }, 3000);
});
socket.on('disconnect', function () {
    console.log('Disconnected from server');
});
socket.on('connect_error', function (err) {
    console.error('Connection Error:', err);
});
