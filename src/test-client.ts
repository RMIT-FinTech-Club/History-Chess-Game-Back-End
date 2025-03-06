// test-client.ts (TypeScript with ES Modules)
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('http://localhost:8000'); // Connect to your server, explicitly typed as Socket

socket.on('connect', () => {
    console.log('Connected to server!');

    socket.on('welcomeMessage', (message: string) => { // Type annotation for message
        console.log('Welcome Message from Server:', message);
    });

    socket.on('messageFromServer', (data: { senderId: string, message: string }) => { // Type annotation for data object
        console.log('Message from Server:', data);
    });

    // Simulate sending a message to the server every 3 seconds
    setInterval(() => {
        const message = `Hello from client at ${new Date().toLocaleTimeString()} (TypeScript)`;
        console.log('Sending message to server:', message);
        socket.emit('messageFromClient', message);
    }, 3000);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

socket.on('connect_error', (err: Error) => { // Type annotation for error
    console.error('Connection Error:', err);
});